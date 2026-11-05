import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import {
  PRICING_CONFIG,
  calculatePeriodEnd,
  getPlanAmountInMinorUnits,
  getPlanPrice,
  getYearlySavings,
  getYearlySavingsPercent,
  listPlanViews,
} from "@jobcopilot/shared";
import { prisma } from "@jobcopilot/db";
import { createApp } from "../src/app.js";
import { parsePaymentWebhook, verifyWebhookSignature } from "../src/services/payments.js";

const app = createApp();

describe("pricing configuration", () => {
  it("keeps the required monthly and yearly prices in one place", () => {
    expect(getPlanPrice("free", "monthly")).toBe(0);
    expect(getPlanPrice("free", "yearly")).toBe(0);
    expect(getPlanPrice("pro", "monthly")).toBe(299);
    expect(getPlanPrice("pro", "yearly")).toBe(2499);
    expect(getPlanPrice("premium", "monthly")).toBe(599);
    expect(getPlanPrice("premium", "yearly")).toBe(4999);
  });

  it("converts whole rupees to provider minor units", () => {
    expect(getPlanAmountInMinorUnits("pro", "monthly")).toBe(29_900);
    expect(getPlanAmountInMinorUnits("pro", "yearly")).toBe(249_900);
    expect(getPlanAmountInMinorUnits("premium", "monthly")).toBe(59_900);
    expect(getPlanAmountInMinorUnits("premium", "yearly")).toBe(499_900);
  });

  it("calculates and exposes yearly savings", () => {
    expect(getYearlySavings("pro")).toBe(299 * 12 - 2499);
    expect(getYearlySavings("premium")).toBe(599 * 12 - 4999);
    expect(getYearlySavingsPercent("pro")).toBeGreaterThanOrEqual(29);
    expect(getYearlySavingsPercent("premium")).toBeGreaterThanOrEqual(29);
    expect(listPlanViews()).toHaveLength(3);
    expect(new Set(PRICING_CONFIG.plans.map((plan) => plan.id)).size).toBe(3);
  });
});

describe("billing period calculation", () => {
  it("adds exactly one calendar month for monthly subscriptions", () => {
    expect(calculatePeriodEnd(new Date("2026-01-15T10:00:00.000Z"), "monthly").toISOString()).toBe(
      "2026-02-15T10:00:00.000Z",
    );
  });

  it("clamps month-end dates instead of overflowing", () => {
    expect(calculatePeriodEnd(new Date("2026-01-31T00:00:00.000Z"), "monthly").toISOString()).toBe(
      "2026-02-28T00:00:00.000Z",
    );
  });

  it("adds twelve months for yearly subscriptions", () => {
    expect(calculatePeriodEnd(new Date("2026-11-05T00:00:00.000Z"), "yearly").toISOString()).toBe(
      "2027-11-05T00:00:00.000Z",
    );
  });

  it("handles leap-day yearly renewals safely", () => {
    expect(calculatePeriodEnd(new Date("2028-02-29T00:00:00.000Z"), "yearly").toISOString()).toBe(
      "2029-02-28T00:00:00.000Z",
    );
  });
});

describe("payment webhook verification", () => {
  const secret = "test_webhook_secret";
  const body = Buffer.from(
    JSON.stringify({
      id: "evt_test",
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: "pay_test",
            order_id: "order_test",
            amount: 29_900,
            currency: "INR",
            status: "captured",
            notes: { transactionId: "tx_test" },
          },
        },
      },
    }),
  );
  const signature = createHmac("sha256", secret).update(body).digest("hex");

  it("accepts a valid HMAC signature", () => {
    expect(verifyWebhookSignature(body, signature, secret)).toBe(true);
  });

  it("rejects missing, malformed, or mismatched signatures", () => {
    expect(verifyWebhookSignature(body, undefined, secret)).toBe(false);
    expect(verifyWebhookSignature(body, "not-a-signature", secret)).toBe(false);
    expect(verifyWebhookSignature(body, signature, "different_secret")).toBe(false);
  });

  it("normalizes captured and failed payment events", () => {
    const event = parsePaymentWebhook(body);
    expect(event).not.toBeNull();
    expect(event?.succeeded).toBe(true);
    expect(event?.paymentId).toBe("pay_test");
    expect(event?.orderId).toBe("order_test");
    expect(event?.amount).toBe(29_900);

    const failed = parsePaymentWebhook(
      Buffer.from(
        JSON.stringify({
          event: "payment.failed",
          payload: {
            payment: {
              entity: { id: "pay_failed", order_id: "order_test", amount: 29_900, currency: "INR", status: "failed" },
            },
          },
        }),
      ),
    );
    expect(failed?.failed).toBe(true);
    expect(failed?.succeeded).toBe(false);
  });

  it("normalizes Razorpay Payment Link paid events", () => {
    const linkEvent = parsePaymentWebhook(
      Buffer.from(
        JSON.stringify({
          event: "payment_link.paid",
          payload: {
            payment_link: {
              entity: {
                id: "plink_test",
                reference_id: "tx_link_test",
                amount: 249_900,
                currency: "INR",
                status: "paid",
              },
            },
          },
        }),
      ),
    );
    expect(linkEvent?.succeeded).toBe(true);
    expect(linkEvent?.referenceId).toBe("tx_link_test");
    expect(linkEvent?.amount).toBe(249_900);
    expect(linkEvent?.eventType).toBe("payment_link.paid");
  });
});

const integrationEnabled =
  process.env.RUN_BILLING_INTEGRATION === "1" && Boolean(process.env.DATABASE_URL);
const describeDb = integrationEnabled ? describe : describe.skip;

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
}

describeDb("monthly/yearly subscription flow", () => {
  const createdUsers: string[] = [];

  afterEach(async () => {
    for (const userId of createdUsers.splice(0)) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
  });

  function headers(user: string) {
    return { "x-dev-user-id": user };
  }

  it("activates, cancels, and resumes a monthly Pro subscription", async () => {
    const user = `billing-monthly-${Date.now()}`;
    createdUsers.push(user);

    const checkout = await request(app)
      .post("/api/billing/checkout")
      .set(headers(user))
      .send({ planId: "pro", interval: "monthly" });
    expect(checkout.status).toBe(201);
    expect(checkout.body.checkout.provider).toBe("mock");
    expect(checkout.body.checkout.amount).toBe(29_900);
    expect(checkout.body.checkout.currency).toBe("INR");

    const session = await request(app)
      .get(`/api/billing/checkout/${checkout.body.checkout.transactionId}`)
      .set(headers(user));
    expect(session.status).toBe(200);
    expect(session.body.checkout.planName).toBe("Pro");
    expect(session.body.checkout.interval).toBe("monthly");
    expect(session.body.checkout.amount).toBe(29_900);
    expect(session.body.checkout.status).toBe("CREATED");

    const otherUser = `${user}-other`;
    createdUsers.push(otherUser);
    const foreign = await request(app)
      .get(`/api/billing/checkout/${checkout.body.checkout.transactionId}`)
      .set(headers(otherUser));
    expect(foreign.status).toBe(404);

    const confirmed = await request(app)
      .post("/api/billing/mock/confirm")
      .set(headers(user))
      .send({ transactionId: checkout.body.checkout.transactionId });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.currentPlanId).toBe("pro");
    expect(confirmed.body.subscription.billingInterval).toBe("monthly");
    expect(confirmed.body.subscription.status).toBe("ACTIVE");
    const monthlyDays = daysBetween(
      confirmed.body.subscription.startDate,
      confirmed.body.subscription.expirationDate,
    );
    expect(monthlyDays).toBeGreaterThanOrEqual(28);
    expect(monthlyDays).toBeLessThanOrEqual(31);
    expect(confirmed.body.payments[0].status).toBe("PAID");

    const canceled = await request(app).post("/api/billing/cancel").set(headers(user)).send({});
    expect(canceled.status).toBe(200);
    const expiration = canceled.body.subscription.expirationDate;
    expect(canceled.body.subscription.cancelAtPeriodEnd).toBe(true);

    // Cancellation must not remove already-paid access.
    const afterCancel = await request(app).get("/api/billing").set(headers(user));
    expect(afterCancel.status).toBe(200);
    expect(afterCancel.body.currentPlanId).toBe("pro");
    expect(afterCancel.body.subscription.expirationDate).toBe(expiration);

    const resumed = await request(app).post("/api/billing/resume").set(headers(user)).send({});
    expect(resumed.status).toBe(200);
    expect(resumed.body.subscription.cancelAtPeriodEnd).toBe(false);
  });

  it("activates a yearly Premium subscription and rejects duplicate checkout", async () => {
    const user = `billing-yearly-${Date.now()}`;
    createdUsers.push(user);

    const checkout = await request(app)
      .post("/api/billing/checkout")
      .set(headers(user))
      .send({ planId: "premium", interval: "yearly" });
    expect(checkout.status).toBe(201);
    expect(checkout.body.checkout.amount).toBe(499_900);

    const confirmed = await request(app)
      .post("/api/billing/mock/confirm")
      .set(headers(user))
      .send({ transactionId: checkout.body.checkout.transactionId });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.currentPlanId).toBe("premium");
    expect(confirmed.body.subscription.billingInterval).toBe("yearly");
    const yearlyDays = daysBetween(
      confirmed.body.subscription.startDate,
      confirmed.body.subscription.expirationDate,
    );
    expect(yearlyDays).toBeGreaterThanOrEqual(364);
    expect(yearlyDays).toBeLessThanOrEqual(366);

    const duplicate = await request(app)
      .post("/api/billing/checkout")
      .set(headers(user))
      .send({ planId: "premium", interval: "yearly" });
    expect(duplicate.status).toBe(409);
  });

  it("rejects an invalid plan or billing interval before checkout", async () => {
    const user = `billing-invalid-${Date.now()}`;
    createdUsers.push(user);

    const badPlan = await request(app)
      .post("/api/billing/checkout")
      .set(headers(user))
      .send({ planId: "enterprise", interval: "monthly" });
    expect(badPlan.status).toBe(400);

    const badInterval = await request(app)
      .post("/api/billing/checkout")
      .set(headers(user))
      .send({ planId: "pro", interval: "weekly" });
    expect(badInterval.status).toBe(400);

    const freeCheckout = await request(app)
      .post("/api/billing/checkout")
      .set(headers(user))
      .send({ planId: "free", interval: "monthly" });
    expect(freeCheckout.status).toBe(400);
  });
});
