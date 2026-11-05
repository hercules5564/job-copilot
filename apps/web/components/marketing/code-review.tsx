import { ButtonLink, Eyebrow } from "./brand";
import { CalendarIcon } from "./icons";
import { Reveal } from "./reveal";

function GraphVisual() {
  return (
    <div className="relative h-[210px] overflow-hidden rounded-md border border-[#26261f] bg-[#10110e]">
      <div
        className="absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.06) 0.7px, transparent 0.9px)",
          backgroundSize: "10px 10px",
        }}
      />
      <svg viewBox="0 0 260 170" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <g stroke="#4d6b2a" strokeWidth="1" opacity="0.8">
          <path d="M48 52 L 92 78 L 128 96 L 168 128" />
          <path d="M92 78 L 138 42" />
          <path d="M92 78 L 102 128" />
          <path d="M128 96 L 178 74" />
          <path d="M128 96 L 70 122" />
          <path d="M168 128 L 206 104" />
          <path d="M168 128 L 150 152" />
        </g>
        <g fill="#8fc552">
          <rect x="43" y="47" width="10" height="10" rx="1" />
          <circle cx="92" cy="78" r="5" />
          <circle cx="128" cy="96" r="5" />
          <circle cx="168" cy="128" r="6" />
        </g>
        <g fill="#6f8f48">
          <circle cx="138" cy="42" r="3" />
          <circle cx="102" cy="128" r="3" />
          <circle cx="178" cy="74" r="3" />
          <circle cx="70" cy="122" r="3" />
          <circle cx="206" cy="104" r="3" />
          <circle cx="150" cy="152" r="3" />
        </g>
        <g fill="none" stroke="#b6e35a" strokeWidth="1.2">
          <circle cx="92" cy="78" r="9" opacity="0.6" />
          <circle cx="168" cy="128" r="10" opacity="0.6" />
        </g>
      </svg>
      <span className="absolute left-[12%] top-[24%] rounded border border-[#3c4a2c] bg-[#11140e] px-1.5 py-0.5 text-[9px] text-[#cfd8c2]">
        profile
      </span>
      <span className="absolute left-[30%] top-[42%] rounded border border-[#3c4a2c] bg-[#11140e] px-1.5 py-0.5 text-[9px] text-[#cfd8c2]">
        resume
      </span>
      <span className="absolute left-[56%] top-[54%] rounded border border-[#3c4a2c] bg-[#11140e] px-1.5 py-0.5 text-[9px] text-[#cfd8c2]">
        role
      </span>
      <span className="absolute left-[60%] top-[72%] rounded border border-[#55702f] bg-[#11140e] px-1.5 py-0.5 text-[9px] text-[#c6e890]">
        interview
      </span>
      <p className="absolute inset-x-0 bottom-3 text-center font-mono text-[9px] tracking-[0.08em] text-[#6f7a64]">
        profile · resume · roles · outcomes
      </p>
    </div>
  );
}

const SIGNALS = [
  { label: "skills", segments: [100, 0, 0], tone: "red" as const },
  { label: "seniority", segments: [72, 22, 0], tone: "green" as const },
  { label: "location", segments: [58, 30, 0], tone: "amber" as const },
  { label: "salary", segments: [46, 20, 12], tone: "green" as const },
];

function SignalsVisual() {
  return (
    <div className="relative flex h-[210px] flex-col justify-center gap-3 rounded-md border border-[#26261f] bg-[#10110e] p-4">
      {SIGNALS.map((signal) => (
        <div key={signal.label} className="flex items-center gap-2">
          <span className="w-[74px] shrink-0 rounded border border-[#3b462c] px-1.5 py-1 text-[9px] text-[#c8d3ba]">
            {signal.label}
          </span>
          <div className="flex flex-1 flex-col gap-[3px]">
            {signal.segments.map((width, i) => (
              <span
                key={i}
                className={`h-[3px] rounded-full ${
                  signal.tone === "red"
                    ? "bg-[#d47777]"
                    : signal.tone === "amber"
                      ? "bg-[#d3a55a]"
                      : "bg-[#88c04a]"
                }`}
                style={{ width: `${width}%`, opacity: 1 - i * 0.25 }}
              />
            ))}
          </div>
        </div>
      ))}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-[#5b7c2c] bg-[#101608] px-1.5 py-1 text-[8.5px] text-[#b6e35a]">
        Strong fit
      </div>
    </div>
  );
}

function DiffVisual() {
  return (
    <div className="relative h-[210px] overflow-hidden rounded-md border border-[#26261f] bg-[#10110e] p-4">
      <p className="mb-3 text-[9.5px] text-[#8f9a84]">application #4821</p>
      <div className="flex flex-col gap-[7px]">
        <div className="flex items-center gap-2">
          <span className="w-2 text-[9px] text-[#6f7a64]">1</span>
          <span className="h-[5px] w-[46%] rounded-full bg-[#3b3f38]" />
        </div>
        <div className="flex items-center gap-2 rounded bg-[#142008] px-1 py-0.5">
          <span className="w-2 text-[9px] text-[#7fa84a]">+</span>
          <span className="h-[5px] w-[74%] rounded-full bg-[#6da52c]" />
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 text-[9px] text-[#6f7a64]">3</span>
          <span className="h-[5px] w-[60%] rounded-full bg-[#3b3f38]" />
        </div>
        <div className="flex items-center gap-2 rounded bg-[#2a1111] px-1 py-0.5">
          <span className="w-2 text-[9px] text-[#d47777]">-</span>
          <span className="h-[5px] w-[68%] rounded-full bg-[#a55b5b]" />
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 text-[9px] text-[#6f7a64]">5</span>
          <span className="h-[5px] w-[38%] rounded-full bg-[#3b3f38]" />
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 text-[9px] text-[#6f7a64]">6</span>
          <span className="h-[5px] w-[52%] rounded-full bg-[#3b3f38]" />
        </div>
      </div>

      <div className="absolute bottom-4 right-4 w-[74%] rounded-md border border-[#2f3728] bg-[#161a12] p-2.5 shadow-[0_12px_28px_rgba(0,0,0,0.45)]">
        <div className="flex items-center gap-1.5">
          <span className="ent-orb h-4 w-4" />
          <span className="text-[8.5px] text-[#c6d8b4]">copilot</span>
        </div>
        <div className="mt-2 flex flex-col gap-1">
          <span className="h-[3px] w-[92%] rounded-full bg-[#3b4534]" />
          <span className="h-[3px] w-[76%] rounded-full bg-[#3b4534]" />
        </div>
      </div>
    </div>
  );
}

const CARDS = [
  {
    title: "Indexes your profile and application history",
    body: "Resumes, projects, answers, interviews and every response land in one graph.",
    visual: <GraphVisual />,
  },
  {
    title: "Reads each role in parallel",
    body: "Separate passes for skills, seniority, location and salary. Judges fit beyond keywords.",
    visual: <SignalsVisual />,
  },
  {
    title: "Turns every outcome into a rule",
    body: "A rejection or reply becomes context the next application is checked against.",
    visual: <DiffVisual />,
  },
];

export function CodeReviewSection() {
  return (
    <section id="review" className="relative overflow-hidden bg-[#0d0d0c] py-20 text-white md:py-28">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(70% 50% at 50% 0%, rgba(88,120,40,0.16) 0%, transparent 70%)",
        }}
      />
      <div className="pointer-events-none absolute inset-0 ent-noise-dark opacity-40" />

      <div className="ent-container relative">
        <Reveal>
          <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-[920px]">
              <Eyebrow variant="dark">Application Copilot</Eyebrow>
              <h2 className="ent-display mt-5 text-[clamp(36px,4vw,54px)] text-[#f2f2ec]">
                A copilot that learns from every
                <br />
                application you send
              </h2>
              <p className="mt-5 max-w-[560px] text-[15.5px] leading-7 text-[#a1a199]">
                The career graph connects every role, resume and response. The copilot
                makes the next application better than the last.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 pt-1">
              <ButtonLink href="#cta" variant="primary" arrow>
                Try Application Copilot
              </ButtonLink>
              <ButtonLink href="#cta" variant="outlineDark">
                Book a demo
                <CalendarIcon className="h-4 w-4" />
              </ButtonLink>
            </div>
          </div>
        </Reveal>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {CARDS.map((card, index) => (
            <Reveal key={card.title} delay={index * 90}>
              <div className="h-full rounded-lg border border-[#292924] bg-[#141413] p-4">
                {card.visual}
                <div className="mt-4 flex items-start gap-2.5 px-1 pb-1">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[#23231f] text-[10px] text-[#c9c9c0]">
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-[13.5px] font-medium text-[#e9e9e2]">
                      {card.title}
                    </p>
                    <p className="mt-1.5 text-[12px] leading-[1.6] text-[#8f8f86]">
                      {card.body}
                    </p>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
