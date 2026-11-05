"use client";

import { useEffect, useRef, useState } from "react";
import NumberFlow from "@number-flow/react";
import { motion } from "motion/react";
import {
  ArrowRight,
  CheckCheck,
  Loader2,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { TimelineContent } from "@/components/ui/timeline-animation";
import { VerticalCutReveal } from "@/components/ui/vertical-cut-reveal";
import { cn } from "@/lib/utils";
import { billingApi, type BillingInterval, type BillingPlanView } from "@/lib/api";

interface PricingSectionProps {
  plans?: BillingPlanView[];
  pricing?: {
    currencySymbol: string;
    yearlySavingsLabel: string;
  };
  currentPlanId?: string;
  currentInterval?: BillingInterval | null;
  busy?: string | null;
  onSelect?: (planId: string, interval: BillingInterval) => void;
  className?: string;
}

const FALLBACK_PRICING = {
  currencySymbol: "₹",
  yearlySavingsLabel: "Save ~30%",
};

function PricingSwitch({
  value,
  onChange,
  yearlySavingsLabel,
  className,
}: {
  value: BillingInterval;
  onChange: (value: BillingInterval) => void;
  yearlySavingsLabel: string;
  className?: string;
}) {
  return (
    <div className={cn("flex justify-center sm:justify-start", className)}>
      <div
        className="relative z-10 flex w-fit rounded-full border border-[var(--line-strong)] bg-[var(--surface-sunken)] p-1"
        role="group"
        aria-label="Billing interval"
      >
        {(["monthly", "yearly"] as const).map((interval) => {
          const selected = value === interval;
          return (
            <button
              key={interval}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(interval)}
              className={cn(
                "relative z-10 flex h-10 cursor-pointer items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors sm:h-11 sm:px-5",
                selected
                  ? "text-[var(--ink)]"
                  : "text-[var(--ink-muted)] hover:text-[var(--ink)]",
              )}
            >
              {selected ? (
                <motion.span
                  layoutId="billing-switch"
                  className="absolute inset-0 -z-10 rounded-full border border-[var(--line-strong)] bg-[var(--surface-raised)] shadow-sm"
                  transition={{ type: "spring", stiffness: 500, damping: 34 }}
                />
              ) : null}
              <span className="relative capitalize">{interval}</span>
              {interval === "yearly" ? (
                <span className="relative rounded-full bg-[var(--blue-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--blue)]">
                  {yearlySavingsLabel}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Price({ amount, symbol }: { amount: number; symbol: string }) {
  return (
    <span className="inline-flex items-baseline font-display text-[38px] font-semibold leading-none tracking-[-0.03em]">
      <span>{symbol}</span>
      <NumberFlow value={amount} format={{ maximumFractionDigits: 0 }} />
    </span>
  );
}

export default function PricingSection4({
  plans = [],
  pricing = FALLBACK_PRICING,
  currentPlanId = "free",
  currentInterval = null,
  busy = null,
  onSelect,
  className,
}: PricingSectionProps) {
  const [interval, setIntervalValue] = useState<BillingInterval>(
    currentInterval ?? "monthly",
  );
  const [remote, setRemote] = useState<{
    plans: BillingPlanView[];
    pricing: { currencySymbol: string; yearlySavingsLabel: string };
  } | null>(null);
  const pricingRef = useRef<HTMLDivElement>(null);

  const displayPlans = plans.length > 0 ? plans : remote?.plans ?? [];
  const displayPricing = plans.length > 0 ? pricing : remote?.pricing ?? pricing;

  useEffect(() => {
    if (currentInterval) setIntervalValue(currentInterval);
  }, [currentInterval]);

  // Standalone use (e.g. a pricing page) can omit props; the public plan
  // catalogue is then loaded from the API. Prices still live in one place.
  useEffect(() => {
    if (plans.length > 0) return;
    let cancelled = false;
    billingApi
      .plans()
      .then((result) => {
        if (!cancelled) {
          setRemote({ plans: result.plans, pricing: result.pricing });
        }
      })
      .catch(() => {
        // Keep the graceful empty/loading state; checkout is unavailable.
      });
    return () => {
      cancelled = true;
    };
  }, [plans.length]);

  const revealVariants = {
    visible: (i: number) => ({
      y: 0,
      opacity: 1,
      filter: "blur(0px)",
      transition: { delay: i * 0.12, duration: 0.45 },
    }),
    hidden: { filter: "blur(8px)", y: -14, opacity: 0 },
  };

  const isYearly = interval === "yearly";

  return (
    <section
      className={cn("relative mx-auto w-full max-w-6xl px-1", className)}
      ref={pricingRef}
      aria-labelledby="pricing-heading"
    >
      <article className="flex flex-col gap-6 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-[640px] text-left">
          <span className="cf-eyebrow">Plans &amp; pricing</span>
          <h2
            id="pricing-heading"
            className="mt-3 text-[clamp(30px,4vw,44px)] font-medium leading-[1.08] tracking-[-0.03em] text-[var(--ink)]"
          >
            <VerticalCutReveal
              splitBy="words"
              staggerDuration={0.12}
              staggerFrom="first"
              reverse
              containerClassName="justify-start"
              transition={{ type: "spring", stiffness: 250, damping: 40, delay: 0 }}
            >
              Invest in your next role
            </VerticalCutReveal>
          </h2>
          <TimelineContent
            as="p"
            animationNum={0}
            timelineRef={pricingRef}
            customVariants={revealVariants}
            className="mt-3 max-w-[520px] text-[14.5px] leading-relaxed text-[var(--ink-muted)]"
          >
            Choose monthly flexibility or save with a yearly plan. Every AI
            feature is built around the evidence in your profile, never
            invented claims.
          </TimelineContent>
        </div>

        <TimelineContent
          as="div"
          animationNum={1}
          timelineRef={pricingRef}
          customVariants={revealVariants}
          className="shrink-0 self-start sm:self-auto"
        >
          <PricingSwitch
            value={interval}
            onChange={setIntervalValue}
            yearlySavingsLabel={displayPricing.yearlySavingsLabel}
          />
        </TimelineContent>
      </article>

      <TimelineContent
        as="div"
        animationNum={2}
        timelineRef={pricingRef}
        customVariants={revealVariants}
        className="grid gap-4 md:grid-cols-3 md:items-stretch"
      >
        {displayPlans.length === 0 ? (
          <div className="col-span-full rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-8 text-center text-sm text-[var(--ink-muted)]">
            Loading plans…
          </div>
        ) : (
          displayPlans.map((plan, index) => {
            const price = plan.prices[interval];
            const isCurrent =
              currentPlanId === plan.id &&
              (plan.id === "free" || currentInterval === interval);
            const isBusy = busy === `${plan.id}:${interval}`;
            const actionLabel =
              plan.id === "free"
                ? currentPlanId === "free"
                  ? "Current plan"
                  : "Downgrade to Free"
                : isCurrent
                  ? "Current plan"
                  : currentPlanId === plan.id
                    ? `Switch to ${interval}`
                    : `Choose ${plan.name}`;

            return (
              <TimelineContent
                as="div"
                key={plan.id}
                animationNum={index + 3}
                timelineRef={pricingRef}
                customVariants={revealVariants}
                className="flex"
              >
                <Card
                  className={cn(
                    "relative flex w-full flex-col justify-between overflow-hidden border bg-card transition-shadow",
                    plan.popular
                      ? "border-[var(--ink)] shadow-[0_18px_50px_rgba(23,23,23,0.12)] dark:shadow-[0_18px_50px_rgba(0,0,0,0.45)]"
                      : "border-[var(--line)] shadow-none",
                  )}
                >
                  {plan.popular ? (
                    <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[var(--blue)] via-[var(--lime-deep)] to-[var(--blue)]" />
                  ) : null}

                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-display text-[22px] font-medium tracking-[-0.02em] text-[var(--ink)]">
                          {plan.name}
                        </h3>
                        <p className="mt-1 min-h-[40px] text-[12.5px] leading-relaxed text-[var(--ink-muted)]">
                          {plan.description}
                        </p>
                      </div>
                      {plan.popular ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--ink)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--bg)]">
                          <Sparkles size={11} /> Popular
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-5">
                      <div className="flex items-baseline gap-1">
                        <Price amount={price} symbol={displayPricing.currencySymbol} />
                        <span className="text-sm text-[var(--ink-muted)]">
                          /{interval === "yearly" ? "year" : "month"}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[11.5px] leading-relaxed text-[var(--ink-faint)]">
                        {plan.id === "free"
                          ? "Free forever. No card required."
                          : isYearly
                            ? `Billed ${displayPricing.currencySymbol}${price.toLocaleString("en-IN")} upfront for 12 months · save ${displayPricing.currencySymbol}${plan.yearlySavings.toLocaleString("en-IN")} (${plan.yearlySavingsPercent}%)`
                            : "Billed monthly · cancel anytime"}
                      </p>
                    </div>

                    <div className="mt-5 space-y-3 border-t border-[var(--line)] pt-5">
                      <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-faint)]">
                        What&apos;s included
                      </h4>
                      <ul className="space-y-2.5">
                        {plan.features.map((feature) => (
                          <li key={feature} className="flex items-start gap-2.5">
                            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-content-center rounded-full border border-[var(--line-strong)] bg-[var(--surface-raised)] text-[var(--blue)]">
                              <CheckCheck size={13} />
                            </span>
                            <span className="text-[13px] leading-snug text-[var(--ink-soft)]">
                              {feature}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </CardContent>

                  <CardFooter className="flex-col items-stretch gap-2 pt-4">
                    <button
                      type="button"
                      disabled={isCurrent || Boolean(busy) || !onSelect}
                      onClick={() => onSelect?.(plan.id, interval)}
                      className={cn(
                        "flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition-all",
                        isCurrent
                          ? "cursor-default border border-[var(--line)] bg-transparent text-[var(--ink-faint)]"
                          : plan.popular
                            ? "bg-[var(--ink)] text-[var(--bg)] hover:opacity-90"
                            : "border border-[var(--line-strong)] bg-[var(--surface-raised)] text-[var(--ink)] hover:bg-[var(--surface-sunken)]",
                        "disabled:cursor-not-allowed disabled:opacity-60",
                      )}
                    >
                      {isBusy ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : isCurrent ? (
                        <ShieldCheck size={15} />
                      ) : plan.popular ? (
                        <Zap size={15} />
                      ) : null}
                      {isBusy ? "Starting checkout…" : actionLabel}
                      {!isCurrent && !isBusy ? <ArrowRight size={14} /> : null}
                    </button>
                    {isCurrent && plan.id !== "free" ? (
                      <span className="text-center text-[10.5px] text-[var(--ink-faint)]">
                        Manage renewal from your plan panel
                      </span>
                    ) : null}
                  </CardFooter>
                </Card>
              </TimelineContent>
            );
          })
        )}
      </TimelineContent>

      <p className="mt-5 text-center text-[11px] leading-relaxed text-[var(--ink-faint)]">
        Yearly subscriptions are charged upfront for the full 12 months. Prices
        are in INR. The amount at checkout is calculated and verified on the
        server.
      </p>
    </section>
  );
}
