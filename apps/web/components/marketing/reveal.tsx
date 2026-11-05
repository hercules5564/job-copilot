"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CloseIcon, Sparkle } from "./icons";

export function useInView<T extends HTMLElement>(threshold = 0.18) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, inView };
}

export function Reveal({
  children,
  className = "",
  delay = 0,
  distance = 26,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  distance?: number;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? "translate3d(0,0,0)" : `translate3d(0,${distance}px,0)`,
        transition:
          "opacity 800ms cubic-bezier(0.22,1,0.36,1), transform 800ms cubic-bezier(0.22,1,0.36,1)",
        transitionDelay: `${delay}ms`,
        willChange: "opacity, transform",
      }}
    >
      {children}
    </div>
  );
}

export function Mascot() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-5 left-1/2 z-40 -translate-x-1/2">
      {open ? (
        <div className="mb-2 w-[260px] rounded-xl border border-black/10 bg-white p-3 shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
          <div className="flex items-center gap-2">
            <span className="ent-orb h-7 w-7" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-ent-ink">Ask Pilot</p>
              <p className="text-[11px] text-ent-muted">Your job-search copilot</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close Pilot"
              className="rounded-md p-1 text-ent-muted transition-colors hover:bg-black/5 hover:text-ent-ink"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 flex flex-col gap-1">
            {[
              ["What is the Career Graph?", "#world-model"],
              ["How does Smart Matching work?", "#router"],
              ["What changed for these candidates?", "#stories"],
              ["Book a demo", "#cta"],
            ].map(([label, href]) => (
              <a
                key={label}
                href={href}
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-1.5 text-left text-[12px] text-ent-ink transition-colors hover:bg-[#eef9d4]"
              >
                {label}
              </a>
            ))}
          </div>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Open Pilot assistant"
        className="ent-mascot-pill mx-auto flex items-center gap-2 rounded-full py-1 pl-1 pr-3.5 transition-transform duration-200 hover:scale-[1.03]"
      >
        <span className="ent-orb h-9 w-9">
          <Sparkle className="relative z-10 h-4 w-4 text-white/90" />
        </span>
        <span className="text-[12px] font-medium tracking-tight text-white/95">
          Ask Pilot
        </span>
      </button>
    </div>
  );
}
