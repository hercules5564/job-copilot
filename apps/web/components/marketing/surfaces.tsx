import type { ReactNode } from "react";
import { Logo, SectionHeading } from "./brand";
import { ActivityIcon, CodeIcon, GlobeIcon } from "./icons";
import { Reveal } from "./reveal";

function SurfaceCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="group flex h-full flex-col overflow-hidden rounded-lg border border-ent-line bg-white transition-colors duration-200 hover:border-[#cfcfc4]">
      <div className="relative flex-1 overflow-hidden bg-[#161d12]">{children}</div>
      <div className="border-t border-ent-line px-5 py-4">
        <p className="text-[13.5px] font-medium text-ent-ink">{title}</p>
        <p className="mt-1 text-[12.5px] leading-[1.6] text-ent-muted">{description}</p>
      </div>
    </div>
  );
}

function TerminalVisual() {
  return (
    <div className="relative h-[330px] overflow-hidden p-4 sm:p-5">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(110% 90% at 50% 0%, rgba(96,124,60,0.3) 0%, rgba(19,24,15,0.6) 55%, #10140d 100%)",
        }}
      />
      <div className="pointer-events-none absolute inset-0 ent-noise-dark opacity-50" />
      <div className="relative overflow-hidden rounded-md border border-[#2c3626] bg-[#0d110a]/95 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
        <div className="flex items-center gap-2 border-b border-[#232c1e] px-3 py-2">
          <span className="h-2 w-2 rounded-full bg-[#4a4a44]" />
          <span className="h-2 w-2 rounded-full bg-[#4a4a44]" />
          <span className="h-2 w-2 rounded-full bg-[#4a4a44]" />
          <span className="ml-2 text-[9.5px] text-[#8b9782]">
            maya@search: ~/jobpilot
          </span>
          <span className="ml-auto rounded border border-[#38462e] bg-[#141a10] px-1.5 py-0.5 text-[8.5px] text-[#a4c77e]">
            autopilot · on
          </span>
        </div>
        <div className="space-y-[5px] p-3.5 font-mono text-[10px] leading-[1.55] text-[#c8d2bf]">
          <p className="text-[#e6ede0]">
            <span className="text-[#9ec27a]">$</span> jobpilot autopilot on
          </p>
          <p className="text-[#9db88a]">
            <span className="text-[#8fd23c]">✓</span> Autopilot on. 12 roles matched
            above 80. 9 prepared, 3 need review.
          </p>
          <p className="text-[#e6ede0]">
            <span className="text-[#9ec27a]">$</span> jobpilot run --today
            <span className="float-right text-[#8fd23c]">9 prepared</span>
          </p>
          <p className="text-[#9aa894]">
            <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-[#8fd23c]" />
            matched → <span className="text-[#c9d9bd]">Acme · Senior Backend</span> score
            92
          </p>
          <p className="text-[#9aa894]">
            <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-[#8fd23c]" />
            matched → <span className="text-[#c9d9bd]">Beta · Platform Engineer</span>{" "}
            score 88
          </p>
          <p className="text-[#e6ede0]">
            <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-[#d3a55a]" />
            review 3 questions need your answer before submit
          </p>
          <p className="text-[#8b9782]">
            <span className="text-[#7fa06a]">run</span> s_8f3a2c · 18 min ·{" "}
            <span className="text-[#c9d9bd]">9 applications prepared</span> ·{" "}
            <span className="text-[#8fd23c]">0 submitted</span>
          </p>
          <p className="text-[#9ec27a]">$</p>
        </div>
      </div>
      <p className="relative mt-4 text-center font-mono text-[9px] tracking-[0.08em] text-[#6f7a64]">
        3 sources connected · threshold 80 · waiting for your approval
      </p>
    </div>
  );
}

const SOURCES = [
  { name: "Resume", mark: "▤", color: "#e8e8e2" },
  { name: "Projects", mark: "◈", color: "#e0b45a" },
  { name: "Profile", mark: "◉", color: "#9fc7f0" },
  { name: "Answers", mark: "✎", color: "#9fc7f0" },
  { name: "Outcomes", mark: "◌", color: "#9fc7f0" },
];

const OUTPUTS = [
  { name: "Cover letter", icon: <CodeIcon className="h-3 w-3" /> },
  { name: "Form answers", icon: <ActivityIcon className="h-3 w-3" /> },
  { name: "Fit summary", icon: <GlobeIcon className="h-3 w-3" /> },
];

function PersonalizationVisual() {
  return (
    <div className="relative h-[330px] overflow-hidden p-4 sm:p-5">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(110% 90% at 50% 0%, rgba(96,124,60,0.28) 0%, rgba(19,24,15,0.6) 55%, #10140d 100%)",
        }}
      />
      <div className="pointer-events-none absolute inset-0 ent-noise-dark opacity-50" />

      <div className="relative grid h-full grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="flex flex-col gap-2">
          {SOURCES.map((source) => (
            <div
              key={source.name}
              className="flex items-center gap-2 rounded-md border border-[#303b29] bg-[#121710]/95 px-2 py-1.5 text-[10px] text-[#d3ddc8] shadow-[0_2px_8px_rgba(0,0,0,0.25)]"
            >
              <span
                className="flex h-4 w-4 items-center justify-center rounded-[3px] text-[10px]"
                style={{ color: source.color }}
              >
                {source.mark}
              </span>
              <span className="truncate">{source.name}</span>
            </div>
          ))}
        </div>

        <div className="relative flex flex-col items-center gap-3">
          <span className="rounded-md border border-[#3a4830] bg-[#151b11] px-2 py-1.5 text-[9.5px] text-[#b7c8a7]">
            CONTEXT
          </span>
          <Logo className="h-12 w-12 rounded-[9px] shadow-[0_0_36px_rgba(127,199,10,0.35)]" />
          <span className="text-[8.5px] text-[#7f8f70]">approved facts</span>
        </div>

        <div className="flex flex-col gap-2">
          {OUTPUTS.map((output) => (
            <div
              key={output.name}
              className="flex items-center gap-2 rounded-md border border-[#303b29] bg-[#121710]/95 px-2 py-2 text-[10px] text-[#d3ddc8] shadow-[0_2px_8px_rgba(0,0,0,0.25)]"
            >
              <span className="text-[#9ec27a]">{output.icon}</span>
              <span className="truncate">{output.name}</span>
            </div>
          ))}
        </div>

        <div className="pointer-events-none absolute inset-y-8 left-[31%] right-[31%]">
          <div className="absolute left-0 top-1/2 h-px w-full bg-gradient-to-r from-transparent via-[#4c6236] to-transparent" />
          <div className="absolute left-1/2 top-[20%] h-[60%] w-px bg-gradient-to-b from-transparent via-[#4c6236] to-transparent" />
        </div>
      </div>

      <p className="absolute inset-x-0 bottom-4 text-center font-mono text-[9px] tracking-[0.08em] text-[#6f7a64]">
        facts are sourced, never invented
      </p>
    </div>
  );
}

const CHART_PATH =
  "M0 92 L14 60 L26 88 L38 42 L50 78 L62 50 L74 68 L86 32 L98 86 L110 55 L122 72 L134 30 L146 80 L158 46 L170 65 L182 38 L194 74 L206 52 L218 62 L230 26 L242 48 L254 34 L266 40 L278 28 L290 33 L302 25 L314 30 L326 22 L338 27 L350 20 L362 26 L374 18 L386 24 L398 16 L400 16";

function PlatformVisual() {
  return (
    <div className="relative h-[330px] overflow-hidden p-4 sm:p-5">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(110% 90% at 50% 0%, rgba(96,124,60,0.3) 0%, rgba(19,24,15,0.6) 55%, #10140d 100%)",
        }}
      />
      <div className="pointer-events-none absolute inset-0 ent-noise-dark opacity-50" />

      <div className="relative h-full overflow-hidden rounded-md border border-[#2c3626] bg-[#0c100a]/95">
        <div className="flex items-center border-b border-[#232c1e] px-3 py-2">
          <span className="flex items-center gap-1.5 text-[9.5px] text-[#a6b89a]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#8fd23c]" />
            JobPilot Dashboard
          </span>
          <span className="ml-auto text-[8.5px] text-[#6f7a64]">Past 3 months</span>
        </div>

        <div className="grid grid-cols-3 gap-2 p-2.5">
          {[
            { label: "Applications", value: "42", note: "this week", tone: "" },
            { label: "Interviews", value: "6", note: "+2 WoW", tone: "text-[#8fd23c]" },
            { label: "Reply rate", value: "31%", note: "above average", tone: "text-[#8fd23c]" },
          ].map((stat) => (
            <div key={stat.label} className="rounded border border-[#26301f] bg-[#11160e] p-2">
              <p className="text-[8px] text-[#7d8a71]">{stat.label}</p>
              <p className="mt-0.5 text-[12px] font-medium text-[#e9efe2]">{stat.value}</p>
              <p className={`text-[7.5px] ${stat.tone || "text-[#7d8a71]"}`}>{stat.note}</p>
            </div>
          ))}
        </div>

        <div className="px-2.5">
          <p className="mb-1 text-[8px] text-[#7d8a71]">Applications over time</p>
          <svg viewBox="0 0 400 110" className="h-[110px] w-full" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="ent-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8fd23c" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#8fd23c" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={`${CHART_PATH} L400 110 L0 110 Z`} fill="url(#ent-area)" />
            <path d={CHART_PATH} fill="none" stroke="#9ade3a" strokeWidth="1.6" />
          </svg>
        </div>

        <div className="flex justify-between px-2.5 text-[7.5px] text-[#6f7a64]">
          <span>Dec 14</span>
          <span>Jan 30</span>
          <span>Mar 02</span>
          <span>Apr 07</span>
          <span>May 30</span>
        </div>
      </div>
    </div>
  );
}

function SlackVisual() {
  return (
    <div className="relative h-[330px] overflow-hidden p-4 sm:p-5">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(110% 90% at 50% 0%, rgba(96,124,60,0.24) 0%, rgba(19,24,15,0.6) 55%, #10140d 100%)",
        }}
      />
      <div className="pointer-events-none absolute inset-0 ent-noise-dark opacity-50" />

      <div className="relative flex h-full overflow-hidden rounded-md border border-[#2c3626] bg-[#0b0e09]/95">
        <div className="hidden w-9 flex-col items-center gap-2 border-r border-[#232c1e] bg-[#0e120b] py-3 sm:flex">
          <span className="h-4 w-4 rounded bg-[#7fc70a]" />
          <span className="h-4 w-4 rounded bg-[#283222]" />
          <span className="h-4 w-4 rounded bg-[#283222]" />
          <span className="mt-2 h-4 w-4 rounded bg-[#283222]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 border-b border-[#232c1e] px-3 py-2">
            <span className="text-[9.5px] text-[#d6e0cc]">Inbox · JobPilot</span>
            <span className="ml-auto flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-[#5b9bd5]" />
              <span className="h-2 w-2 rounded-sm bg-[#d3a55a]" />
              <span className="h-2 w-2 rounded-sm bg-[#d47777]" />
            </span>
          </div>
          <div className="space-y-2.5 p-3 text-[9px] leading-[1.55]">
            <div>
              <p className="text-[#9fb094]">
                <span className="font-medium text-[#d6e0cc]">Acme Recruiting</span>
                <span className="ml-1 text-[7.5px] text-[#6f7a64]">08:17</span>
              </p>
              <p className="text-[#c5d1bb]">
                <span className="mr-1 rounded bg-[#2c3a22] px-1 text-[8px] text-[#b6e35a]">
                  Interview
                </span>
                Next step for Senior Backend Engineer — are you free Thursday?
              </p>
            </div>
            <div>
              <p className="flex items-center gap-1 text-[#9fb094]">
                <span className="ent-orb h-3 w-3" />
                <span className="font-medium text-[#d6e0cc]">JobPilot</span>
                <span className="ml-1 text-[7.5px] text-[#6f7a64]">08:18</span>
              </p>
              <p className="text-[#c5d1bb]">
                Filed to application #4821 and added interview round 1 to your tracker.
              </p>
              <p className="mt-1.5 text-[#b6c4aa]">This week&apos;s replies:</p>
              <ul className="ml-3 list-disc space-y-0.5 text-[#aebda3] marker:text-[#6f8a4f]">
                <li>Acme — interview invite, filed automatically</li>
                <li>Beta — follow-up due today</li>
                <li>Gamma — rejection noted, skill gap saved to graph</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
      <p className="absolute inset-x-0 bottom-4 text-center font-mono text-[9px] tracking-[0.08em] text-[#6f7a64]">
        read-only Gmail sync, filed on the right application
      </p>
    </div>
  );
}

export function SurfacesSection() {
  return (
    <section id="surfaces" className="border-t border-ent-line bg-white py-20 md:py-28">
      <div className="ent-container">
        <Reveal>
          <SectionHeading
            eyebrow="JobPilot Surfaces"
            title={
              <>
                JobPilot wherever
                <br />
                your search runs
              </>
            }
            description="Discovery, matching and tracking all read that one graph, so connecting your profile sets up everything."
          />
        </Reveal>

        <div className="mt-11 grid gap-5 lg:grid-cols-2">
          <Reveal>
            <SurfaceCard
              title="Autopilot"
              description="Prepares applications from your best matches and stops for your approval."
            >
              <TerminalVisual />
            </SurfaceCard>
          </Reveal>
          <Reveal delay={90}>
            <SurfaceCard
              title="Personalization"
              description="Drafts cover letters and answers from approved facts — never invented experience."
            >
              <PersonalizationVisual />
            </SurfaceCard>
          </Reveal>
          <Reveal delay={60}>
            <SurfaceCard
              title="Dashboard"
              description="Your whole search in one place. Matches, applications and follow-ups, every source."
            >
              <PlatformVisual />
            </SurfaceCard>
          </Reveal>
          <Reveal delay={140}>
            <SurfaceCard
              title="Gmail Inbox"
              description="Reads replies read-only and files every update onto the right application."
            >
              <SlackVisual />
            </SurfaceCard>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
