import { ArrowRight } from "./icons";
import { Reveal } from "./reveal";

function KeywordArt() {
  return (
    <div className="flex h-full flex-col rounded border border-[#3a2a24] bg-[#1b1410] p-3 text-[#e8ddd6]">
      <div className="flex items-center justify-between text-[6.5px] uppercase tracking-[0.16em] text-[#a88f80]">
        <span>JobPilot</span>
        <span>Benchmark · Realtime</span>
      </div>
      <p className="mt-1.5 text-[8.5px] leading-[1.4] text-[#cdb8aa]">
        Keyword-only search vs context-aware matching across 10,000 applications.
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="rounded border border-[#3d2d26] bg-[#241a15] p-1.5">
          <p className="text-[6px] uppercase tracking-wide text-[#a88f80]">
            Keyword only
          </p>
          <p className="mt-0.5 text-[20px] leading-none text-[#f2e8e1]">12%</p>
          <div className="mt-1 h-1 w-full rounded-full bg-[#4c332b]">
            <div className="h-1 w-[30%] rounded-full bg-[#d59a55]" />
          </div>
        </div>
        <div className="rounded border border-[#3d2d26] bg-[#241a15] p-1.5">
          <p className="text-[6px] uppercase tracking-wide text-[#a88f80]">
            JobPilot
          </p>
          <p className="mt-0.5 text-[20px] leading-none text-[#f2e8e1]">31%</p>
          <div className="mt-1 h-1 w-full rounded-full bg-[#4c332b]">
            <div className="h-1 w-[86%] rounded-full bg-[#8fbf5a]" />
          </div>
        </div>
      </div>
      <div className="mt-auto space-y-1 pt-2 text-[6.5px] text-[#b7a396]">
        <div className="flex justify-between border-t border-[#3a2a24] pt-1">
          <span>Applications per interview</span>
          <span className="text-[#e8ddd6]">14</span>
        </div>
        <div className="flex justify-between border-t border-[#3a2a24] pt-1">
          <span>Avg. time to shortlist</span>
          <span className="text-[#e8ddd6]">4 days</span>
        </div>
      </div>
    </div>
  );
}

function ReportArt() {
  return (
    <div className="flex h-full flex-col rounded border border-[#d8d5c5] bg-[#f5f2e4] p-3 text-[#2c2b22]">
      <div className="flex items-center justify-between text-[6.5px] uppercase tracking-[0.16em] text-[#8d8a75]">
        <span>JobPilot</span>
        <span>Research · 2026</span>
      </div>
      <p className="mt-1 text-[8.5px] font-medium leading-[1.4]">
        The 2026 job search report: 10,000 applications, 3 lessons
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="rounded border border-[#cdd9b6] bg-[#eef4df] p-1.5">
          <p className="text-[6px] uppercase tracking-wide text-[#6f7a5c]">
            Applications
          </p>
          <p className="mt-0.5 text-[9px] text-[#4b5540]">analyzed</p>
          <p className="text-[20px] leading-none text-[#2c3323]">10k</p>
          <p className="mt-1 text-[6px] text-[#6f7a5c]">8 sources</p>
        </div>
        <div className="rounded border border-[#d8d5c5] bg-[#faf8ef] p-1.5">
          <p className="text-[6px] uppercase tracking-wide text-[#8d8a75]">
            Reply rate
          </p>
          <p className="mt-0.5 text-[9px] text-[#4b5540]">JobPilot</p>
          <p className="text-[20px] leading-none text-[#2c332b]">31%</p>
          <p className="mt-1 text-[6px] text-[#8d8a75]">2.4x baseline</p>
        </div>
      </div>
      <div className="mt-auto grid grid-cols-3 gap-1 border-t border-[#d8d5c5] pt-1.5 text-[6px] text-[#8d8a75]">
        <span>Interviews 3.2x</span>
        <span>Time saved 6 hrs</span>
        <span>Human approved</span>
      </div>
    </div>
  );
}

function WeekArt() {
  const rows = [
    ["Mon", "Scan matches", "You", "15m"],
    ["Tue", "Tailor two apps", "You", "60m"],
    ["Thu", "Follow-ups", "You", "20m"],
    ["Fri", "Review pipeline", "You", "15m"],
  ];

  return (
    <div className="flex h-full flex-col rounded border border-[#d8d5c5] bg-[#f7f4e9] p-3 text-[#2c2b22]">
      <div className="flex items-center justify-between text-[6.5px] uppercase tracking-[0.16em] text-[#8d8a75]">
        <span>JobPilot</span>
        <span>Guides · Aug 25</span>
      </div>
      <p className="mt-1 text-[8.5px] font-medium leading-[1.4]">
        How to spend five hours a week on a search that works
      </p>
      <div className="mt-2 grid grid-cols-[auto_1fr_1fr_auto] overflow-hidden rounded border border-[#d8d5c5] text-[6px]">
        <div className="bg-[#ece8d8] px-1 py-1 text-[#8d8a75]" />
        <div className="bg-[#ece8d8] px-1 py-1 text-[#6f7a5c]">Focus</div>
        <div className="bg-[#ece8d8] px-1 py-1 text-[#6f7a5c]">Owner</div>
        <div className="bg-[#ece8d8] px-1 py-1 text-right text-[#8d8a75]">Time</div>
        {rows.map(([day, focus, owner, time], index) => (
          <div key={day} className="contents">
            <div
              className={`border-t border-[#d8d5c5] px-1 py-1.5 font-medium ${
                index % 2 === 0 ? "bg-[#eef3df]" : "bg-[#f3f6e8]"
              }`}
            >
              {day}
            </div>
            <div
              className={`border-t border-[#d8d5c5] px-1 py-1.5 ${
                index % 2 === 0 ? "bg-[#eef3df]" : "bg-[#f3f6e8]"
              }`}
            >
              {focus}
            </div>
            <div
              className={`border-t border-[#d8d5c5] px-1 py-1.5 ${
                index % 2 === 0 ? "bg-[#eef3df]" : "bg-[#f3f6e8]"
              }`}
            >
              {owner}
            </div>
            <div
              className={`border-t border-[#d8d5c5] px-1 py-1.5 text-right text-[#6f7a5c] ${
                index % 2 === 0 ? "bg-[#eef3df]" : "bg-[#f3f6e8]"
              }`}
            >
              {time}
            </div>
          </div>
        ))}
        <div className="border-t border-[#d8d5c5] bg-[#e8efe0] px-1 py-1.5 font-medium">
          Total
        </div>
        <div className="border-t border-[#d8d5c5] bg-[#e8efe0] px-1 py-1.5">
          A measured search
        </div>
        <div className="border-t border-[#d8d5c5] bg-[#e8efe0] px-1 py-1.5">You</div>
        <div className="border-t border-[#d8d5c5] bg-[#e8efe0] px-1 py-1.5 text-right text-[#6f7a5c]">
          5h
        </div>
      </div>
      <p className="mt-auto pt-1.5 text-[6px] text-[#8d8a75]">
        A search that compounds, not a weekend of tabs.
      </p>
    </div>
  );
}

const POSTS = [
  {
    category: "Matching",
    date: "Sep 22, 2026",
    title:
      "Why keyword matching misses great candidates (and what to do instead)",
    art: <KeywordArt />,
  },
  {
    category: "Research",
    date: "Sep 9, 2026",
    title: "The 2026 Job Search Report: 10,000 applications, 3 lessons",
    art: <ReportArt />,
  },
  {
    category: "Guides",
    date: "Aug 25, 2026",
    title: "How to spend five hours a week on a search that works",
    art: <WeekArt />,
  },
];

export function ArticlesSection() {
  return (
    <section id="articles" className="border-t border-ent-line bg-white py-20 md:py-28">
      <div className="ent-container">
        <Reveal>
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-[780px]">
              <span className="ent-eyebrow">From the Team</span>
              <h2 className="ent-display mt-5 text-[clamp(32px,3.5vw,46px)] text-ent-ink">
                New in the product. New in the research.
              </h2>
              <p className="mt-4 max-w-[620px] text-[15px] leading-7 text-ent-muted">
                Product launches, matching benchmarks, and what we&apos;re seeing
                across 10,000 applications.
              </p>
            </div>
            <a
              href="#articles"
              className="ent-link-arrow shrink-0 self-start text-[13px] text-ent-muted transition-colors hover:text-ent-ink lg:self-end"
            >
              All posts
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </Reveal>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {POSTS.map((post, index) => (
            <Reveal key={post.title} delay={index * 80}>
              <a
                href="#articles"
                className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-md border border-ent-line bg-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_40px_rgba(0,0,0,0.08)]"
              >
                <div className="h-[205px] overflow-hidden bg-[#f2f1eb] p-3">
                  <div className="h-full transition-transform duration-500 ease-out group-hover:scale-[1.015]">
                    {post.art}
                  </div>
                </div>
                <div className="flex flex-1 flex-col border-t border-ent-line p-5">
                  <div className="flex items-center justify-between gap-3 text-[11px] text-ent-muted">
                    <span>{post.category}</span>
                    <span className="shrink-0">{post.date}</span>
                  </div>
                  <h3 className="mt-2.5 text-[14.5px] font-medium leading-[1.55] text-ent-ink transition-colors group-hover:text-[#3d4a2a]">
                    {post.title}
                  </h3>
                </div>
              </a>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
