"use client";

import { useState } from "react";
import { ButtonLink, SectionHeading } from "./brand";
import { Copy } from "./icons";
import { Reveal, useInView } from "./reveal";

const BARS = [
  {
    title: "Apply everywhere",
    sub: "Volume only",
    height: 158,
    tone: "single" as const,
    pill: "↗ Baseline effort",
    price: null,
  },
  {
    title: "JobPilot Matched",
    sub: "80+ score",
    height: 162,
    tone: "balanced" as const,
    pill: "✓ Better fit",
    price: "18 apps",
  },
  {
    title: "JobPilot Autopilot",
    sub: "Prepared for you",
    height: 116,
    tone: "eco" as const,
    pill: "✓ Human approved",
    price: "9 apps",
  },
];

const METRICS = [
  ["Roles scored", "1,284"],
  ["Matched at 80+", "82%"],
  ["Reply rate", "31%"],
  ["Time saved / application", "24 min"],
];

function CommandBox({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  function legacyCopy(text: string) {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    document.body.removeChild(area);
  }

  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(command);
      } else {
        legacyCopy(command);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      try {
        legacyCopy(command);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      } catch {
        setCopied(false);
      }
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-md border border-ent-line bg-[#fbfbf8] px-3 py-2.5">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-[11.5px] text-ent-ink/85">
        <span className="mr-1.5 text-ent-faint">$</span>
        {command}
      </code>
      <button
        type="button"
        onClick={copy}
        className="ent-copy-btn flex shrink-0 items-center gap-1 rounded px-1 py-0.5 hover:bg-black/5"
        aria-label={`Copy command: ${command}`}
      >
        <Copy className="h-3 w-3" />
        {copied ? "copied" : "copy"}
      </button>
    </div>
  );
}

function Chart() {
  const { ref, inView } = useInView<HTMLDivElement>(0.25);

  return (
    <div className="relative min-h-[420px] bg-[#101010] p-6 sm:p-8" ref={ref}>
      <div className="pointer-events-none absolute inset-0 ent-noise-dark opacity-60" />
      <div className="relative flex h-full min-h-[360px] flex-col justify-end">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.18em] text-[#6e6e68]">
            Applications per week
          </span>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[9px] text-[#8a8a82]">
            This month
          </span>
        </div>

        <div className="flex flex-1 gap-2">
          <div className="flex w-10 shrink-0 flex-col justify-between pb-24 pt-2 text-right text-[10px] text-[#77776f]">
            <span>60</span>
            <span>30</span>
            <span>0</span>
          </div>

          <div className="relative flex flex-1 items-end justify-around gap-4 border-b border-[#2b2b27] pb-0">
            <div className="pointer-events-none absolute inset-x-0 top-[8%] border-t border-dashed border-white/[0.07]" />
            <div className="pointer-events-none absolute inset-x-0 top-[48%] border-t border-dashed border-white/[0.07]" />

            {BARS.map((bar, index) => (
              <div key={bar.sub} className="relative flex h-full w-full max-w-[150px] flex-col items-center justify-end">
                {bar.tone === "eco" ? (
                  <div
                    className="absolute bottom-[74px] w-full rounded-t-[2px] border border-dashed border-[#3f5a22]/70"
                    style={{ height: 160 }}
                  />
                ) : null}
                {bar.tone === "balanced" ? (
                  <div
                    className="absolute bottom-[76px] w-full rounded-t-[2px] border border-dashed border-[#5c7a35]/60"
                    style={{ height: 182 }}
                  />
                ) : null}

                {bar.price ? (
                  <span className="mb-1.5 text-[10.5px] font-medium text-[#c9e98e]">
                    {bar.price}
                  </span>
                ) : null}

                <div
                  className={`ent-bar relative w-full rounded-t-[2px] ${
                    inView ? "is-in" : ""
                  } ${
                    bar.tone === "single"
                      ? "bg-[#8a8a86]"
                      : bar.tone === "balanced"
                        ? "border-t border-dashed border-[#8fbb5f] bg-gradient-to-b from-[#38521d] to-[#263a12]"
                        : "border-t border-[#a8e63a] bg-gradient-to-b from-[#9fdb18] to-[#79b40a]"
                  }`}
                  style={{
                    height: bar.height,
                    animationDelay: `${index * 120}ms`,
                  }}
                >
                  {bar.tone === "eco" ? (
                    <span className="absolute inset-x-0 top-1 text-center text-[9px] font-medium text-[#1c2a05]">
                      52% less
                    </span>
                  ) : null}
                </div>

                <div className="mt-3 flex min-h-[68px] flex-col items-center text-center">
                  <p className="text-[11.5px] font-medium text-[#e6e6df]">{bar.title}</p>
                  <p className="mt-0.5 text-[10.5px] text-[#8f8f87]">{bar.sub}</p>
                  <span
                    className={`mt-2 whitespace-nowrap rounded-full border px-2 py-0.5 text-[9px] ${
                      bar.tone === "single"
                        ? "border-white/10 text-[#9a9a92]"
                        : "border-[#4b6b24] bg-[#1c2b0c] text-[#b6e35a]"
                    }`}
                  >
                    {bar.pill}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function RouterSection() {
  return (
    <section id="router" className="border-t border-ent-line bg-white py-20 md:py-28">
      <div className="ent-container">
        <Reveal>
          <SectionHeading
            eyebrow="Match Engine"
            eyebrowVariant="purple"
            title={
              <>
                The matcher knows which
                <br />
                roles are worth your time.
              </>
            }
            description="Explainable scoring per role against your experience, preferences and outcomes."
          />
        </Reveal>

        <Reveal className="mt-10" delay={70}>
          <div className="grid border border-ent-line bg-white lg:grid-cols-2">
            <Chart />
            <div className="flex flex-col p-6 sm:p-8 lg:p-10">
              <span className="w-fit border-l-2 border-[#8b5cf6] pl-2 text-[13px] font-medium text-[#6d28d9]">
                How Match Engine Works?
              </span>
              <p className="mt-4 max-w-[520px] text-[14.5px] leading-7 text-ent-muted">
                Every role starts with your real experience and preferences, then
                scores only the work you would actually take.
              </p>

              <div className="mt-8 border-t border-ent-line">
                {METRICS.map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between border-b border-ent-line py-3 text-[12.5px]"
                  >
                    <span className="text-ent-muted">{label}</span>
                    <span className="font-medium tabular-nums text-ent-ink">{value}</span>
                  </div>
                ))}
              </div>

              <div className="mt-auto flex flex-wrap gap-3 pt-8">
                <ButtonLink href="#cta" variant="primary" arrow>
                  Try Match Engine
                </ButtonLink>
                <ButtonLink href="#router" variant="ghost" arrow>
                  See scoring detail
                </ButtonLink>
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal className="mt-6" delay={120}>
          <div className="border border-ent-line bg-white">
            <div className="border-b border-ent-line px-6 py-5 sm:px-8">
              <p className="text-[15px] font-medium text-ent-ink">
                Try it on your next search
              </p>
              <p className="mt-1 text-[12.5px] text-ent-muted">
                Import your profile, set a threshold, turn autopilot on.
              </p>
            </div>
            <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-2 lg:gap-8">
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded border border-ent-line bg-[#f6f6f1] text-[10px] text-ent-muted">
                    1
                  </span>
                  <span className="text-[12px] text-ent-ink/80">
                    Import &amp; personalize your profile
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  <CommandBox command="npx jobpilot init" />
                  <CommandBox command="jobpilot profile import ./resume.pdf" />
                </div>
              </div>
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded border border-ent-line bg-[#f6f6f1] text-[10px] text-ent-muted">
                    2
                  </span>
                  <span className="text-[12px] text-ent-ink/80">Turn autopilot on</span>
                </div>
                <CommandBox command="jobpilot autopilot on" />
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
