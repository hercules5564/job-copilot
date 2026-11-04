"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, CheckIcon, CopyIcon } from "../icons";
import { HeroLandscape } from "./pixel";

const SETUP_PROMPT = `Act as my job-search copilot. Use my profile, resume, and projects as the source of truth. Find roles that match my experience and preferences, rank them, and prepare applications only with facts I have approved. Ask before submitting anything.`;

export function Hero() {
  const [copied, setCopied] = useState(false);

  async function copyPrompt() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(SETUP_PROMPT);
      } else {
        const el = document.createElement("textarea");
        el.value = SETUP_PROMPT;
        el.style.position = "fixed";
        el.style.opacity = "0";
        document.body.appendChild(el);
        el.focus();
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section id="top" className="cf-hero">
      <HeroLandscape className="cf-hero-art" />

      <div className="cf-container relative z-[2]">
        <div className="cf-hero-inner">
          <div className="cf-hero-stagger" style={{ ["--stagger" as string]: 0 }}>
            <p className="cf-mono mb-5 text-[10px] text-white/65">
              An AI job-search operating system
            </p>
            <h1 className="cf-hero-title">
              JobPilot runs your entire job search with AI
            </h1>
          </div>

          <div className="cf-hero-stagger" style={{ ["--stagger" as string]: 1 }}>
            <p className="cf-hero-sub">
              Start with a discovery roadmap, then hand off research, matching,
              personalization, application prep, and follow-up to agents that
              work from your real context.
            </p>
          </div>

          <div
            className="cf-hero-stagger flex flex-wrap items-center gap-3"
            style={{ ["--stagger" as string]: 2 }}
          >
            <Link href="/login" className="cf-btn cf-btn-light cf-btn-lg">
              Open JobPilot
              <ArrowRight width={16} height={16} />
            </Link>
            <button type="button" onClick={copyPrompt} className="cf-btn cf-btn-glass cf-btn-lg">
              {copied ? <CheckIcon width={16} height={16} /> : <CopyIcon width={16} height={16} />}
              {copied ? "Copied" : "Copy setup prompt"}
            </button>
          </div>

          <div className="cf-hero-stagger" style={{ ["--stagger" as string]: 3 }}>
            <a
              href="#world-model"
              className="cf-link-arrow mt-7 inline-flex text-[13px] text-white/72 hover:text-white"
            >
              See how it works
              <ArrowRight width={14} height={14} />
            </a>
            <div className="cf-hero-meta">
              <span className="cf-agent-icons" aria-hidden="true">
                <span>CV</span>
                <span>IN</span>
                <span>GH</span>
                <span>AI</span>
              </span>
              <span>Works with the boards and tools you already use</span>
            </div>
          </div>
        </div>
      </div>

      <div className="cf-task-stack" aria-hidden="true">
        <div className="cf-task-toast">
          <span className="cf-task-dot" />
          <span>
            <b>Task completed</b> &nbsp;Role shortlist refreshed
          </span>
        </div>
        <div className="cf-task-toast">
          <span className="cf-task-dot is-running" />
          <span>
            <b>Task running</b> &nbsp;Matching 24 new roles
          </span>
        </div>
        <div className="cf-task-toast">
          <span className="cf-task-dot" />
          <span>
            <b>Task completed</b> &nbsp;Draft ready for review
          </span>
        </div>
      </div>
    </section>
  );
}
