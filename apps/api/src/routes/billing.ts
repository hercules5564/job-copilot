import { Router, type Request } from "express";
import { z } from "zod";
import {
  ChangeBillingIntervalSchema,
  CreateCheckoutSchema,
  PRICING_CONFIG,
  listPlanViews,
} from "@jobcopilot/shared";
import { requireDb, ah } from "../middleware/db.js";
import { validateBody } from "../middleware/validate.js";
import {
  cancelSubscription,
  confirmMockCheckout,
  createCheckout,
  getBillingOverview,
  getCheckoutSession,
  getPaymentHistory,
  resumeSubscription,
  verifyAndProcessWebhook,
} from "../services/billing.js";
import { paymentProviderName } from "../services/payments.js";

const publicBillingRouter = Router();
const billingRouter = Router();

function rawBodyOf(req: Request): Buffer {
  const raw = (req as Request & { rawBody?: Buffer }).rawBody;
  if (raw && raw.length > 0) return raw;
  return Buffer.from(JSON.stringify(req.body ?? {}));
}

/** Public: plan catalogue + display prices (never browser-authoritative). */
publicBillingRouter.get("/plans", (_req, res) => {
  res.json({
    pricing: {
      currency: PRICING_CONFIG.currency,
      currencySymbol: PRICING_CONFIG.currencySymbol,
      yearlySavingsLabel: PRICING_CONFIG.yearlySavingsLabel,
      intervalLabels: PRICING_CONFIG.intervalLabels,
    },
    plans: listPlanViews(),
    paymentProvider: paymentProviderName(),
  });
});

/**
 * Provider webhook. Signature is checked over the raw body before any
 * database write; the route never trusts plan, interval or amount supplied
 * by the caller (it looks up the server-created transaction).
 */
publicBillingRouter.post(
  "/webhook",
  requireDb,
  ah(async (req, res) => {
    const signature =
      (req.headers["x-razorpay-signature"] as string | undefined) ??
      (req.headers["x-webhook-signature"] as string | undefined);
    const result = await verifyAndProcessWebhook(rawBodyOf(req), signature);
    if (!result.ok) {
      res.status(400).json({ error: "Invalid webhook signature", reason: result.reason });
      return;
    }
    res.json({ ok: true, result: result.result ?? null, reason: result.reason ?? null });
  }),
);

billingRouter.use(requireDb);

billingRouter.get(
  "/",
  ah(async (req, res) => {
    res.json(await getBillingOverview(req.userId!));
  }),
);

billingRouter.get(
  "/payments",
  ah(async (req, res) => {
    res.json({ payments: await getPaymentHistory(req.userId!) });
  }),
);

billingRouter.post(
  "/checkout",
  validateBody(CreateCheckoutSchema),
  ah(async (req, res) => {
    const checkout = await createCheckout(req.userId!, req.body);
    res.status(201).json({ checkout });
  }),
);

billingRouter.get(
  "/checkout/:transactionId",
  ah(async (req, res) => {
    res.json({ checkout: await getCheckoutSession(req.userId!, req.params.transactionId) });
  }),
);

billingRouter.post(
  "/change-plan",
  validateBody(ChangeBillingIntervalSchema),
  ah(async (req, res) => {
    const checkout = await createCheckout(req.userId!, req.body);
    res.status(201).json({
      checkout,
      note: "Plan changes take effect after the new payment is verified.",
    });
  }),
);

billingRouter.post(
  "/cancel",
  ah(async (req, res) => {
    const subscription = await cancelSubscription(req.userId!);
    res.json({ subscription });
  }),
);

billingRouter.post(
  "/resume",
  ah(async (req, res) => {
    const subscription = await resumeSubscription(req.userId!);
    res.json({ subscription });
  }),
);

const MockConfirmSchema = z.object({
  transactionId: z.string().min(1).max(200),
});

/** Development/test only: simulates a verified provider payment. */
billingRouter.post(
  "/mock/confirm",
  validateBody(MockConfirmSchema),
  ah(async (req, res) => {
    const overview = await confirmMockCheckout(req.userId!, req.body.transactionId);
    res.json(overview);
  }),
);

export { publicBillingRouter, billingRouter };
