import { z } from "zod";

/**
 * Single source of truth for subscription pricing.
 *
 * Both the API and the web client read plan data from here (the API exposes
 * it through GET /api/billing/plans; the client never hardcodes prices).
 * Amounts are whole rupees in this config and converted to the payment
 * provider's smallest unit (paise) only at checkout time.
 */

export const BillingIntervalSchema = z.enum(["monthly", "yearly"]);
export type BillingInterval = z.infer<typeof BillingIntervalSchema>;

export const PlanIdSchema = z.enum(["free", "pro", "premium"]);
export type PlanId = z.infer<typeof PlanIdSchema>;

export interface PlanLimits {
  savedJobs: number | null;
  resumeAnalysesPerMonth: number | null;
  coverLetters: boolean;
  interviewPreparation: boolean;
  interviewSimulations: boolean;
  priorityProcessing: boolean;
}

export interface PricingPlan {
  id: PlanId;
  name: string;
  description: string;
  popular: boolean;
  prices: Record<BillingInterval, number>;
  limits: PlanLimits;
  features: string[];
}

export const PRICING_CONFIG = {
  currency: "INR",
  currencySymbol: "₹",
  /** Payment providers accept amounts in the minor unit (paise). */
  minorUnitMultiplier: 100,
  yearlySavingsLabel: "Save ~30%",
  intervalLabels: {
    monthly: "month",
    yearly: "year",
  } satisfies Record<BillingInterval, string>,
  plans: [
    {
      id: "free",
      name: "Free",
      description: "Start your job search with the essentials.",
      popular: false,
      prices: { monthly: 0, yearly: 0 },
      limits: {
        savedJobs: 10,
        resumeAnalysesPerMonth: 5,
        coverLetters: false,
        interviewPreparation: false,
        interviewSimulations: false,
        priorityProcessing: false,
      },
      features: [
        "Basic job search",
        "10 saved jobs",
        "5 AI resume analyses / month",
        "Basic application tracking",
        "Limited AI assistance",
      ],
    },
    {
      id: "pro",
      name: "Pro",
      description: "For active candidates who want an edge.",
      popular: true,
      prices: { monthly: 299, yearly: 2499 },
      limits: {
        savedJobs: null,
        resumeAnalysesPerMonth: 30,
        coverLetters: true,
        interviewPreparation: true,
        interviewSimulations: false,
        priorityProcessing: false,
      },
      features: [
        "Everything in Free",
        "30 AI resume analyses / month",
        "AI cover letter generation",
        "Advanced resume matching",
        "Advanced job recommendations",
        "Interview preparation",
        "Unlimited saved jobs",
        "Higher AI usage limits",
      ],
    },
    {
      id: "premium",
      name: "Premium",
      description: "Full AI career support for a serious search.",
      popular: false,
      prices: { monthly: 599, yearly: 4999 },
      limits: {
        savedJobs: null,
        resumeAnalysesPerMonth: 100,
        coverLetters: true,
        interviewPreparation: true,
        interviewSimulations: true,
        priorityProcessing: true,
      },
      features: [
        "Everything in Pro",
        "100 AI resume analyses / month",
        "Advanced AI career assistant",
        "Detailed resume improvement suggestions",
        "Advanced interview simulations",
        "Priority AI processing",
        "Higher job matching limits",
        "Advanced career insights",
      ],
    },
  ] as PricingPlan[],
} as const;

export function getPricingPlan(planId: string): PricingPlan | undefined {
  return PRICING_CONFIG.plans.find((plan) => plan.id === planId);
}

export function isPaidPlan(planId: string): boolean {
  const plan = getPricingPlan(planId);
  return Boolean(plan && plan.id !== "free");
}

/** Whole-rupee price. Always derive charges from this config, never the client. */
export function getPlanPrice(planId: string, interval: BillingInterval): number {
  const plan = getPricingPlan(planId);
  if (!plan) throw new Error(`Unknown plan: ${planId}`);
  return plan.prices[interval];
}

/** Amount sent to payment providers (paise for INR). */
export function getPlanAmountInMinorUnits(planId: string, interval: BillingInterval): number {
  return getPlanPrice(planId, interval) * PRICING_CONFIG.minorUnitMultiplier;
}

export function getYearlySavings(planId: string): number {
  const plan = getPricingPlan(planId);
  if (!plan) return 0;
  return Math.max(0, plan.prices.monthly * 12 - plan.prices.yearly);
}

export function getYearlySavingsPercent(planId: string): number {
  const plan = getPricingPlan(planId);
  if (!plan || plan.prices.monthly <= 0) return 0;
  const fullYear = plan.prices.monthly * 12;
  return Math.round((getYearlySavings(planId) / fullYear) * 100);
}

export function formatPrice(amount: number): string {
  return `${PRICING_CONFIG.currencySymbol}${amount.toLocaleString("en-IN")}`;
}

/**
 * Period end calculation, shared by checkout activation and webhook
 * verification. Monthly = one calendar month, yearly = twelve months.
 * UTC is used so the result is stable across server timezones.
 */
export function calculatePeriodEnd(start: Date, interval: BillingInterval): Date {
  const months = interval === "yearly" ? 12 : 1;
  const result = new Date(start.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDayOfTargetMonth = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDayOfTargetMonth));
  return result;
}

export function isValidPlan(planId: string): planId is PlanId {
  return PlanIdSchema.safeParse(planId).success;
}

export function isValidBillingInterval(interval: string): interval is BillingInterval {
  return BillingIntervalSchema.safeParse(interval).success;
}

export const CreateCheckoutSchema = z.object({
  planId: z.enum(["pro", "premium"]),
  interval: BillingIntervalSchema,
});

export type CreateCheckoutInput = z.infer<typeof CreateCheckoutSchema>;

export const ChangeBillingIntervalSchema = z.object({
  planId: z.enum(["pro", "premium"]),
  interval: BillingIntervalSchema,
});

export type ChangeBillingIntervalInput = z.infer<typeof ChangeBillingIntervalSchema>;

export const CancelSubscriptionSchema = z.object({
  reason: z.string().max(500).optional(),
});

export type CancelSubscriptionInput = z.infer<typeof CancelSubscriptionSchema>;

export interface PlanView extends PricingPlan {
  yearlySavings: number;
  yearlySavingsPercent: number;
}

export function planView(plan: PricingPlan): PlanView {
  return {
    ...plan,
    yearlySavings: getYearlySavings(plan.id),
    yearlySavingsPercent: getYearlySavingsPercent(plan.id),
  };
}

export function listPlanViews(): PlanView[] {
  return PRICING_CONFIG.plans.map(planView);
}
