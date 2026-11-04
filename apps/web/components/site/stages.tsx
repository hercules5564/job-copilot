"use client";

import { useState } from "react";
import { Reveal } from "./reveal";
import { BlueDecor } from "./pixel";

type StageItem = { label: string; detail: string };

function StageList({ items, base }: { items: StageItem[]; base: number }) {
  const [open, setOpen] = useState(0);
  return (
    <div className="cf-stage-list">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.label} className="cf-stage-item" data-open={isOpen}>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? -1 : i)}
            >
              <span>
                <b>{`${base}.${i + 1}`}</b>
                {item.label}
              </span>
              <span className="cf-stage-plus" aria-hidden="true">
                +
              </span>
            </button>
            {isOpen ? <div className="cf-stage-detail">{item.detail}</div> : null}
          </div>
        );
      })}
    </div>
  );
}

function DiscoverMock() {
  return (
    <div className="cf-mock">
      <div className="cf-mock-toolbar">
        <span className="cf-mock-dot" />
        <span className="cf-mock-dot" />
        <span className="cf-mock-dot" />
        <span className="cf-mono ml-2 text-[8px] text-[var(--ink-faint)]">
          Discovery board
        </span>
      </div>
      <div className="cf-kanban">
        {[
          {
            title: "Watching",
            count: "18 sources",
            cards: [
              { t: "Senior Product Designer", c: "Northwind · remote", meta: "New" },
              { t: "Staff Frontend Engineer", c: "Kite · hybrid", meta: "New" },
              { t: "Design Systems Lead", c: "Mesa · remote", meta: "Saved" },
            ],
          },
          {
            title: "Matched",
            count: "24 roles",
            cards: [
              { t: "Product Design Manager", c: "Lumen · remote", meta: "91" },
              { t: "UX Lead, Growth", c: "Orbit · remote", meta: "88" },
              { t: "Principal Designer", c: "Cove · hybrid", meta: "86" },
            ],
          },
          {
            title: "Shortlisted",
            count: "3 strong",
            cards: [
              { t: "Design Lead, Platform", c: "Harbor · remote", meta: "94" },
              { t: "Senior Product Designer", c: "Aster · remote", meta: "92" },
            ],
          },
        ].map((col) => (
          <div key={col.title} className="cf-kanban-col">
            <div className="cf-kanban-head">
              <span>{col.title}</span>
              <span>{col.count}</span>
            </div>
            {col.cards.map((card, i) => (
              <div
                key={card.t}
                className={`cf-task-card ${i === 1 && col.title === "Matched" ? "is-accent" : ""}`}
              >
                <b>{card.t}</b>
                {card.c}
                <br />
                <span>{card.meta}</span>
              </div>
            ))}
            <div className="cf-task-card is-ghost">
              <b>Agent task queued</b>
              Sync next board
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MatchMock() {
  const bars = [42, 55, 48, 64, 58, 72, 68, 84, 78, 92, 88, 96];
  const meters = [
    { label: "Skills", value: 94, color: "#1a6fd1" },
    { label: "Role fit", value: 89, color: "#4c9f38" },
    { label: "Experience", value: 86, color: "#c8a91f" },
    { label: "Location", value: 100, color: "#6b57c8" },
  ];
  return (
    <div className="cf-mock">
      <div className="cf-mock-toolbar">
        <span className="cf-mock-dot" />
        <span className="cf-mock-dot" />
        <span className="cf-mock-dot" />
        <span className="cf-mono ml-2 text-[8px] text-[var(--ink-faint)]">
          Match report
        </span>
      </div>
      <div className="cf-report">
        <div className="cf-report-row">
          <div>
            <span className="cf-mono text-[8.5px] text-[var(--ink-faint)]">
              Overall match
            </span>
            <div className="cf-big-number">92</div>
          </div>
          <span className="cf-delta">↑ 12 pts from profile update</span>
        </div>
        <div className="cf-bars">
          {bars.map((h, i) => (
            <i key={i} style={{ height: `${h}%`, animationDelay: `${i * 45}ms` }} />
          ))}
        </div>
        <div className="cf-meters">
          {meters.map((m, i) => (
            <div key={m.label} className="cf-meter-row">
              <span>{m.label}</span>
              <span className="cf-meter-track">
                <i
                  style={{
                    width: `${m.value}%`,
                    ["--meter" as string]: m.color,
                    animationDelay: `${i * 80}ms`,
                  }}
                />
              </span>
              <span>{m.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ApplyMock() {
  const bars = [28, 36, 32, 45, 42, 58, 54, 66, 62, 74, 72, 82];
  return (
    <div className="cf-mock">
      <div className="cf-mock-toolbar">
        <span className="cf-mock-dot" />
        <span className="cf-mock-dot" />
        <span className="cf-mock-dot" />
        <span className="cf-mono ml-2 text-[8px] text-[var(--ink-faint)]">
          Application workspace
        </span>
      </div>
      <div className="cf-stats-mock">
        <div className="cf-stats-cell">
          <span>Ready to send</span>
          <b>6</b>
          <em>+3 today</em>
        </div>
        <div className="cf-stats-cell">
          <span>In review</span>
          <b>4</b>
          <em>needs you</em>
        </div>
        <div className="cf-stats-cell">
          <span>Responses</span>
          <b>38%</b>
          <em>+9% this month</em>
        </div>
      </div>
      <div className="cf-chart">
        <div className="flex items-center justify-between">
          <span className="cf-mono text-[8.5px] text-[var(--ink-faint)]">
            Applications over time
          </span>
          <span className="cf-mono text-[8.5px] text-[var(--ink-faint)]">
            Last 12 weeks
          </span>
        </div>
        <div className="cf-chart-line">
          {bars.map((h, i) => (
            <i
              key={i}
              className={h > 60 ? "is-hot" : ""}
              style={{ height: `${h}%`, animationDelay: `${i * 55}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

const STAGES = [
  {
    id: "search-behavior",
    numeral: "1.0",
    kicker: "Discover",
    title: "JobPilot finds the roles you would never have time to search for",
    body: "Give JobPilot the boards, role targets, locations, and deal-breakers. It keeps watching, normalizes every listing, and hands you a clean queue with duplicates and noise removed.",
    items: [
      { label: "Target roles and preferred boards", detail: "Set the roles, locations, work modes, and source boards once. Discovery agents keep them warm on a schedule you control." },
      { label: "Duplicate and noise removal", detail: "Listings are normalized and deduplicated so the same job does not appear three different ways across four boards." },
      { label: "Salary and remote filters", detail: "Minimum salary, remote-only, employment type, and excluded keywords are applied before anything reaches your queue." },
      { label: "Signals before the posting", detail: "Hiring-signal leads surface companies that are growing teams before the perfect role is public." },
    ],
    mock: <DiscoverMock />,
  },
  {
    id: "review",
    numeral: "2.0",
    kicker: "Match",
    title: "JobPilot turns your real experience into a ranked shortlist",
    body: "Every role is scored against your profile, resume, and projects. You see the evidence, the missing skills, and the reason behind each decision — not a mystery number.",
    items: [
      { label: "Evidence-backed scoring", detail: "Skills, role, experience, location, salary, and education are scored separately and combined into one decision." },
      { label: "Matched and missing skills", detail: "See exactly which requirements you cover and which ones need a story, a project, or a skip." },
      { label: "Human-readable reasons", detail: "Each score comes with plain-language reasons and warnings so you can judge the match yourself." },
      { label: "Semantic and deterministic modes", detail: "Use fast deterministic scoring or semantic matching when you want a deeper read." },
    ],
    mock: <MatchMock />,
    reverse: true,
  },
  {
    id: "surfaces-review",
    numeral: "3.0",
    kicker: "Apply",
    title: "JobPilot prepares every application with your context",
    body: "Resume versions, project proof, tailored summaries, cover letters, and application runs all stay in one workspace. Nothing is submitted without your explicit approval.",
    items: [
      { label: "Tailored summaries and answers", detail: "Drafts are generated from approved facts, with every claim traceable back to your profile or projects." },
      { label: "Resume versions per application", detail: "Associate the right resume, keep version history, and change it without losing the original." },
      { label: "Review before anything ships", detail: "Application runs pause at review, login, and submission checkpoints. You stay in control." },
      { label: "Timeline and follow-through", detail: "Replies, interviews, assessments, and offers are classified into a single timeline." },
    ],
    mock: <ApplyMock />,
  },
];

export function ProductStages() {
  return (
    <section className="cf-section cf-container">
      <Reveal className="cf-what-title">
        <span className="cf-eyebrow">What JobPilot does</span>
        <h2>
          Keep building your career.
          <br />
          Put JobPilot to work on the search.
        </h2>
        <p className="max-w-[520px] text-[14.5px] leading-relaxed text-[var(--ink-muted)]">
          Start with the outcome you need. JobPilot brings the right context
          and capabilities together, then keeps you in control of what goes live.
        </p>
      </Reveal>

      {STAGES.map((stage) => (
        <div
          key={stage.id}
          id={stage.id}
          className={`cf-stage ${stage.reverse ? "is-reverse" : ""}`}
        >
          <div className="cf-stage-copy">
            <span className="cf-mono text-[9.5px] text-[var(--ink-faint)]">
              {stage.numeral} — {stage.kicker}
            </span>
            <h3>{stage.title}</h3>
            <p>{stage.body}</p>
            <StageList items={stage.items} base={Number(stage.numeral.split(".")[0])} />
          </div>
          <Reveal delay={80}>{stage.mock}</Reveal>
        </div>
      ))}
    </section>
  );
}

const BLUE_TABS = [
  {
    label: "You stay in control",
    sub: "Nothing ships without your approval",
    items: [
      { title: "Pricing page polish", tag: "BRAND AGENT", state: "review" },
      { title: "Empty-state illustrations", tag: "BRAND AGENT", state: "review" },
      { title: "Icon set v2", tag: "BRAND AGENT", state: "running" },
      { title: "Logo refresh", tag: "BRAND AGENT", state: "done" },
      { title: "Brand guidelines doc", tag: "BRAND AGENT", state: "blocked" },
    ],
  },
  {
    label: "Run tasks in the background",
    sub: "Multiple agents, one shared context",
    items: [
      { title: "Match 24 new roles", tag: "MATCH AGENT", state: "running" },
      { title: "Refresh discovery queue", tag: "DISCOVERY", state: "done" },
      { title: "Draft tailored summary", tag: "WRITER", state: "review" },
      { title: "Classify recruiter inbox", tag: "INBOX", state: "done" },
      { title: "Sync application timeline", tag: "TRACKER", state: "running" },
    ],
  },
  {
    label: "Customize your agents",
    sub: "Apps, skills, schedules, and approvals",
    items: [
      { title: "Connect LinkedIn boards", tag: "SOURCE", state: "done" },
      { title: "Add portfolio projects", tag: "CONTEXT", state: "done" },
      { title: "Schedule weekly discovery", tag: "SCHEDULE", state: "running" },
      { title: "Require approval to submit", tag: "GUARDRAIL", state: "review" },
      { title: "Connect Gmail inbox", tag: "INTEGRATION", state: "blocked" },
    ],
  },
];

const STATE_LABEL: Record<string, { label: string; cls: string }> = {
  review: { label: "Ready to review", cls: "is-review" },
  running: { label: "Running", cls: "is-running" },
  done: { label: "Completed", cls: "is-done" },
  blocked: { label: "Blocked", cls: "is-blocked" },
};

export function BlueSection() {
  const [tab, setTab] = useState(0);
  const active = BLUE_TABS[tab];

  return (
    <section id="surfaces" className="cf-blue-band">
      <BlueDecor className="cf-blue-sky" />
      <div className="cf-container cf-blue-inner">
        <Reveal>
          <h2 className="cf-blue-title">All the tools and systems your job search needs</h2>
          <p className="cf-blue-sub">
            Give agents the context, tools, and approvals they need to keep the
            search moving. You stay in control, nothing ships without your
            approval.
          </p>
        </Reveal>

        <div className="cf-blue-tabs" role="tablist" aria-label="JobPilot capabilities">
          {BLUE_TABS.map((item, i) => (
            <button
              key={item.label}
              type="button"
              role="tab"
              aria-selected={tab === i}
              className="cf-blue-tab"
              onClick={() => setTab(i)}
            >
              <b>{item.label}</b>
              <br />
              {item.sub}
            </button>
          ))}
        </div>

        <Reveal className="cf-blue-frame" delay={80}>
          <div className="cf-blue-card" role="tabpanel">
            <div className="mx-auto max-w-[520px]">
              <div className="mb-3 flex items-center justify-between">
                <span className="cf-chip cf-chip-dot">{active.label}</span>
                <span className="cf-mono text-[8.5px] text-[var(--ink-faint)]">
                  Workspace / agents
                </span>
              </div>
              <div className="cf-pipeline-card">
                {active.items.map((item) => (
                  <div key={item.title} className="cf-pipeline-row">
                    <div>
                      <b>{item.title}</b>
                      <span>{item.tag}</span>
                    </div>
                    <span className={`cf-pipeline-pill ${STATE_LABEL[item.state].cls}`}>
                      {STATE_LABEL[item.state].label}
                    </span>
                  </div>
                ))}
              </div>
              <div className="cf-dept-row">
                {["Discover", "Match", "Personalize", "Apply", "Track", "Inbox", "Analytics"].map(
                  (dept) => (
                    <span key={dept} className="cf-dept-pill">
                      {dept}
                    </span>
                  ),
                )}
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
