import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { config } from "../config.js";
import { badGateway, HttpError, serviceUnavailable } from "./errors.js";

/**
 * Payment-provider boundary. All checkout amounts come from the server-side
 * pricing config (`@jobcopilot/shared`), never from the browser.
 *
 * "razorpay" is the production provider. "mock" exists only for local
 * development and automated tests; it is refused when NODE_ENV=production.
 */

export type PaymentProviderName = "razorpay" | "mock" | "disabled";

export function paymentProviderName(): PaymentProviderName {
  const value = config.paymentProvider;
  if (value === "razorpay" || value === "mock") return value;
  return "disabled";
}

export function isMockPaymentsAllowed(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  const raw = (process.env.PAYMENT_ALLOW_MOCK ?? "true").toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

export function isPaymentsConfigured(): boolean {
  const provider = paymentProviderName();
  if (provider === "mock") return isMockPaymentsAllowed();
  if (provider === "razorpay") {
    return Boolean(config.razorpayKeyId && config.razorpayKeySecret && config.razorpayWebhookSecret);
  }
  return false;
}

export interface CreatePaymentOrderInput {
  amount: number;
  currency: string;
  receipt: string;
  description: string;
  notes: Record<string, string>;
  customer?: { email?: string; name?: string };
}

export interface PaymentOrder {
  provider: Exclude<PaymentProviderName, "disabled">;
  orderId: string;
  keyId: string | null;
  amount: number;
  currency: string;
  /** Third-party hosted checkout URL (Razorpay Payment Link short_url). */
  checkoutUrl: string | null;
}

interface RazorpayPaymentLinkResponse {
  id?: string;
  amount?: number;
  currency?: string;
  short_url?: string;
  error?: { description?: string };
}

/**
 * Production checkout uses Razorpay Payment Links, which return a real
 * hosted payment page (`short_url`). That URL is owned by Razorpay: card,
 * UPI and bank details never touch JobPilot.
 */
async function createRazorpayPaymentLink(input: CreatePaymentOrderInput): Promise<PaymentOrder> {
  if (!config.razorpayKeyId || !config.razorpayKeySecret) {
    throw serviceUnavailable("Payments are not configured");
  }

  const transactionId = input.notes.transactionId;
  const callbackUrl = `${config.frontendUrl.replace(/\/$/, "")}/billing?checkout=success${
    transactionId ? `&transactionId=${encodeURIComponent(transactionId)}` : ""
  }`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const auth = Buffer.from(`${config.razorpayKeyId}:${config.razorpayKeySecret}`).toString("base64");
    const res = await fetch("https://api.razorpay.com/v1/payment_links", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: input.amount,
        currency: input.currency,
        accept_partial: false,
        reference_id: transactionId ? transactionId.slice(0, 40) : input.receipt.slice(0, 40),
        description: input.description,
        customer: input.customer?.email
          ? { name: input.customer.name ?? undefined, email: input.customer.email }
          : undefined,
        notify: { email: Boolean(input.customer?.email), sms: false },
        reminder_enable: false,
        callback_url: callbackUrl,
        callback_method: "get",
        notes: input.notes,
      }),
      signal: controller.signal,
    });
    const body = (await res.json().catch(() => ({}))) as RazorpayPaymentLinkResponse;
    if (!res.ok || !body.id || !body.short_url) {
      throw badGateway(body.error?.description ?? "Payment provider rejected the checkout");
    }
    if (
      (typeof body.amount === "number" && body.amount !== input.amount) ||
      (body.currency && body.currency !== input.currency)
    ) {
      throw badGateway("Payment provider returned an unexpected amount");
    }
    return {
      provider: "razorpay",
      orderId: body.id,
      keyId: config.razorpayKeyId,
      amount: input.amount,
      currency: input.currency,
      checkoutUrl: body.short_url,
    };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw badGateway("Could not reach the payment provider");
  } finally {
    clearTimeout(timer);
  }
}

export async function createPaymentOrder(input: CreatePaymentOrderInput): Promise<PaymentOrder> {
  const provider = paymentProviderName();
  if (provider === "disabled") {
    throw serviceUnavailable("Payments are not configured");
  }
  if (provider === "mock") {
    if (!isMockPaymentsAllowed()) {
      throw serviceUnavailable("Mock payments are disabled");
    }
    return {
      provider: "mock",
      orderId: `mock_order_${randomUUID()}`,
      keyId: "mock",
      amount: input.amount,
      currency: input.currency,
      checkoutUrl: null,
    };
  }
  return createRazorpayPaymentLink(input);
}

/** Constant-time HMAC-SHA256 webhook signature check (Razorpay scheme). */
export function verifyWebhookSignature(
  rawBody: Buffer | string,
  signature: string | undefined,
  secret: string = config.razorpayWebhookSecret,
): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const received = signature.trim().toLowerCase();
  if (expected.length !== received.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(received, "utf8"));
  } catch {
    return false;
  }
}

export interface NormalizedPaymentEvent {
  eventId: string | null;
  eventType: string;
  paymentId: string | null;
  orderId: string | null;
  /** Payment Link reference_id, used to find our server-created transaction. */
  referenceId: string | null;
  amount: number;
  currency: string;
  status: string;
  succeeded: boolean;
  failed: boolean;
  notes: Record<string, string>;
}

interface RazorpayEntity {
  id?: string;
  order_id?: string;
  amount?: number;
  currency?: string;
  status?: string;
  reference_id?: string;
  short_url?: string;
  notes?: Record<string, string>;
}

interface RazorpayWebhookBody {
  id?: string;
  event?: string;
  payload?: {
    payment?: { entity?: RazorpayEntity };
    order?: { entity?: RazorpayEntity };
    payment_link?: { entity?: RazorpayEntity };
  };
}

/** Normalize a Razorpay webhook (payment + payment-link events). */
export function parsePaymentWebhook(rawBody: Buffer | string): NormalizedPaymentEvent | null {
  let parsed: RazorpayWebhookBody;
  try {
    parsed = JSON.parse(rawBody.toString()) as RazorpayWebhookBody;
  } catch {
    return null;
  }

  const eventType = parsed.event ?? "";
  const payment = parsed.payload?.payment?.entity;
  const order = parsed.payload?.order?.entity;
  const paymentLink = parsed.payload?.payment_link?.entity;
  if (!payment && !order && !paymentLink) return null;

  const status = payment?.status ?? paymentLink?.status ?? "";
  const succeeded =
    eventType === "payment.captured" ||
    eventType === "order.paid" ||
    eventType === "payment_link.paid" ||
    status === "captured" ||
    status === "paid";
  const failed =
    eventType === "payment.failed" ||
    eventType === "payment_link.cancelled" ||
    eventType === "payment_link.expired" ||
    status === "failed" ||
    status === "cancelled" ||
    status === "expired";

  const notes = payment?.notes ?? paymentLink?.notes ?? order?.notes ?? {};

  return {
    eventId: parsed.id ?? null,
    eventType,
    paymentId: payment?.id ?? null,
    orderId: payment?.order_id ?? order?.id ?? null,
    referenceId: notes.transactionId ?? paymentLink?.reference_id ?? null,
    amount: Number(payment?.amount ?? paymentLink?.amount ?? order?.amount ?? 0),
    currency: payment?.currency ?? paymentLink?.currency ?? order?.currency ?? "INR",
    status,
    succeeded,
    failed,
    notes,
  };
}
