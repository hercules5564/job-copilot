"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import {
  ApiError,
  billingApi,
  type BillingCheckoutSession,
} from "@/lib/api";

function formatMinor(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount / 100);
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="text-[12.5px] text-[var(--ink-muted)]">{label}</span>
      <span className="text-right text-[12.5px] font-medium text-[var(--ink)]">{value}</span>
    </div>
  );
}

export default function CheckoutClient({ transactionId }: { transactionId: string | null }) {
  const router = useRouter();
  const [session, setSession] = useState<BillingCheckoutSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!transactionId) {
      setError("Missing checkout reference. Start again from the billing page.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    billingApi
      .checkoutSession(transactionId)
      .then((result) => {
        if (cancelled) return;
        setSession(result.checkout);
        if (result.checkout.status === "PAID") {
          setNotice("This payment is already complete. Redirecting to billing…");
          setTimeout(() => router.replace("/billing"), 1200);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Could not load this checkout.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [transactionId, router]);

  async function handlePay() {
    if (!session || paying) return;
    setError("");
    setNotice("");
    setPaying(true);

    if (session.provider === "mock") {
      try {
        await billingApi.confirmMock(session.transactionId);
        setNotice("Mock payment approved. Your subscription is active. Redirecting…");
        setTimeout(() => router.replace("/billing"), 1000);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not complete the mock payment.");
        setPaying(false);
      }
      return;
    }

    if (session.checkoutUrl) {
      try {
        const url = new URL(session.checkoutUrl);
        if (url.protocol !== "https:" && url.protocol !== "http:") {
          throw new Error("Invalid checkout URL");
        }
        window.location.assign(url.toString());
        return;
      } catch {
        setError("Could not open the payment provider checkout. Start again from billing.");
        setPaying(false);
        return;
      }
    }

    setError("This checkout does not have a hosted payment page. Start again from billing.");
    setPaying(false);
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <span className="app-loading">Loading secure checkout…</span>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <Link
          href="/billing"
          className="inline-flex items-center gap-2 text-[13px] text-[var(--ink-muted)] hover:text-[var(--ink)]"
        >
          <ArrowLeft size={15} /> Back to billing
        </Link>
        <div className="cf-alert cf-alert-danger mt-5" role="alert">
          {error || "Checkout not found."}
        </div>
      </div>
    );
  }

  const amount = formatMinor(session.amount, session.currency);
  const isYearly = session.interval === "yearly";
  const paid = session.status === "PAID";
  const failed = session.status === "FAILED";
  const isHosted = Boolean(session.checkoutUrl);
  const canPay = !paid && !failed && (session.provider === "mock" || isHosted);

  return (
    <div className="mx-auto max-w-4xl pb-12">
      <Link
        href="/billing"
        className="inline-flex items-center gap-2 text-[13px] text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)]"
      >
        <ArrowLeft size={15} /> Back to billing
      </Link>

      <header className="mt-5 mb-7">
        <span className="cf-eyebrow">Secure checkout</span>
        <h1 className="mt-2">Complete your subscription</h1>
        <p className="mt-2 max-w-[620px] text-[14px] leading-relaxed text-[var(--ink-muted)]">
          Review the plan and billing interval, then complete payment. Your
          subscription activates only after the payment is verified.
        </p>
      </header>

      {error ? (
        <div className="cf-alert cf-alert-danger mb-4" role="alert">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div
          className="cf-alert mb-4 border-[var(--line)] bg-[var(--info-bg)] text-[var(--info)]"
          role="status"
        >
          {notice}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-semibold text-[var(--ink)]">Order summary</h2>
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--surface-sunken)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--ink-muted)]">
              {isYearly ? "Yearly" : "Monthly"}
            </span>
          </div>

          <div className="mt-4 flex items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3">
            <span className="grid h-10 w-10 shrink-0 place-content-center rounded-lg bg-[var(--blue-soft)] text-[var(--blue)]">
              <Sparkles size={17} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-medium text-[var(--ink)]">
                JobPilot {session.planName}
              </p>
              <p className="mt-0.5 text-[11.5px] text-[var(--ink-faint)]">
                Billed {isYearly ? "yearly" : "monthly"} · {isYearly ? "12 months" : "1 month"} access
              </p>
            </div>
          </div>

          <div className="mt-4 divide-y divide-[var(--line)]">
            <SummaryRow label="Plan" value={session.planName} />
            <SummaryRow
              label="Billing interval"
              value={isYearly ? "Yearly (billed upfront)" : "Monthly"}
            />
            <SummaryRow label="Access period" value={isYearly ? "12 months" : "1 month"} />
            {session.receipt ? <SummaryRow label="Reference" value={session.receipt} /> : null}
          </div>

          <div className="mt-3 flex items-end justify-between gap-3 border-t border-[var(--line)] pt-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.1em] text-[var(--ink-faint)]">
                Total due today
              </p>
              <p className="mt-1 text-[26px] font-semibold tracking-[-0.03em] text-[var(--ink)]">
                {amount}
              </p>
            </div>
            <span className="mb-1 inline-flex items-center gap-1.5 text-[10.5px] text-[var(--ink-faint)]">
              <LockKeyhole size={12} /> Server-verified amount
            </span>
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-faint)]">
            {isYearly
              ? "Yearly subscriptions are charged upfront for the full 12 months. This is not a monthly charge."
              : "Monthly subscriptions renew with a new verified payment before the next period."}
          </p>
        </section>

        <section className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-semibold text-[var(--ink)]">Payment</h2>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface-sunken)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
              <ShieldCheck size={12} /> Secure
            </span>
          </div>

          {session.provider === "mock" ? (
            <div className="cf-alert cf-alert-warning mt-4" role="status">
              Development mock checkout. Clicking pay confirms the payment on
              this server without a real charge.
            </div>
          ) : null}

          {failed ? (
            <div className="cf-alert cf-alert-danger mt-4" role="alert">
              This payment attempt failed. Return to billing and start a new
              checkout.
            </div>
          ) : null}

          <div className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3.5">
            <div className="flex items-center gap-2 text-[12.5px] font-medium text-[var(--ink)]">
              <CreditCard size={15} className="text-[var(--blue)]" />
              {session.provider === "mock" ? "Local test payment" : "Razorpay hosted checkout"}
            </div>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-[var(--ink-muted)]">
              {session.provider === "mock"
                ? "Mock payments are enabled locally. Production uses Razorpay with server-side webhook verification."
                : "You will continue to Razorpay's secure hosted payment page. Card and UPI details are handled by Razorpay, never by JobPilot."}
            </p>
          </div>

          <button
            type="button"
            onClick={handlePay}
            disabled={paying || !canPay}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--ink)] px-4 py-3 text-[13.5px] font-semibold text-[var(--bg)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {paying ? (
              <Loader2 size={15} className="animate-spin" />
            ) : paid ? (
              <CheckCircle2 size={15} />
            ) : failed ? (
              <XCircle size={15} />
            ) : (
              <CreditCard size={15} />
            )}
            {paid
              ? "Payment complete"
              : failed
                ? "Payment failed"
                : paying
                  ? "Opening checkout…"
                  : session.provider === "mock"
                    ? `Pay ${amount}`
                    : `Continue to Razorpay`}
          </button>

          <p className="mt-3 text-center text-[10.5px] leading-relaxed text-[var(--ink-faint)]">
            Access is granted only after the payment provider confirms the
            amount and signature. You can cancel renewal from billing at any
            time.
          </p>

          <Link
            href="/billing"
            className="mt-3 block text-center text-[11.5px] text-[var(--ink-muted)] underline-offset-2 hover:text-[var(--ink)] hover:underline"
          >
            Cancel and return to billing
          </Link>
        </section>
      </div>
    </div>
  );
}
