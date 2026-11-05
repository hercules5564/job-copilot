"use client";

import { useMemo, type ReactNode } from "react";
import { ButtonLink, SectionHeading } from "./brand";
import {
  CalendarIcon,
  CodeIcon,
  PullRequestIcon,
  TargetIcon,
  WarningIcon,
} from "./icons";
import { Reveal } from "./reveal";

type Point = {
  x: number;
  y: number;
  r: number;
  color: string;
  opacity: number;
};

const PALETTE = [
  { color: "#6f9fc0", weight: 0.24 },
  { color: "#72b8a6", weight: 0.17 },
  { color: "#7f8d92", weight: 0.16 },
  { color: "#8fbf5a", weight: 0.14 },
  { color: "#c8a05f", weight: 0.1 },
  { color: "#c56f6f", weight: 0.09 },
  { color: "#a38ad4", weight: 0.06 },
  { color: "#b6e35a", weight: 0.04 },
];

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function pickColor(value: number) {
  let acc = 0;
  for (const item of PALETTE) {
    acc += item.weight;
    if (value <= acc) return item.color;
  }
  return PALETTE[PALETTE.length - 1].color;
}

function buildPoints(): Point[] {
  const rand = seededRandom(20261103);
  const points: Point[] = [];
  const cx = 500;
  const cy = 330;
  const maxR = 318;

  for (let i = 0; i < 1050; i += 1) {
    const angle = rand() * Math.PI * 2;
    const radius = maxR * Math.pow(rand(), 0.68);
    const jitter = (rand() - 0.5) * 6;
    points.push({
      x: round(cx + Math.cos(angle) * (radius + jitter)),
      y: round(cy + Math.sin(angle) * (radius + jitter) * 0.94),
      r: round(0.5 + rand() * 1.5),
      color: pickColor(rand()),
      opacity: round(0.42 + rand() * 0.5),
    });
  }

  for (let i = 0; i < 120; i += 1) {
    const angle = rand() * Math.PI * 2;
    const radius = 250 + rand() * 120;
    points.push({
      x: round(cx + Math.cos(angle) * radius),
      y: round(cy + Math.sin(angle) * radius),
      r: round(0.5 + rand() * 1.1),
      color: "#6f7a5b",
      opacity: round(0.25 + rand() * 0.35),
    });
  }

  return points;
}

const GRAPH_LABELS = [
  { label: "acme.com", count: "12", x: "6%", y: "30%", color: "#d7d7d0" },
  { label: "greenhouse", count: "48", x: "66%", y: "12%", color: "#b9b9b1" },
  { label: "app-4821", x: "79%", y: "33%", color: "#63d4b0" },
  { label: "interview-r2", x: "81%", y: "38%", color: "#78c2f0" },
  { label: "salary-band", x: "82%", y: "47%", color: "#a898e8" },
  { label: "staff-engineer", count: "325", x: "43%", y: "47%", color: "#f0f0e8" },
  { label: "resume-v3", x: "42%", y: "50%", color: "#c7c7bf" },
  { label: "skill-go", x: "34%", y: "43%", color: "#8fbf5a" },
  { label: "skill-k8s", x: "55%", y: "42%", color: "#8fbf5a" },
  { label: "follow-up", x: "58%", y: "45%", color: "#e8b878" },
  { label: "offer", x: "55%", y: "53%", color: "#b6e35a" },
  { label: "rejection", x: "42%", y: "55%", color: "#f0a0a0" },
  { label: "beta-inc", count: "285", x: "66%", y: "67%", color: "#c9c9c0" },
];

function WorldGraph() {
  const points = useMemo(buildPoints, []);

  return (
    <div className="relative h-[420px] w-full overflow-hidden bg-[#080908] sm:h-[540px] lg:h-[660px]">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, rgba(41,54,32,0.55) 0%, rgba(16,19,14,0.5) 42%, rgba(5,6,5,0.98) 78%)",
        }}
      />
      <div className="pointer-events-none absolute inset-0 ent-noise-dark opacity-50" />

      <div className="ent-spin-slow absolute inset-0">
        <svg
          viewBox="0 0 1000 660"
          className="h-full w-full"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          <ellipse cx="500" cy="330" rx="335" ry="322" fill="none" stroke="#26301f" strokeWidth="0.8" opacity="0.7" />
          <ellipse cx="500" cy="330" rx="286" ry="272" fill="none" stroke="#232c1e" strokeWidth="0.7" strokeDasharray="3 7" opacity="0.6" />
          <ellipse cx="500" cy="330" rx="228" ry="216" fill="none" stroke="#20281b" strokeWidth="0.7" opacity="0.55" />
          <ellipse cx="500" cy="330" rx="150" ry="142" fill="none" stroke="#1f271a" strokeWidth="0.7" strokeDasharray="2 6" opacity="0.5" />
          {points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={p.r}
              fill={p.color}
              opacity={p.opacity}
            />
          ))}
        </svg>
      </div>

      <div className="pointer-events-none absolute inset-0">
        <svg viewBox="0 0 1000 660" className="h-full w-full" preserveAspectRatio="none" aria-hidden="true">
          <g stroke="#35432a" strokeWidth="0.8" opacity="0.75">
            <path d="M500 330 L 590 290" />
            <path d="M500 330 L 620 300" />
            <path d="M500 330 L 430 300" />
            <path d="M500 330 L 575 355" />
            <path d="M500 330 L 440 365" />
            <path d="M500 330 L 680 445" />
            <path d="M500 330 L 840 300" />
            <path d="M500 330 L 660 90" />
          </g>
        </svg>
      </div>

      <div className="absolute left-4 top-4 flex max-w-[70%] flex-wrap items-center gap-x-3 gap-y-1 text-[9.5px] text-[#78836d] sm:left-5 sm:top-5 sm:text-[10px]">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-[#9d9d94]" /> company
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-[#6f9fc0]" /> application
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 bg-[#72b8a6]" /> match
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 bg-[#7f8d92]" /> skill
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rotate-45 bg-[#c56f6f]" /> rejection
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-[#8fbf5a]" /> interview
        </span>
        <span className="hidden items-center gap-1 sm:flex">
          <span className="h-px w-3 bg-[#4a5540]" /> caused
        </span>
        <span className="hidden items-center gap-1 sm:flex">
          <span className="h-px w-3 border-t border-dashed border-[#4a5540]" /> learned
        </span>
      </div>

      <div className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full border border-[#273021] bg-[#10130e]/90 px-2.5 py-1 text-[10px] text-[#a9c98a] sm:right-5 sm:top-5">
        <span className="h-1.5 w-1.5 rounded-full bg-ent-bright ent-pulse" />
        Live
      </div>

      {GRAPH_LABELS.map((item) => (
        <span
          key={item.label}
          className={`absolute hidden whitespace-nowrap rounded-[3px] border border-black/50 px-1.5 py-0.5 text-[9.5px] backdrop-blur-[2px] sm:inline-flex sm:items-center sm:gap-1 ${
            item.label === "acme.com" || item.label === "staff-engineer" || item.label === "beta-inc"
              ? "text-[11px] font-medium"
              : ""
          }`}
          style={{
            left: item.x,
            top: item.y,
            color: item.color,
            background: "rgba(9,10,8,0.78)",
          }}
        >
          {item.label}
          {item.count ? (
            <span className="rounded-full bg-[#2a3024] px-1 text-[8.5px] text-[#a4a89b]">
              {item.count}
            </span>
          ) : null}
        </span>
      ))}

      <div className="absolute bottom-4 left-4 hidden items-center gap-2 rounded-md border border-[#252d20] bg-[#0b0d0a]/85 px-2.5 py-1.5 text-[10px] text-[#8fa07f] sm:flex">
        <span className="ent-orb h-4 w-4" />
        context loaded from profile, resume, jobs and inbox
      </div>
    </div>
  );
}

function ColorBar({ tone }: { tone: "lime" | "blue" | "red" | "amber" }) {
  const color =
    tone === "lime"
      ? "#8fbf5a"
      : tone === "blue"
        ? "#78a8d8"
        : tone === "red"
          ? "#d48888"
          : "#d8b06a";
  return (
    <span
      className="inline-block h-4 w-[7px] shrink-0 rounded-full border"
      style={{ borderColor: color, background: `${color}22` }}
      aria-hidden="true"
    />
  );
}

const INGESTION = [
  { label: "Jobs discovered", value: "1,284", tone: "lime" as const },
  { label: "Applications", value: "42", tone: "lime" as const },
  { label: "Companies tracked", value: "312", tone: "blue" as const },
  { label: "Interviews", value: "6", tone: "blue" as const },
  { label: "Recruiter replies", value: "18", tone: "red" as const },
  { label: "Skills matched", value: "96", tone: "red" as const },
];

const LEARNED = [
  { icon: <WarningIcon className="h-3.5 w-3.5" />, text: "Skill gap: distributed systems in 7 roles" },
  { icon: <PullRequestIcon className="h-3.5 w-3.5" />, text: "Company signal: Acme is hiring 4 backend roles" },
  { icon: <CodeIcon className="h-3.5 w-3.5" />, text: "Answer preference: cover letters under 150 words" },
  { icon: <TargetIcon className="h-3.5 w-3.5" />, text: "Match rule: remote roles need a salary band" },
];

const ROOT_CAUSE = [
  ["application", "replied", "interview"],
  ["match", "scored", "92 / 100"],
  ["rejection", "taught", "skill gap"],
  ["follow-up", "loaded by", "inbox"],
];

function SidebarSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 border-t border-ent-line bg-[#fafaf7] px-4 py-2.5 text-[12px] text-ent-ink">
        {icon}
        {title}
      </div>
      <div>{children}</div>
    </div>
  );
}

function MemoryPanel() {
  return (
    <div className="grid overflow-hidden border border-ent-line bg-white lg:grid-cols-[360px_minmax(0,1fr)]">
      <div className="flex flex-col">
        <div className="border-b border-ent-line px-4 py-3">
          <p className="text-[12.5px] text-ent-ink">One graph, all of it connected</p>
        </div>

        <SidebarSection title="Ingestion">
          {INGESTION.map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-3 border-b border-ent-line/80 px-4 py-[7px] last:border-0"
            >
              <ColorBar tone={item.tone} />
              <span className="flex-1 text-[12px] text-ent-ink/85">{item.label}</span>
              <span className="text-[11.5px] tabular-nums text-ent-muted">{item.value}</span>
            </div>
          ))}
        </SidebarSection>

        <SidebarSection title="Learned">
          {LEARNED.map((item) => (
            <div
              key={item.text}
              className="flex items-start gap-2.5 border-b border-ent-line/80 px-4 py-2.5 last:border-0"
            >
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-ent-line bg-[#f6f6f1] text-ent-muted">
                {item.icon}
              </span>
              <span className="text-[11.5px] leading-5 text-ent-ink/80">{item.text}</span>
            </div>
          ))}
        </SidebarSection>

        <SidebarSection title="Root Cause" icon={<TargetIcon className="h-3.5 w-3.5 text-ent-muted" />}>
          <div className="px-4 py-2">
            {ROOT_CAUSE.map(([a, b, c]) => (
              <div key={a} className="grid grid-cols-[1fr_1fr_auto_1fr] items-center gap-2 py-1.5 text-[11.5px]">
                <span className="text-ent-ink/80">{a}</span>
                <span className="text-ent-muted">{b}</span>
                <span className="text-ent-faint">→</span>
                <span className="text-right text-ent-ink/80">{c}</span>
              </div>
            ))}
          </div>
        </SidebarSection>
      </div>

      <WorldGraph />
    </div>
  );
}

export function MemorySection() {
  return (
    <section id="world-model" className="relative border-t border-ent-line bg-white py-20 md:py-28">
      <div className="ent-container">
        <Reveal>
          <SectionHeading
            eyebrow="Career Graph"
            title={
              <>
                One memory of your
                <br />
                entire job search.
              </>
            }
            description="Jobs, companies, skills, applications and interviews file into one graph. Context accumulates instead of starting over."
            actions={
              <>
                <ButtonLink href="#world-model" variant="primary" arrow>
                  See your Career Graph
                </ButtonLink>
                <ButtonLink href="#cta" variant="ghost">
                  Book a demo
                  <CalendarIcon className="h-4 w-4 text-ent-muted" />
                </ButtonLink>
              </>
            }
          />
        </Reveal>

        <Reveal className="mt-11" delay={80}>
          <MemoryPanel />
        </Reveal>
      </div>
    </section>
  );
}
