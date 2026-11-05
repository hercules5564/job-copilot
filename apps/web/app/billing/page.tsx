"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Crown,
  Loader2,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import {
  ApiError,
  billingApi,
  type BillingInterval,
  type BillingOverview,
  type BillingPayment,
  type BillingSubscription,
} from "../../lib/api";
import PricingSection from "../../components/ui/pricing-section-3";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatMinor(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount / 100);
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "ACTIVE"
      ? "border-[var(--success)] bg-[var(--success-bg)] text-[var(--success)]"
      : status === "CANCELED"
        ? "border-[var(--warning)] bg-[var(--warning-bg)] text-[var(--warning)]"
        : status === "PAST_DUE"
          ? "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger)]"
          : "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-muted)]";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${tone}`}
    >
      {status === "ACTIVE" ? <CheckCircle2 size={11} /> : null}
      {status === "CANCELED" ? <AlertCircle size={11} /> : null}
      {status}
    </span>
  );
}

function currentPlanCopy(subscription: BillingSubscription | null): {
  title: string;
  interval: string;
  access: string;
  renewal: string;
} {
  if (!subscription) {
    return {
      title: "Free",
      interval: "—",
      access: "No expiry",
      renewal: "—",
    };
  }
  return {
    title: subscription.planName,
    interval: subscription.billingInterval === "yearly" ? "Yearly" : "Monthly",
    access: `Access until ${formatDate(subscription.expirationDate)}`,
    renewal: subscription.cancelAtPeriodEnd
      ? "Ends at the close of this period"
      : `Renewal due ${formatDate(subscription.renewalDate)}`,
  };
}

function PaymentHistory({ payments }: { payments: BillingPayment[] }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-[var(--ink)]">Payment history</h2>
        <CreditCard size={16} className="text-[var(--ink-faint)]" />
      </div>
      {payments.length === 0 ? (
        <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--ink-muted)]">
          No payments yet. Your invoices will appear here after checkout.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-[var(--line)]">
          {payments.map((payment) => (
            <li key={payment.id} className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-[12.5px] font-medium text-[var(--ink)]">
                  {payment.planName} · {payment.billingInterval}
                </p>
                <p className="mt-0.5 text-[10.5px] text-[var(--ink-faint)]">
                  {formatDate(payment.paidAt ?? payment.createdAt)} · {payment.status.toLowerCase()}
                </p>
              </div>
              <span className="shrink-0 text-[12.5px] font-semibold tabular-nums text-[var(--ink)]">
                {formatMinor(payment.amount, payment.currency)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function BillingPage() {
  const router = useRouter();
  const [data, setData] = useState<BillingOverview | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const next = await billingApi.overview();
    setData(next);
    return next;
  }, []);

  useEffect(() => {
    refresh().catch((err: unknown) => {
      setError(err instanceof ApiError ? err.message : "Could not load billing details.");
    });
  }, [refresh]);

  // Returning from the third-party hosted checkout: poll briefly until the
  // provider webhook activates the subscription.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") !== "success") return;
    window.history.replaceState({}, "", "/billing");
    setNotice("Payment received. Confirming with the payment provider…");
    let cancelled = false;

    async function confirmPayment() {
      for (let attempt = 0; attempt < 15; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        if (cancelled) return;
        try {
          const next = await refresh();
          if (next.subscription && next.subscription.status === "ACTIVE") {
            setNotice("Payment confirmed. Your subscription is active.");
            return;
          }
        } catch {
          // Webhook may still be in flight.
        }
      }
      if (!cancelled) {
        setNotice("Payment submitted. Activation may take a moment; refresh billing shortly.");
      }
    }

    void confirmPayment();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  async function handleSelect(planId: string, interval: BillingInterval) {
    if (!data) return;
    setError("");
    setNotice("");

    if (planId === "free") {
      if (data.currentPlanId === "free") return;
      const expiry = data.subscription ? formatDate(data.subscription.expirationDate) : "";
      const ok = window.confirm(
        `Downgrade to Free? Your paid features stay available until ${expiry}, then the plan becomes Free.`,
      );
      if (!ok) return;
      setBusy(`free:${interval}`);
      try {
        await billingApi.cancel();
        await refresh();
        setNotice("Downgrade scheduled. You will keep access until the end of the paid period.");
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not change the plan.");
      } finally {
        setBusy(null);
      }
      return;
    }

    if (planId !== "pro" && planId !== "premium") return;
    setBusy(`${planId}:${interval}`);
    try {
      const { checkout } = await billingApi.checkout({ planId, interval });
      if (checkout.checkoutUrl) {
        // Production: hand the browser directly to the payment provider's
        // hosted checkout page (Razorpay Payment Link).
        window.location.assign(checkout.checkoutUrl);
        return;
      }
      // Local mock checkout keeps an internal review/pay page.
      router.push(`/billing/checkout?transactionId=${encodeURIComponent(checkout.transactionId)}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start checkout.");
      setBusy(null);
    }
  }

  async function handleCancel() {
    if (!window.confirm("Cancel your subscription? You keep access until the end of the paid period.")) {
      return;
    }
    setError("");
    setNotice("");
    setBusy("cancel");
    try {
      await billingApi.cancel();
      await refresh();
      setNotice("Subscription canceled. Access continues until the end of the period.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not cancel the subscription.");
    } finally {
      setBusy(null);
    }
  }

  async function handleResume() {
    setError("");
    setNotice("");
    setBusy("resume");
    try {
      await billingApi.resume();
      await refresh();
      setNotice("Subscription resumed. Automatic renewal is active again.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not resume the subscription.");
    } finally {
      setBusy(null);
    }
  }

  if (!data) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <span className="app-loading">{error || "Loading billing details…"}</span>
      </div>
    );
  }

  const subscription = data.subscription;
  const copy = currentPlanCopy(subscription);

  return (
    <div className="pb-10">
      <header className="mb-8">
        <span className="cf-eyebrow">Billing</span>
        <h1 className="mt-2">Plans, usage &amp; invoices</h1>
        <p className="mt-2 max-w-[680px] text-[14px] leading-relaxed text-[var(--ink-muted)]">
          Manage your JobPilot subscription, switch between monthly and yearly
          billing, and review every verified payment.
        </p>
      </header>

      {error ? (
        <div className="cf-alert cf-alert-danger mb-4" role="alert">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="cf-alert mb-4 border-[var(--line)] bg-[var(--info-bg)] text-[var(--info)]" role="status">
          {notice}
        </div>
      ) : null}
      {data.paymentProvider === "mock" ? (
        <div className="cf-alert cf-alert-warning mb-4" role="status">
          Development mode: mock payments are enabled. Checkout confirms locally
          without a real charge. Set <code>PAYMENT_PROVIDER=razorpay</code> and
          Razorpay keys to accept live payments.
        </div>
      ) : null}
      {!data.paymentsConfigured ? (
        <div className="cf-alert cf-alert-warning mb-4" role="status">
          Payments are not configured on this server. Plan changes that require
          payment are unavailable right now.
        </div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="relative overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-5">
          <span
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[var(--blue)] via-[var(--lime-deep)] to-[var(--blue)]"
          />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-content-center rounded-lg bg-[var(--blue-soft)] text-[var(--blue)]">
                <Crown size={18} />
              </span>
              <div>
                <span className="cf-mono text-[9px] text-[var(--ink-faint)]">Current plan</span>
                <h2 className="text-[22px] font-medium tracking-[-0.02em]">{copy.title}</h2>
              </div>
            </div>
            <StatusBadge status={subscription?.status ?? "FREE"} />
          </div>

          <dl className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5">
              <dt className="text-[10px] uppercase tracking-[0.1em] text-[var(--ink-faint)]">
                Billing interval
              </dt>
              <dd className="mt-1 text-[13px] font-medium text-[var(--ink)]">{copy.interval}</dd>
            </div>
            <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5">
              <dt className="text-[10px] uppercase tracking-[0.1em] text-[var(--ink-faint)]">
                Access
              </dt>
              <dd className="mt-1 flex items-center gap-1.5 text-[13px] font-medium text-[var(--ink)]">
                <CalendarDays size={13} className="text-[var(--ink-faint)]" />
                {copy.access}
              </dd>
            </div>
            <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5">
              <dt className="text-[10px] uppercase tracking-[0.1em] text-[var(--ink-faint)]">
                Renewal
              </dt>
              <dd className="mt-1 text-[13px] font-medium text-[var(--ink)]">{copy.renewal}</dd>
            </div>
            <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5">
              <dt className="text-[10px] uppercase tracking-[0.1em] text-[var(--ink-faint)]">
                AI resume analyses
              </dt>
              <dd className="mt-1 text-[13px] font-medium text-[var(--ink)]">
                {data.entitlements.resumeAnalysesPerMonth === null
                  ? "Unlimited"
                  : `${data.entitlements.resumeAnalysesPerMonth} / month`}
              </dd>
            </div>
          </dl>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            {subscription && !subscription.cancelAtPeriodEnd ? (
              <button
                type="button"
                onClick={handleCancel}
                disabled={busy !== null}
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--line-strong)] px-3.5 py-2 text-[12.5px] font-medium text-[var(--ink)] transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-60"
              >
                {busy === "cancel" ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                Cancel subscription
              </button>
            ) : null}
            {subscription?.cancelAtPeriodEnd ? (
              <button
                type="button"
                onClick={handleResume}
                disabled={busy !== null}
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--line-strong)] px-3.5 py-2 text-[12.5px] font-medium text-[var(--ink)] transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-60"
              >
                {busy === "resume" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Resume subscription
              </button>
            ) : null}
            {subscription ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--ink-faint)]">
                <ShieldCheck size={13} /> Activated by verified payment
              </span>
            ) : null}
          </div>
        </div>

        <PaymentHistory payments={data.payments} />
      </section>

      <div className="mt-12">
        <PricingSection
          plans={data.plans}
          pricing={data.pricing}
          currentPlanId={data.currentPlanId}
          currentInterval={data.currentInterval}
          busy={busy}
          onSelect={handleSelect}
        />
      </div>
    </div>
  );
}
