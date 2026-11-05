"use client";

import { useState } from "react";
import { Plus } from "./icons";
import { Reveal } from "./reveal";

const FAQS = [
  {
    q: "What is JobPilot?",
    a: "JobPilot is one operating system for your job search. It discovers roles, scores them against your real experience, prepares applications for your approval, and tracks every reply in one place.",
  },
  {
    q: "How does Smart Matching work?",
    a: "Each role is scored against your skills, seniority, location, salary and past outcomes. You see the reasons behind every score, so you can tune the threshold instead of guessing.",
  },
  {
    q: "Does JobPilot auto-apply?",
    a: "It prepares applications automatically, but a human always approves before anything is submitted. Autopilot stops at review and never sends an application on its own.",
  },
  {
    q: "Which job sources do you scan?",
    a: "JobPilot reads public boards including Greenhouse, Lever, Ashby, RemoteOK, Arbeitnow, Adzuna and Jooble. You choose the sources and boards you care about.",
  },
  {
    q: "Does it write cover letters for me?",
    a: "It drafts cover letters and form answers from approved facts in your profile and projects. Invented experience is flagged, and nothing goes out without your review.",
  },
  {
    q: "Is my data safe?",
    a: "Sessions are server-side, tokens are encrypted at rest, and Gmail sync is read-only. Your data is never used to train models, and you can disconnect an integration at any time.",
  },
  {
    q: "Do I have to change how I apply?",
    a: "No. Keep using the boards and tools you already like. JobPilot runs underneath discovery, matching, drafting and tracking, with you in control of every submission.",
  },
  {
    q: "How much does it cost to start?",
    a: "You can start for free with no credit card. Paid plans add more matches, longer history and team controls when you need them.",
  },
];

export function FaqSection() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section id="faq" className="border-t border-ent-line bg-white py-20 md:py-28">
      <div className="ent-container grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
        <Reveal>
          <div className="self-start lg:sticky lg:top-28">
            <h2 className="ent-display max-w-[420px] text-[clamp(34px,3.8vw,52px)] text-ent-ink">
              What you&apos;d ask before trusting your search to it.
            </h2>
            <p className="mt-5 max-w-[340px] text-[14px] leading-6 text-ent-muted">
              Got a question we missed? We&apos;re one message away.
            </p>
          </div>
        </Reveal>

        <Reveal delay={80}>
          <div className="border-t border-ent-line">
            {FAQS.map((item, index) => {
              const isOpen = open === index;
              return (
                <div key={item.q} className="border-b border-ent-line">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={`faq-panel-${index}`}
                    id={`faq-trigger-${index}`}
                    onClick={() => setOpen(isOpen ? null : index)}
                    className="group flex w-full items-center gap-4 py-5 text-left transition-colors"
                  >
                    <span className="w-7 shrink-0 text-[11.5px] tabular-nums text-ent-faint">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="flex-1 text-[14px] text-ent-ink transition-colors group-hover:text-[#3d4a2a] sm:text-[15px]">
                      {item.q}
                    </span>
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center text-ent-muted transition-transform duration-300 ${
                        isOpen ? "rotate-45 text-ent-ink" : ""
                      }`}
                      aria-hidden="true"
                    >
                      <Plus className="h-4 w-4" />
                    </span>
                  </button>
                  <div
                    id={`faq-panel-${index}`}
                    role="region"
                    aria-labelledby={`faq-trigger-${index}`}
                    className="grid transition-[grid-template-rows] duration-300 ease-out"
                    style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
                  >
                    <div className="overflow-hidden">
                      <p className="pb-5 pl-11 pr-10 text-[13px] leading-[1.75] text-ent-muted">
                        {item.a}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
