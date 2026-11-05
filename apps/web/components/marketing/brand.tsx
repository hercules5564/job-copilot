import type { ReactNode } from "react";
import { ArrowRight } from "./icons";

export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-[8px] bg-ent-lime ${className}`}
    >
      <svg viewBox="0 0 24 24" className="h-[68%] w-[68%]" aria-hidden="true">
        <path
          d="M3.4 11.4 21 3.6l-7.7 17.3-2.5-7.2-7.4-2.3Z"
          fill="#141414"
          strokeLinejoin="round"
        />
        <path
          d="m10.8 13.7 5.2-5.2"
          stroke="#7fc70a"
          strokeWidth="1.35"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

export function Brand({
  className = "",
  logoClassName = "h-8 w-8",
  textClassName = "text-[17px]",
}: {
  className?: string;
  logoClassName?: string;
  textClassName?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Logo className={logoClassName} />
      <span
        className={`font-semibold tracking-[-0.02em] text-ent-ink ${textClassName}`}
      >
        JobPilot
      </span>
    </span>
  );
}

export function Eyebrow({
  children,
  variant = "lime",
  className = "",
}: {
  children: ReactNode;
  variant?: "lime" | "purple" | "dark" | "bare";
  className?: string;
}) {
  const variantClass =
    variant === "purple"
      ? "ent-eyebrow--purple"
      : variant === "dark"
        ? "ent-eyebrow--dark"
        : variant === "bare"
          ? "ent-eyebrow--lime-ghost"
          : "";
  return (
    <span className={`ent-eyebrow ${variantClass} ${className}`}>{children}</span>
  );
}

type ButtonVariant = "primary" | "ghost" | "dark" | "outlineDark";

const variantClass: Record<ButtonVariant, string> = {
  primary: "ent-btn-primary",
  ghost: "ent-btn-ghost",
  dark: "ent-btn-dark",
  outlineDark: "ent-btn-outline-dark",
};

export function ButtonLink({
  href,
  children,
  variant = "primary",
  arrow = false,
  className = "",
  size = "md",
  ariaLabel,
}: {
  href: string;
  children: ReactNode;
  variant?: ButtonVariant;
  arrow?: boolean;
  className?: string;
  size?: "md" | "lg";
  ariaLabel?: string;
}) {
  return (
    <a
      href={href}
      aria-label={ariaLabel}
      className={`ent-btn ${variantClass[variant]} ${
        size === "lg" ? "ent-btn-lg" : ""
      } ${className}`}
    >
      {children}
      {arrow ? <ArrowRight className="h-4 w-4" /> : null}
    </a>
  );
}

export function SectionHeading({
  eyebrow,
  eyebrowVariant = "lime",
  title,
  description,
  actions,
  align = "between",
  className = "",
  titleClassName = "",
}: {
  eyebrow?: ReactNode;
  eyebrowVariant?: "lime" | "purple" | "dark" | "bare";
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  align?: "between" | "start";
  className?: string;
  titleClassName?: string;
}) {
  return (
    <div
      className={`flex flex-col gap-8 ${
        align === "between" ? "lg:flex-row lg:items-end lg:justify-between" : ""
      } ${className}`}
    >
      <div className="max-w-[780px]">
        {eyebrow ? <Eyebrow variant={eyebrowVariant}>{eyebrow}</Eyebrow> : null}
        <h2
          className={`ent-display mt-5 text-[clamp(36px,4.2vw,58px)] text-ent-ink ${titleClassName}`}
        >
          {title}
        </h2>
        {description ? (
          <p className="mt-5 max-w-[560px] text-[15.5px] leading-7 text-ent-muted">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-3 lg:shrink-0">{actions}</div>
      ) : null}
    </div>
  );
}

function GreenhouseLogo() {
  return (
    <span className="inline-flex items-center gap-2 text-[#73736d]">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
        <path
          d="M12 3.5c3.6 0 6.5 2.9 6.5 6.5 0 1.4-.5 2.7-1.2 3.8L12 20l-5.3-6.2A6.4 6.4 0 0 1 5.5 10c0-3.6 2.9-6.5 6.5-6.5Z"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <path
          d="M12 7v8M9 10h6M9.5 13h5"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
      <span className="text-[18px] font-semibold tracking-[-0.03em]">
        greenhouse
      </span>
    </span>
  );
}

function LeverLogo() {
  return (
    <span className="inline-flex items-center gap-2 text-[#73736d]">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
        <path
          d="M5 5.5v9.5a4 4 0 0 0 4 4h1.5M8.5 5.5v7.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <circle cx="16" cy="8" r="3" stroke="currentColor" strokeWidth="1.4" />
        <path d="m14 6.2 4.2 3.6" stroke="currentColor" strokeWidth="1.4" />
      </svg>
      <span className="text-[19px] font-semibold tracking-[-0.03em]">Lever</span>
    </span>
  );
}

function AshbyLogo() {
  return (
    <span className="inline-flex items-center gap-2 text-[#73736d]">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
        <path
          d="M12 4.5 20 18H4L12 4.5Z"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <path d="M9 13.5h6" stroke="currentColor" strokeWidth="1.4" />
      </svg>
      <span className="text-[19px] font-semibold tracking-[-0.03em]">Ashby</span>
    </span>
  );
}

function RemoteOkLogo() {
  return (
    <span className="inline-flex items-center gap-2 text-[#73736d]">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="7.5" stroke="currentColor" strokeWidth="1.4" />
        <path
          d="M4.5 12h15M12 4.5c2.3 2.1 3.5 4.6 3.5 7.5S14.3 17.4 12 19.5c-2.3-2.1-3.5-4.6-3.5-7.5S9.7 6.6 12 4.5Z"
          stroke="currentColor"
          strokeWidth="1.3"
        />
      </svg>
      <span className="text-[18px] font-semibold tracking-[-0.03em]">remoteok</span>
    </span>
  );
}

function GmailLogo() {
  return (
    <span className="inline-flex items-center gap-2 text-[#73736d]">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
        <rect
          x="3.5"
          y="5.5"
          width="17"
          height="13"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <path
          d="m4.5 7 7.5 6 7.5-6"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="text-[19px] font-semibold tracking-[-0.03em]">Gmail</span>
    </span>
  );
}

export function LogoRow() {
  return (
    <div className="grid grid-cols-2 items-center gap-y-7 border-y border-ent-line py-6 sm:grid-cols-3 lg:grid-cols-5">
      <div className="flex justify-center">
        <GreenhouseLogo />
      </div>
      <div className="flex justify-center">
        <LeverLogo />
      </div>
      <div className="flex justify-center">
        <AshbyLogo />
      </div>
      <div className="flex justify-center">
        <RemoteOkLogo />
      </div>
      <div className="flex justify-center">
        <GmailLogo />
      </div>
    </div>
  );
}
