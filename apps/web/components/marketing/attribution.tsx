"use client";

import { useState, type ReactNode } from "react";
import { SectionHeading } from "./brand";
import {
  ActivityIcon,
  FlowIcon,
  LayersIcon,
  TokenIcon,
  UserIcon,
} from "./icons";
import { Reveal } from "./reveal";

type TabKey = "signals" | "ledger" | "waste" | "engineer" | "flow";

const TABS: { key: TabKey; title: string; description: string; icon: ReactNode }[] = [
  {
    key: "signals",
    title: "Pipeline",
    description:
      "How your search moves. Discovered, matched, applied, replied, interviewed — against a healthy range.",
    icon: <ActivityIcon className="h-4 w-4" />,
  },
  {
    key: "ledger",
    title: "Matches",
    description:
      "Every role and score mapped to the experience that earned it.",
    icon: <LayersIcon className="h-4 w-4" />,
  },
  {
    key: "waste",
    title: "Follow-ups",
    description:
      "Where replies are waiting and which application needs a nudge.",
    icon: <TokenIcon className="h-4 w-4" />,
  },
  {
    key: "engineer",
    title: "Interviews",
    description:
      "Rounds, dates and notes tied to the role that produced them.",
    icon: <UserIcon className="h-4 w-4" />,
  },
  {
    key: "flow",
    title: "Learning",
    description:
      "How each outcome changes the next match and the next answer.",
    icon: <FlowIcon className="h-4 w-4" />,
  },
];

const RELEASES = [
  {
    id: "#4821",
    text: "Senior Backend Engineer · Acme",
    meta: "Applied · app_8f3a2c · 2h ago",
    status: "In review",
  },
  {
    id: "#4817",
    text: "Platform Engineer · Beta",
    meta: "Reply · app_71be09 · yesterday",
    status: "Interview",
  },
  {
    id: "#4809",
    text: "Data Engineer · Gamma",
    meta: "No reply · app_5c2d11 · 3d ago",
    status: "Follow-up due",
  },
  {
    id: "#4802",
    text: "Product Engineer · Delta",
    meta: "Rejected · skill gap: Go",
    status: "Learned",
  },
];

const WEEKS = [
  {
    id: "#4821",
    kind: "Interview",
    text: "Acme moved you to round 2",
  },
  {
    id: "#4817",
    kind: "Follow-up",
    text: "Beta replied — follow up today",
  },
  {
    id: "#4802",
    kind: "New match",
    text: "Gamma role matched at 91",
  },
];

function TabsPanel() {
  const [active, setActive] = useState<TabKey>("signals");

  return (
    <div className="flex h-full flex-col bg-white">
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <div key={tab.key} className="border-b border-ent-line last:border-b-0">
            <button
              type="button"
              onClick={() => setActive(tab.key)}
              aria-expanded={isActive}
              className={`w-full border-l-[3px] px-5 py-4 text-left transition-colors ${
                isActive
                  ? "border-ent-lime bg-[#f5faea]"
                  : "border-transparent hover:bg-[#fafaf7]"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded ${
                    isActive ? "text-ent-ink" : "text-ent-faint"
                  }`}
                >
                  {tab.icon}
                </span>
                <span className="text-[14px] text-ent-ink">{tab.title}</span>
                <span
                  className={`ml-auto text-[10px] transition-transform duration-200 ${
                    isActive ? "rotate-45 text-ent-lime" : "text-ent-faint"
                  }`}
                  aria-hidden="true"
                >
                  +
                </span>
              </span>
              <div
                className="grid transition-[grid-template-rows] duration-300 ease-out"
                style={{ gridTemplateRows: isActive ? "1fr" : "0fr" }}
              >
                <div className="overflow-hidden">
                  <p className="pl-[30px] pt-2 text-[12px] leading-5 text-ent-muted">
                    {tab.description}
                  </p>
                </div>
              </div>
            </button>
          </div>
        );
      })}
    </div>
  );
}

function ReleaseNotesVisual() {
  return (
    <div className="relative min-h-[500px] overflow-hidden bg-[#1c2318] p-5 sm:p-8 lg:min-h-[540px]">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 30% 15%, rgba(96,124,70,0.32) 0%, rgba(25,31,21,0.5) 48%, #141810 100%)",
        }}
      />
      <div className="pointer-events-none absolute inset-0 ent-noise-dark opacity-60" />

      <div className="relative mx-auto max-w-[600px]">
        <div className="w-[88%] rounded-md border border-white/10 bg-[#c8cbc2]/75 p-4 shadow-[0_16px_40px_rgba(0,0,0,0.28)] backdrop-blur-sm sm:w-[78%]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[12.5px] font-medium text-[#1d211a]">
                Weekly search digest
              </p>
              <p className="mt-0.5 text-[10px] text-[#4d5446]">
                Mondays 09:00 · #job-search
              </p>
            </div>
            <span className="rounded border border-[#9aa191] bg-white/40 px-1.5 py-0.5 text-[9px] text-[#4d5446]">
              Scheduled
            </span>
          </div>
          <div className="mt-3 flex flex-col gap-1.5">
            {RELEASES.map((release) => (
              <div
                key={release.id}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded border border-[#aeb3a7]/70 bg-white/20 px-2 py-1.5"
              >
                <span className="rounded border border-[#a3aa9b] px-1 py-0.5 text-[8.5px] text-[#444b3d]">
                  APP
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[10.5px] text-[#22261f]">
                    <span className="mr-1 text-[#555c4d]">{release.id}</span>
                    {release.text}
                  </p>
                  <p className="truncate text-[8.5px] text-[#5d6455]">{release.meta}</p>
                </div>
                <span className="whitespace-nowrap rounded border border-[#a3aa9b]/80 px-1 py-0.5 text-[8px] text-[#4a5142]">
                  {release.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 -mt-7 ml-auto w-[94%] rounded-md border border-black/10 bg-[#fdfdfb] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.4)] sm:w-[78%]">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-[5px] bg-ent-lime text-[13px] font-bold text-[#142006]">
              J
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-medium text-ent-ink">JobPilot Pulse</p>
              <p className="text-[9px] uppercase tracking-wide text-ent-faint">
                APP · Mon 09:00
              </p>
            </div>
          </div>

          <p className="mt-3 text-[11.5px] font-medium text-ent-ink">
            Search digest · week 37
          </p>

          <div className="mt-2 flex flex-col gap-1.5">
            {WEEKS.map((item) => (
              <div key={item.id} className="flex items-center gap-1.5">
                <span className="rounded border border-ent-line bg-[#f4f4ef] px-1 py-0.5 text-[8.5px] text-ent-muted">
                  {item.id}
                </span>
                <span className="rounded border border-[#a9d070] bg-[#eef9d4] px-1 py-0.5 text-[8.5px] text-[#4d7c08]">
                  {item.kind}
                </span>
                <span className="truncate text-[9.5px] text-ent-ink/80">{item.text}</span>
              </div>
            ))}
          </div>

          <div className="mt-2.5 rounded border border-[#dbe8c4] bg-[#f4faea] p-2">
            <div className="flex items-center gap-1.5">
              <span className="rounded border border-[#c9d8ae] bg-white/70 px-1 py-0.5 text-[8.5px] text-ent-muted">
                #4809
              </span>
              <span className="text-[9px] text-[#6f7a5c]">Saved for later</span>
            </div>
            <p className="mt-1 text-[9.5px] text-ent-ink/80">
              Delta rejected: Go depth noted for the next match
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AttributionSection() {
  return (
    <section id="search-behavior" className="border-t border-ent-line bg-white py-20 md:py-28">
      <div className="ent-container">
        <Reveal>
          <SectionHeading
            eyebrow="Search Behavior"
            title={
              <>
                Attribute every application to its outcome.
              </>
            }
            description="Every application is recorded in the graph. Understand the match, the reply, and what to change next."
          />
        </Reveal>

        <Reveal className="mt-10" delay={70}>
          <div className="grid overflow-hidden border border-ent-line lg:grid-cols-[360px_minmax(0,1fr)]">
            <TabsPanel />
            <ReleaseNotesVisual />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
