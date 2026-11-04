"use client";

import { useState } from "react";
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
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="cf-section cf-container">
      <div className="grid gap-12 lg:grid-cols-[0.82fr_1.18fr] lg:gap-20">
        <Reveal>
          <div className="lg:sticky lg:top-28">
            <span className="cf-eyebrow">Questions</span>
            <h2 className="cf-section-title mt-3 max-w-[420px]">
              What you&apos;d ask before trusting your search to it.
            </h2>
            <p className="mt-5 max-w-[340px] text-[14px] leading-6 text-[var(--ink-muted)]">
              Got a question we missed? The answer is probably one message away.
            </p>
          </div>
        </Reveal>

        <Reveal delay={80}>
          <div className="cf-faq mt-0">
            {FAQS.map((item, index) => {
              const isOpen = open === index;
              return (
                <div key={item.q} className="cf-faq-item">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={`faq-panel-${index}`}
                    id={`faq-trigger-${index}`}
                    className="cf-faq-button"
                    onClick={() => setOpen(isOpen ? null : index)}
                  >
                    <span className="flex items-baseline gap-4">
                      <span className="cf-mono w-7 shrink-0 text-[9px] text-[var(--ink-faint)]">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span>{item.q}</span>
                    </span>
                    <span className="cf-faq-plus" aria-hidden="true">
                      +
                    </span>
                  </button>
                  <div
                    id={`faq-panel-${index}`}
                    role="region"
                    aria-labelledby={`faq-trigger-${index}`}
                    className="cf-faq-answer"
                  >
                    <div>
                      <p className="pl-11">{item.a}</p>
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
