import { ButtonLink, LogoRow } from "./brand";
import { Play } from "./icons";
import { Reveal } from "./reveal";

function PlusCircle({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border border-ent-line bg-white/60 text-ent-muted ${className}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M12 5v14M5 12h14" />
      </svg>
    </span>
  );
}

function DotGrid({ className = "" }: { className?: string }) {
  return (
    <span className={`grid grid-cols-3 gap-[5px] ${className}`} aria-hidden="true">
      {Array.from({ length: 9 }).map((_, i) => (
        <span key={i} className="h-[7px] w-[7px] bg-[#d5d5cf]" />
      ))}
    </span>
  );
}

function HeroDecor() {
  return (
    <div className="pointer-events-none absolute inset-0 hidden lg:block" aria-hidden="true">
      <div className="absolute left-[1.5%] top-[19%] flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-ent-muted">
        <span className="text-ent-faint">[</span> Discovery{" "}
        <span className="text-ent-faint">]</span>
      </div>

      <div className="absolute right-[3.4%] top-[19.5%] w-[255px] text-right">
        <div className="flex items-center justify-end gap-2 text-[11px] uppercase tracking-[0.2em] text-ent-muted">
          <span className="text-ent-faint">[</span> Smart Matching{" "}
          <span className="text-ent-faint">]</span>
        </div>
        <p className="mt-2 text-[12px] leading-5 text-ent-muted">
          Explainable scoring against your
          <br />
          real experience and preferences.
        </p>
      </div>

      <div className="absolute left-[9.5%] top-[47%] flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-ent-muted">
        <span className="text-ent-faint">[</span> Application Tracker{" "}
        <span className="text-ent-faint">]</span>
      </div>
      <div className="absolute right-[7.4%] top-[47%] flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-ent-muted">
        <span className="text-ent-faint">[</span> Autopilot{" "}
        <span className="text-ent-faint">]</span>
      </div>

      <PlusCircle className="absolute left-[24%] top-[25%]" />
      <PlusCircle className="absolute right-[24.2%] top-[25%]" />

      <span className="absolute left-[33%] top-[14%] h-[10px] w-[10px] bg-[#c9c9c3]" />
      <span className="absolute left-[49.4%] top-[6.5%] h-[11px] w-[11px] bg-ent-lime" />
      <span className="absolute left-[23.3%] top-[35%] h-[10px] w-[10px] bg-[#cfcfc9]" />
      <span className="absolute right-[19.6%] top-[30%] h-[9px] w-[9px] bg-[#cfcfc9]" />
      <span className="absolute right-[14.1%] top-[47.5%] h-[9px] w-[9px] bg-[#c9c9c3]" />

      <DotGrid className="absolute left-[12.1%] top-[33%]" />
      <DotGrid className="absolute right-[20.9%] top-[13%]" />
      <span className="absolute bottom-[16%] left-[1.8%] h-[7px] w-[7px] bg-[#d8d8d2]" />
      <span className="absolute bottom-[12%] right-[2.2%] h-[7px] w-[7px] bg-[#d8d8d2]" />
    </div>
  );
}

function StatIcon({ kind }: { kind: 1 | 2 | 3 }) {
  if (kind === 1) {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5 text-ent-lime" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 20V9M10 20V5M16 20v-7M3 20h12" />
        <path d="m15 5 5-2M20 3v5" />
      </svg>
    );
  }
  if (kind === 2) {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5 text-ent-lime" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="6" cy="6" r="2" />
        <circle cx="18" cy="8" r="2" />
        <circle cx="9" cy="18" r="2" />
        <path d="m7.5 7.3 8.5.4M7.3 8 8.6 16M16.7 9.4 10.4 16.6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 text-ent-lime" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
      <path d="M8 5v4M14 10v4M10 15v4" />
    </svg>
  );
}

const STATS = [
  { icon: 1 as const, strong: "10k+", rest: "jobs scanned every day" },
  { icon: 2 as const, strong: "82%", rest: "match precision on your profile" },
  { icon: 3 as const, strong: "3.2x", rest: "more interviews in 90 days" },
];

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 ent-grid-bg" />
      <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-[147px] border-r border-ent-line/70 ent-hatch-side lg:block" />
      <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[147px] border-l border-ent-line/70 ent-hatch-side lg:block" />

      <HeroDecor />

      <div className="ent-container relative">
        <div className="pt-28 text-center md:pt-48 lg:pt-72">
          <Reveal className="flex justify-center">
            <a
              href="#articles"
              className="group inline-flex items-center gap-2 rounded-full border border-ent-line bg-white/85 p-1 pr-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] backdrop-blur transition-colors hover:border-ent-lime/60"
            >
              <span className="rounded-[3px] bg-ent-soft px-2 py-[3px] text-[10px] font-semibold uppercase tracking-[0.08em] text-[#20300a]">
                Report
              </span>
              <span className="text-[12.5px] text-ent-ink/80">
                The 2026 Job Search Report · 10,000 applications analyzed
              </span>
            </a>
          </Reveal>

          <Reveal delay={90}>
            <h1 className="ent-display mx-auto mt-7 max-w-[960px] text-[clamp(42px,4.9vw,68px)] text-ent-ink">
              The job search operating system
              <br className="hidden sm:block" /> for your next great role
            </h1>
          </Reveal>

          <Reveal delay={170}>
            <p className="mx-auto mt-7 max-w-[720px] text-[15.5px] leading-[1.75] text-ent-muted md:text-[16.5px]">
              Discover roles across the boards you already check, match them to your
              real experience, and prepare applications with human-approved context.
            </p>
          </Reveal>

          <Reveal delay={250} className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <ButtonLink href="#cta" variant="primary" size="lg" arrow>
              Get started
            </ButtonLink>
            <ButtonLink href="#world-model" variant="ghost" size="lg">
              See how it works
              <Play className="h-3.5 w-3.5 fill-current text-ent-muted" />
            </ButtonLink>
          </Reveal>
        </div>

        <Reveal delay={120} className="pt-24 md:pt-48 lg:pt-60">
          <p className="text-center text-[13px] text-ent-muted">
            Scans the job boards and tools you already use
          </p>
          <div className="mt-5">
            <LogoRow />
          </div>
        </Reveal>

        <Reveal delay={80}>
          <div className="grid grid-cols-1 divide-y divide-ent-line border-b border-ent-line md:grid-cols-3 md:divide-x md:divide-y-0">
            {STATS.map((stat) => (
              <div key={stat.strong} className="flex items-center gap-3 px-5 py-6 md:justify-center">
                <StatIcon kind={stat.icon} />
                <p className="text-[13px] text-ent-muted">
                  <span className="border-b border-dotted border-ent-ink/50 text-[14px] font-semibold text-ent-ink">
                    {stat.strong}
                  </span>{" "}
                  {stat.rest}
                </p>
              </div>
            ))}
          </div>
        </Reveal>
        <div className="h-20 md:h-32" />
      </div>
    </section>
  );
}
