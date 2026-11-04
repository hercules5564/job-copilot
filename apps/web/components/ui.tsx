import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`cf-card p-5 ${className}`}>{children}</div>;
}

export function Badge({ children }: { children: ReactNode }) {
  return <span className="cf-chip">{children}</span>;
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Card className="relative overflow-hidden">
      <span className="cf-mono text-[9px] text-[var(--ink-faint)]">{label}</span>
      <div className="mt-2 font-display text-[30px] leading-none tracking-[-0.03em]">{value}</div>
      <span
        aria-hidden="true"
        className="absolute bottom-0 left-0 h-[2px] w-10 rounded-full bg-[var(--blue)] opacity-60"
      />
    </Card>
  );
}

export function PageHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-7">
      <span className="cf-eyebrow">JobPilot workspace</span>
      <h1 className="mt-2">{title}</h1>
      {sub ? (
        <p className="mt-2 max-w-[640px] text-[14px] leading-relaxed text-[var(--ink-muted)]">
          {sub}
        </p>
      ) : null}
    </div>
  );
}
