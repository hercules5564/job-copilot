import { ButtonLink, SectionHeading } from "./brand";
import { ArrowUpRight, Play } from "./icons";
import { Reveal } from "./reveal";

function StatCard({
  label,
  value,
  quote,
  name,
  role,
  dark = false,
  delay = 0,
}: {
  label: string;
  value: string;
  quote: string;
  name: string;
  role: string;
  dark?: boolean;
  delay?: number;
}) {
  return (
    <Reveal delay={delay} className="h-full">
      <div
        className={`relative flex h-full flex-col overflow-hidden rounded-md border p-6 sm:p-7 ${
          dark
            ? "border-[#242420] bg-[#101010] text-[#f0f0ea]"
            : "border-ent-line bg-white text-ent-ink"
        }`}
      >
        {dark ? <div className="pointer-events-none absolute inset-0 ent-noise-dark opacity-40" /> : null}
        <div className="relative flex items-center justify-between gap-4">
          <span className={`text-[12px] ${dark ? "text-[#9f9f97]" : "text-ent-muted"}`}>
            {label}
          </span>
          <a
            href="#stories"
            className={`ent-link-arrow text-[11.5px] ${
              dark ? "text-[#b6c89a]" : "text-ent-muted"
            }`}
          >
            Case study
            <ArrowUpRight className="h-3 w-3" />
          </a>
        </div>
        <p
          className={`relative mt-2 text-[34px] font-medium leading-none tracking-[-0.03em] ${
            dark ? "text-white" : "text-ent-ink"
          }`}
        >
          {value}
        </p>
        <p
          className={`relative mt-5 text-[14.5px] leading-[1.75] ${
            dark ? "text-[#bdbdb5]" : "text-ent-ink/85"
          }`}
        >
          {quote}
        </p>
        <div className="relative mt-auto pt-6">
          <p className={`text-[12.5px] font-semibold ${dark ? "text-white" : "text-ent-ink"}`}>
            {name}
          </p>
          <p className={`mt-0.5 text-[11.5px] ${dark ? "text-[#8f8f88]" : "text-ent-muted"}`}>
            {role}
          </p>
        </div>
      </div>
    </Reveal>
  );
}

export function StoriesSection() {
  return (
    <section id="stories" className="border-t border-ent-line bg-white py-20 md:py-28">
      <div className="ent-container">
        <Reveal>
          <SectionHeading
            eyebrow="Job Seeker Stories"
            title={
              <>
                What changed when people
                <br />
                stopped applying blind.
              </>
            }
            description="Candidates who ran a measured search, on what changed after JobPilot started matching and tracking every application."
          />
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <ButtonLink href="#cta" variant="primary" arrow>
              Start free
            </ButtonLink>
            <ButtonLink href="#stories" variant="ghost" arrow>
              Read case studies
            </ButtonLink>
          </div>
        </Reveal>

        <div className="mt-9 grid gap-5 lg:grid-cols-12">
          <div className="flex flex-col gap-5 lg:col-span-7">
            <Reveal>
              <div className="group relative h-[300px] overflow-hidden rounded-md border border-ent-line bg-[#2a2118] sm:h-[360px] lg:h-[430px]">
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "radial-gradient(120% 90% at 20% 10%, #7a5c3e 0%, #423122 45%, #171310 100%)",
                  }}
                />
                <div className="pointer-events-none absolute inset-0 ent-noise-dark opacity-40" />
                <div className="absolute -left-12 top-16 h-56 w-56 rounded-full bg-[#c69a6a]/20 blur-3xl" />
                <div className="absolute right-10 top-24 h-48 w-48 rounded-full bg-[#d9b38c]/15 blur-3xl" />

                <div className="absolute left-5 top-5 rounded-full border border-white/15 bg-black/25 px-3 py-1 text-[9.5px] uppercase tracking-[0.18em] text-white/70">
                  Search sprint · 6 weeks
                </div>

                <div className="absolute inset-x-5 bottom-5 rounded-lg border border-white/10 bg-black/30 p-4 backdrop-blur-sm">
                  <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.16em] text-white/45">
                    <span>Pipeline</span>
                    <span>week 6</span>
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    {[
                      ["Discovered", "128"],
                      ["Matched", "18"],
                      ["Applied", "9"],
                      ["Interviews", "3"],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="rounded border border-white/10 bg-white/[0.04] px-2 py-2"
                      >
                        <p className="text-[9px] text-white/50">{label}</p>
                        <p className="text-[18px] leading-tight text-white/90">{value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 h-1 w-full rounded-full bg-white/10">
                    <div className="h-1 w-[62%] rounded-full bg-ent-lime" />
                  </div>
                </div>

                <a
                  href="#stories"
                  aria-label="Play Maya's search sprint story"
                  className="absolute inset-0 grid place-items-center pb-24"
                >
                  <span className="flex h-[76px] w-[76px] items-center justify-center rounded-full bg-white/95 text-[#171717] shadow-[0_10px_30px_rgba(0,0,0,0.3)] transition-transform duration-200 group-hover:scale-105">
                    <Play className="ml-0.5 h-6 w-6" />
                  </span>
                </a>
              </div>
            </Reveal>
            <StatCard
              label="More interviews"
              value="3.2x"
              quote="I was drowning in tabs and spreadsheets. JobPilot gave me one pipeline: the roles that fit, the applications I sent, and every follow-up in one place."
              name="Maya R."
              role="Senior Backend Engineer"
              delay={80}
            />
          </div>

          <div className="flex flex-col gap-5 lg:col-span-5">
            <StatCard
              label="Less time applying"
              value="68%"
              quote="I stopped rewriting the same cover letter for every role. JobPilot drafts from my real experience and asks me to approve the parts that matter. My search takes hours, not weekends."
              name="Daniel K."
              role="Product Designer, Northwind"
              delay={60}
            />
            <StatCard
              dark
              label="Reply rate"
              value="41%"
              quote="Generic AI tools wrote generic applications. JobPilot matched the role against what I had actually done, and the replies changed completely. Recruiters could tell the difference."
              name="Priya S."
              role="Data Scientist, Northstar"
              delay={120}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
