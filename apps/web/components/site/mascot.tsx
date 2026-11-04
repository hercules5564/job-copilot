"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, CloseIcon, Sparkle } from "../icons";

const SUGGESTIONS = [
  { label: "See how discovery works", href: "#search-behavior" },
  { label: "How does matching work?", href: "#review" },
  { label: "What can I customize?", href: "#surfaces" },
  { label: "Start your search", href: "#cta" },
];

export function Mascot() {
  const [open, setOpen] = useState(false);

  return (
    <div className="cf-mascot">
      {open ? (
        <div className="cf-mascot-panel" role="dialog" aria-label="Ask JobPilot">
          <div className="mb-3 flex items-start gap-2">
            <span className="cf-mascot-orb" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="m-0 text-[12.5px] font-semibold text-[var(--ink)]">
                Ask JobPilot
              </p>
              <p className="m-0 text-[10.5px] text-[var(--ink-faint)]">
                Your job-search copilot
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close JobPilot assistant"
              className="rounded-md p-1 text-[var(--ink-muted)] transition-colors hover:bg-[var(--surface-sunken)]"
            >
              <CloseIcon width={14} height={14} />
            </button>
          </div>
          <p>Where do you want to start?</p>
          {SUGGESTIONS.map((item) => (
            <a key={item.label} href={item.href} onClick={() => setOpen(false)}>
              {item.label}
              <ArrowRight width={12} height={12} style={{ opacity: 0.4 }} />
            </a>
          ))}
          <Link
            href="/login"
            onClick={() => setOpen(false)}
            className="cf-btn cf-btn-dark mt-3 w-full"
          >
            Open JobPilot
          </Link>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Open JobPilot assistant"
        className="cf-mascot-toggle"
      >
        <span className="cf-mascot-orb" aria-hidden="true" />
        <Sparkle width={13} height={13} style={{ opacity: 0.5 }} />
        Ask JobPilot
      </button>
    </div>
  );
}
