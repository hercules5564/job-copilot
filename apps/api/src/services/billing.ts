import type {
  PaymentTransaction as PaymentRow,
  Subscription as SubscriptionRow,
} from "@jobcopilot/db";
import { prisma } from "@jobcopilot/db";
import {
  PRICING_CONFIG,
  calculatePeriodEnd,
  getPlanAmountInMinorUnits,
  getPlanPrice,
  getPricingPlan,
  isPaidPlan,
  listPlanViews,
  type BillingInterval,
} from "@jobcopilot/shared";
import { config } from "../config.js";
import { conflict, notFound, serviceUnavailable } from "./errors.js";
import {
  createPaymentOrder,
  isMockPaymentsAllowed,
  isPaymentsConfigured,
  parsePaymentWebhook,
  paymentProviderName,
  verifyWebhookSignature,
  type NormalizedPaymentEvent,
  type PaymentProviderName,
} from "./payments.js";
import { randomUUID } from "node:crypto";

const ACCESS_STATUSES = ["ACTIVE", "CANCELED", "PAST_DUE"] as const;

const INTERVAL_TO_DB = {
  monthly: "MONTHLY",
  yearly: "YEARLY",
} as const;

const DB_TO_INTERVAL: Record<string, BillingInterval> = {
  MONTHLY: "monthly",
  YEARLY: "yearly",
};

export function normalizeInterval(value: string): BillingInterval {
  return value === "YEARLY" ? "yearly" : "monthly";
}

/** Lazily expire terms whose period has ended; access is never implicit. */
async function expireStaleSubscriptions(userId: string): Promise<void> {
  await prisma.subscription.updateMany({
    where: {
      userId,
      status: { in: [...ACCESS_STATUSES] },
      expirationDate: { lte: new Date() },
    },
    data: { status: "EXPIRED", renewalDate: null },
  });
}

export async function getCurrentSubscription(userId: string): Promise<SubscriptionRow | null> {
  await expireStaleSubscriptions(userId);
  return prisma.subscription.findFirst({
    where: {
      userId,
      status: { in: [...ACCESS_STATUSES] },
      expirationDate: { gt: new Date() },
    },
    orderBy: [{ expirationDate: "desc" }, { createdAt: "desc" }],
  });
}

export function serializeSubscription(row: SubscriptionRow) {
  const plan = getPricingPlan(row.planId);
  return {
    id: row.id,
    planId: row.planId,
    planName: plan?.name ?? row.planId,
    billingInterval: DB_TO_INTERVAL[row.billingInterval] ?? "monthly",
    status: row.status,
    startDate: row.startDate.toISOString(),
    expirationDate: row.expirationDate.toISOString(),
    currentPeriodStart: row.currentPeriodStart.toISOString(),
    currentPeriodEnd: row.currentPeriodEnd.toISOString(),
    renewalDate: row.renewalDate?.toISOString() ?? null,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    canceledAt: row.canceledAt?.toISOString() ?? null,
    amount: plan ? getPlanPrice(plan.id, DB_TO_INTERVAL[row.billingInterval] ?? "monthly") : 0,
    currency: PRICING_CONFIG.currency,
  };
}

export function serializePayment(row: PaymentRow) {
  return {
    id: row.id,
    planId: row.planId,
    planName: getPricingPlan(row.planId)?.name ?? row.planId,
    billingInterval: DB_TO_INTERVAL[row.billingInterval] ?? "monthly",
    amount: row.amount,
    currency: row.currency,
    status: row.status,
    provider: row.provider,
    providerOrderId: row.providerOrderId,
    providerPaymentId: row.providerPaymentId,
    paidAt: row.paidAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getBillingOverview(userId: string) {
  const [subscription, payments] = await Promise.all([
    getCurrentSubscription(userId),
    prisma.paymentTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const currentPlanId = subscription?.planId ?? "free";
  const plan = getPricingPlan(currentPlanId) ?? getPricingPlan("free")!;

  return {
    pricing: {
      currency: PRICING_CONFIG.currency,
      currencySymbol: PRICING_CONFIG.currencySymbol,
      yearlySavingsLabel: PRICING_CONFIG.yearlySavingsLabel,
    },
    plans: listPlanViews(),
    subscription: subscription ? serializeSubscription(subscription) : null,
    currentPlanId,
    currentInterval: subscription
      ? DB_TO_INTERVAL[subscription.billingInterval] ?? "monthly"
      : null,
    entitlements: plan.limits,
    paymentsConfigured: isPaymentsConfigured(),
    paymentProvider: paymentProviderName(),
    payments: payments.map(serializePayment),
  };
}

export interface CheckoutResult {
  transactionId: string;
  provider: Exclude<PaymentProviderName, "disabled">;
  orderId: string;
  keyId: string | null;
  checkoutUrl: string | null;
  amount: number;
  currency: string;
  planId: string;
  interval: BillingInterval;
  receipt: string;
  prefill?: { email?: string; name?: string };
}

export async function createCheckout(
  userId: string,
  input: { planId: string; interval: BillingInterval },
): Promise<CheckoutResult> {
  if (!isPaidPlan(input.planId)) {
    throw conflict("The Free plan does not require checkout");
  }
  const plan = getPricingPlan(input.planId);
  if (!plan) throw notFound("Unknown plan");
  if (!isPaymentsConfigured()) {
    throw serviceUnavailable("Payments are not configured on this server");
  }

  const current = await getCurrentSubscription(userId);
  if (
    current &&
    current.planId === input.planId &&
    DB_TO_INTERVAL[current.billingInterval] === input.interval &&
    !current.cancelAtPeriodEnd
  ) {
    throw conflict("You are already subscribed to this plan and interval");
  }

  const amount = getPlanAmountInMinorUnits(input.planId, input.interval);
  const currency = PRICING_CONFIG.currency;
  const receipt = `jp_${Date.now()}_${randomUUID().slice(0, 8)}`;

  const transaction = await prisma.paymentTransaction.create({
    data: {
      userId,
      provider: paymentProviderName(),
      planId: input.planId,
      billingInterval: INTERVAL_TO_DB[input.interval],
      amount,
      currency,
      status: "CREATED",
      receipt,
    },
  });

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });
    const order = await createPaymentOrder({
      amount,
      currency,
      receipt,
      description: `JobPilot ${plan.name} - ${input.interval === "yearly" ? "Yearly" : "Monthly"}`,
      customer: user ? { email: user.email, name: user.name ?? undefined } : undefined,
      notes: {
        transactionId: transaction.id,
        planId: input.planId,
        interval: input.interval,
      },
    });
    await prisma.paymentTransaction.update({
      where: { id: transaction.id },
      data: {
        provider: order.provider,
        providerOrderId: order.orderId,
        providerCheckoutUrl: order.checkoutUrl,
        amount: order.amount,
        currency: order.currency,
      },
    });

    return {
      transactionId: transaction.id,
      provider: order.provider,
      orderId: order.orderId,
      keyId: order.keyId,
      checkoutUrl: order.checkoutUrl,
      amount: order.amount,
      currency: order.currency,
      planId: input.planId,
      interval: input.interval,
      receipt,
      prefill: user ? { email: user.email, name: user.name ?? undefined } : undefined,
    };
  } catch (err) {
    await prisma.paymentTransaction.update({
      where: { id: transaction.id },
      data: {
        status: "FAILED",
        failureReason: "Could not create provider checkout",
      },
    });
    throw err;
  }
}

/**
 * Server-owned checkout session shown on the dedicated /billing/checkout page.
 * The client receives the provider order id and amount only after ownership
 * is verified; it can never override either value.
 */
export async function getCheckoutSession(userId: string, transactionId: string) {
  const transaction = await prisma.paymentTransaction.findFirst({
    where: { id: transactionId, userId },
  });
  if (!transaction) throw notFound("Checkout not found");
  const plan = getPricingPlan(transaction.planId);
  if (!plan) throw notFound("Checkout not found");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });

  return {
    transactionId: transaction.id,
    provider: transaction.provider,
    orderId: transaction.providerOrderId,
    keyId: transaction.provider === "razorpay" ? config.razorpayKeyId : null,
    checkoutUrl: transaction.providerCheckoutUrl,
    amount: transaction.amount,
    currency: transaction.currency,
    planId: transaction.planId,
    planName: plan.name,
    interval: DB_TO_INTERVAL[transaction.billingInterval] ?? "monthly",
    status: transaction.status,
    receipt: transaction.receipt,
    createdAt: transaction.createdAt.toISOString(),
    paidAt: transaction.paidAt?.toISOString() ?? null,
    prefill: user ? { email: user.email, name: user.name ?? undefined } : undefined,
  };
}

export type WebhookResult =
  | { status: "activated" | "extended" | "already_paid"; subscriptionId: string }
  | { status: "failed" | "ignored"; reason: string };

/**
 * Activate or renew a subscription from a provider-verified payment.
 * The transaction row (created by this server) is the source of truth for
 * plan, interval and amount; webhook-supplied notes are never trusted.
 */
export async function processVerifiedPayment(
  event: NormalizedPaymentEvent,
): Promise<WebhookResult> {
  const identifiers: Array<{ providerOrderId: string } | { id: string }> = [];
  if (event.orderId) identifiers.push({ providerOrderId: event.orderId });
  if (event.referenceId) identifiers.push({ id: event.referenceId });
  if (identifiers.length === 0) {
    return { status: "ignored", reason: "missing_transaction_reference" };
  }

  const transaction = await prisma.paymentTransaction.findFirst({
    where: { OR: identifiers },
  });
  if (!transaction) return { status: "ignored", reason: "unknown_transaction" };

  if (transaction.status === "PAID") {
    return {
      status: "already_paid",
      subscriptionId: transaction.subscriptionId ?? "",
    };
  }

  if (event.failed) {
    await prisma.paymentTransaction.update({
      where: { id: transaction.id },
      data: {
        status: "FAILED",
        providerPaymentId: event.paymentId,
        failureReason: event.status || "payment failed",
      },
    });
    return { status: "failed", reason: "provider_declined" };
  }

  if (!event.succeeded) {
    return { status: "ignored", reason: "payment_not_captured" };
  }

  // Amount/currency must match what this server asked the provider to charge.
  if (event.amount !== transaction.amount || event.currency !== transaction.currency) {
    console.warn(
      JSON.stringify({
        level: "warn",
        component: "billing",
        event: "payment_amount_mismatch",
        transactionId: transaction.id,
        expectedAmount: transaction.amount,
        receivedAmount: event.amount,
      }),
    );
    return { status: "ignored", reason: "amount_mismatch" };
  }

  // Idempotency: a provider payment id can activate at most one transaction.
  if (event.paymentId) {
    const alreadyApplied = await prisma.paymentTransaction.findUnique({
      where: { providerPaymentId: event.paymentId },
    });
    if (alreadyApplied && alreadyApplied.id !== transaction.id) {
      return {
        status: "already_paid",
        subscriptionId: alreadyApplied.subscriptionId ?? "",
      };
    }
  }

  const interval = DB_TO_INTERVAL[transaction.billingInterval] ?? "monthly";
  const now = new Date();
  const current = await prisma.subscription.findFirst({
    where: {
      userId: transaction.userId,
      status: { in: ["ACTIVE", "CANCELED", "PAST_DUE"] },
      expirationDate: { gt: now },
    },
    orderBy: { expirationDate: "desc" },
  });

  const isRenewal =
    Boolean(current) &&
    current!.planId === transaction.planId &&
    current!.billingInterval === transaction.billingInterval;

  // Renewals extend from the current paid-through date. Plan/interval changes
  // start a fresh term now; the old term is retained until its own end so
  // access never disappears mid-payment.
  const baseDate = isRenewal ? current!.expirationDate : now;
  const periodEnd = calculatePeriodEnd(baseDate, interval);

  const result = await prisma.$transaction(async (tx) => {
    let subscriptionId: string;

    if (current && isRenewal) {
      const updated = await tx.subscription.update({
        where: { id: current.id },
        data: {
          status: "ACTIVE",
          currentPeriodStart: current.expirationDate,
          currentPeriodEnd: periodEnd,
          expirationDate: periodEnd,
          renewalDate: periodEnd,
          cancelAtPeriodEnd: false,
          canceledAt: null,
          lastPaymentId: event.paymentId,
        },
      });
      subscriptionId = updated.id;
    } else {
      if (current) {
        // Different plan/interval: mark the old term for historical reporting
        // but keep its paid-through date (the new term already covers access).
        await tx.subscription.update({
          where: { id: current.id },
          data: {
            status: "EXPIRED",
            renewalDate: null,
          },
        });
      }
      const created = await tx.subscription.create({
        data: {
          userId: transaction.userId,
          planId: transaction.planId,
          billingInterval: transaction.billingInterval,
          status: "ACTIVE",
          startDate: now,
          expirationDate: periodEnd,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          renewalDate: periodEnd,
          cancelAtPeriodEnd: false,
          provider: transaction.provider,
          lastPaymentId: event.paymentId,
        },
      });
      subscriptionId = created.id;
    }

    await tx.paymentTransaction.update({
      where: { id: transaction.id },
      data: {
        status: "PAID",
        subscriptionId,
        providerPaymentId: event.paymentId,
        paidAt: now,
      },
    });

    return subscriptionId;
  });

  return { status: isRenewal ? "extended" : "activated", subscriptionId: result };
}

export async function verifyAndProcessWebhook(
  rawBody: Buffer | string,
  signature: string | undefined,
): Promise<{ ok: boolean; result?: WebhookResult; reason?: string }> {
  if (paymentProviderName() === "mock") {
    return { ok: false, reason: "mock_provider_has_no_webhook" };
  }
  if (!verifyWebhookSignature(rawBody, signature)) {
    return { ok: false, reason: "invalid_signature" };
  }
  const event = parsePaymentWebhook(rawBody);
  if (!event) return { ok: true, reason: "ignored_event" };
  if (!event.succeeded && !event.failed) {
    return { ok: true, reason: "ignored_event" };
  }
  return { ok: true, result: await processVerifiedPayment(event) };
}

/** Local-development only checkout confirmation (never available in prod). */
export async function confirmMockCheckout(userId: string, transactionId: string) {
  if (paymentProviderName() !== "mock" || !isMockPaymentsAllowed()) {
    throw notFound("Not found");
  }
  const transaction = await prisma.paymentTransaction.findFirst({
    where: { id: transactionId, userId, provider: "mock" },
  });
  if (!transaction) throw notFound("Checkout not found");
  if (transaction.status === "PAID") {
    return getBillingOverview(userId);
  }
  await processVerifiedPayment({
    eventId: `mock_${transaction.id}`,
    eventType: "payment.captured",
    paymentId: `mock_pay_${transaction.id}`,
    orderId: transaction.providerOrderId,
    referenceId: transaction.id,
    amount: transaction.amount,
    currency: transaction.currency,
    status: "captured",
    succeeded: true,
    failed: false,
    notes: {},
  });
  return getBillingOverview(userId);
}

export async function cancelSubscription(userId: string) {
  const current = await getCurrentSubscription(userId);
  if (!current || !isPaidPlan(current.planId)) {
    throw conflict("There is no paid subscription to cancel");
  }
  if (current.cancelAtPeriodEnd) {
    return serializeSubscription(current);
  }
  const updated = await prisma.subscription.update({
    where: { id: current.id },
    data: {
      status: "CANCELED",
      cancelAtPeriodEnd: true,
      canceledAt: new Date(),
      renewalDate: null,
    },
  });
  return serializeSubscription(updated);
}

export async function resumeSubscription(userId: string) {
  const current = await getCurrentSubscription(userId);
  if (!current || !current.cancelAtPeriodEnd) {
    throw conflict("There is no canceled subscription to resume");
  }
  const updated = await prisma.subscription.update({
    where: { id: current.id },
    data: {
      status: "ACTIVE",
      cancelAtPeriodEnd: false,
      canceledAt: null,
      renewalDate: current.expirationDate,
    },
  });
  return serializeSubscription(updated);
}

export async function getPaymentHistory(userId: string) {
  const payments = await prisma.paymentTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return payments.map(serializePayment);
}
