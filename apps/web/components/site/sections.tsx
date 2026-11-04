import Link from "next/link";
import { ArrowRight } from "../icons";
import { FooterSky } from "./pixel";
import { Reveal } from "./reveal";

const SOURCES = ["LinkedIn", "Greenhouse", "Lever", "Ashby", "Workday", "Indeed"];

const FEATURES = [
  {
    title: "Agentic discovery",
    body: "JobPilot runs the searches, watches the boards, and keeps a ranked queue warm so you start with opportunities instead of tabs.",
  },
  {
    title: "Human in the loop",
    body: "Drafts, answers, and application runs pause for approval. Nothing leaves your account without you seeing exactly what will be sent.",
  },
  {
    title: "Fully connected",
    body: "Bring your resume, projects, profile, inbox, and preferred boards. Every agent works from the same source of truth.",
  },
];

export function LogoStrip() {
  return (
    <section className="cf-container">
      <Reveal className="cf-logo-strip">
        <p className="cf-mono m-0 text-[9.5px] text-[var(--ink-faint)]">
          Works with the boards and tools you already use
        </p>
        <div className="cf-logo-row">
          {SOURCES.map((name) => (
            <span key={name} className="cf-logo-word">
              {name}
            </span>
          ))}
        </div>
      </Reveal>
    </section>
  );
}

export function Intro() {
  return (
    <section id="world-model" className="cf-section cf-container">
      <Reveal>
        <h2 className="cf-intro-title">
          JobPilot is a job-search operating system designed to help you run the
          entire hunt.
        </h2>
      </Reveal>

      <div className="cf-orchestration">
        <div className="cf-graph" aria-hidden="true">
          <div className="cf-graph-ring" />
          <div className="cf-graph-center">JobPilot</div>

          <div className="cf-graph-node" style={{ left: "18%", top: "14%", ["--node" as string]: "#1a6fd1" }}>
            <i />
            Discover
          </div>
          <div className="cf-graph-node" style={{ right: "13%", top: "12%", ["--node" as string]: "#4c9f38" }}>
            <i />
            Match
          </div>
          <div className="cf-graph-node" style={{ left: "6%", top: "47%", ["--node" as string]: "#c8a91f" }}>
            <i />
            Personalize
          </div>
          <div className="cf-graph-node" style={{ right: "5%", top: "45%", ["--node" as string]: "#b4552f" }}>
            <i />
            Apply
          </div>
          <div className="cf-graph-node" style={{ left: "22%", bottom: "15%", ["--node" as string]: "#6b57c8" }}>
            <i />
            Track
          </div>
          <div className="cf-graph-node" style={{ right: "17%", bottom: "13%", ["--node" as string]: "#2f8a88" }}>
            <i />
            Inbox
          </div>

          <span className="cf-graph-satellite" style={{ left: "10%", top: "27%" }} />
          <span className="cf-graph-satellite" style={{ right: "6%", top: "27%" }} />
          <span className="cf-graph-satellite" style={{ left: "12%", bottom: "27%" }} />
          <span className="cf-graph-satellite" style={{ right: "9%", bottom: "28%" }} />
        </div>

        <div className="flex flex-col gap-2.5 p-4">
          <div className="flex items-center gap-2 pb-1">
            <span className="cf-mono text-[9px] text-[var(--ink-faint)]">Workspace</span>
            <span className="cf-chip cf-chip-dot">Live context</span>
          </div>
          <div className="cf-chat-bubble">
            You have 24 new roles from the boards you follow. I ranked them
            against your profile and flagged three that need a closer look.
          </div>
          <div className="cf-chat-bubble is-user">
            Show me the two strongest matches and what is missing.
          </div>
          <div className="cf-chat-bubble">
            Both are senior product roles. One is a strong skill match; the
            other needs a clearer story around analytics. I drafted the summary
            and left the application untouched for your review.
          </div>
          <div className="cf-chat-input">
            <span>Ask JobPilot to run a task...</span>
            <span className="cf-chat-send">↑</span>
          </div>
        </div>
      </div>

      <div className="cf-feature-row">
        {FEATURES.map((f, i) => (
          <Reveal key={f.title} delay={i * 90} className="cf-feature-item">
            <strong>{f.title}</strong> — {f.body}
          </Reveal>
        ))}
      </div>
    </section>
  );
}

export function CtaStrip() {
  return (
    <section id="router" className="cf-container">
      <Reveal className="cf-strip">
        <div>
          <h3>Put your job search to work.</h3>
          <p>Bring your real context and start with one concrete task.</p>
        </div>
        <Link href="/login" className="cf-btn cf-btn-dark">
          Start in JobPilot
          <ArrowRight width={15} height={15} />
        </Link>
      </Reveal>
    </section>
  );
}

export function BookSection() {
  const books = [
    {
      chapter: "Chapter I",
      num: "01",
      title: "How To Find",
      desc: "Build a discovery system that does not run dry.",
      accent: "#1a6fd1",
      panel: "#dbeafb",
    },
    {
      chapter: "Chapter II",
      num: "02",
      title: "How To Match",
      desc: "Turn your experience into a ranked shortlist.",
      accent: "#4c9f38",
      panel: "#e2f1d8",
    },
    {
      chapter: "Chapter III",
      num: "03",
      title: "How To Apply",
      desc: "Prepare tailored applications without inventing facts.",
      accent: "#b4552f",
      panel: "#f3e2d8",
    },
    {
      chapter: "Chapter IV",
      num: "04",
      title: "How To Track",
      desc: "Keep every reply, interview, and next step in view.",
      accent: "#6b57c8",
      panel: "#e7e1f7",
    },
  ];

  return (
    <section id="articles" className="cf-section cf-container">
      <Reveal className="mx-auto max-w-[680px] text-center">
        <span className="cf-eyebrow justify-center">The field guide</span>
        <h2 className="cf-section-title mt-3">Learn how to run a job search that compounds</h2>
        <p className="mx-auto mt-4 max-w-[540px] text-[14.5px] leading-relaxed text-[var(--ink-muted)]">
          Four short chapters, each mapped to a part of JobPilot. Read the
          playbook, then let the agents turn each step into a working queue.
        </p>
        <Link href="/login" className="cf-btn cf-btn-light mt-6">
          Put the guide to work
          <ArrowRight width={15} height={15} />
        </Link>
      </Reveal>

      <div className="cf-book-grid">
        {books.map((book, i) => (
          <Reveal key={book.num} delay={i * 70}>
            <a
              href="#surfaces"
              className="cf-book"
              style={{
                ["--book-accent" as string]: book.accent,
                ["--book-panel" as string]: book.panel,
              }}
            >
              <div className="cf-book-cover">
                <span className="cf-book-label">{book.chapter}</span>
                <span className="cf-book-numeral">{book.num}</span>
                <span className="cf-book-art" aria-hidden="true">
                  {Array.from({ length: 12 }).map((_, idx) => (
                    <i key={idx} />
                  ))}
                </span>
              </div>
              <div className="cf-book-meta">
                <span>By JobPilot</span>
                <span>2026</span>
              </div>
              <h3>{book.title}</h3>
              <p>{book.desc}</p>
              <span className="cf-link-arrow mt-3 inline-flex text-[12px] text-[var(--ink-muted)]">
                Read this chapter
                <ArrowRight width={13} height={13} />
              </span>
            </a>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

const WORD_ROWS = 9;
const WORD_COLS = 18;
const WORDS = [
  { word: "SOFTWARE", row: 0, col: 1, dir: "h" as const, tone: 0 },
  { word: "PRODUCT", row: 1, col: 4, dir: "v" as const, tone: 1 },
  { word: "DESIGN", row: 3, col: 6, dir: "h" as const, tone: 2 },
  { word: "DATA", row: 3, col: 2, dir: "v" as const, tone: 0 },
  { word: "SALES", row: 4, col: 13, dir: "h" as const, tone: 1 },
  { word: "MARKETING", row: 6, col: 2, dir: "h" as const, tone: 2 },
  { word: "FINANCE", row: 1, col: 0, dir: "v" as const, tone: 0 },
  { word: "SUPPORT", row: 7, col: 9, dir: "h" as const, tone: 1 },
  { word: "RESEARCH", row: 0, col: 12, dir: "v" as const, tone: 2 },
  { word: "ANALYTICS", row: 8, col: 6, dir: "h" as const, tone: 0 },
];

const CELL_TONES = [
  { bg: "var(--word-1-bg)", ink: "var(--word-1-ink)" },
  { bg: "var(--word-2-bg)", ink: "var(--word-2-ink)" },
  { bg: "var(--word-3-bg)", ink: "var(--word-3-ink)" },
];

function buildWordGrid() {
  const grid: string[][] = Array.from({ length: WORD_ROWS }, () =>
    Array.from({ length: WORD_COLS }, () => ""),
  );
  const tones: (number | null)[][] = Array.from({ length: WORD_ROWS }, () =>
    Array.from({ length: WORD_COLS }, () => null),
  );

  const sorted = [...WORDS].sort((a, b) => b.word.length - a.word.length);

  sorted.forEach((entry, index) => {
    const primary = entry.dir;
    const secondary = primary === "h" ? ("v" as const) : ("h" as const);
    let placed = false;
    const rowOrder = Array.from({ length: WORD_ROWS }, (_, k) => (k + index * 2) % WORD_ROWS);
    const colOrder = Array.from({ length: WORD_COLS }, (_, k) => (k + index * 3) % WORD_COLS);

    for (const dir of [primary, secondary]) {
      if (placed) break;
      for (const r of rowOrder) {
        if (placed) break;
        for (const c of colOrder) {
          if (placed) break;
          const cells: { r: number; c: number }[] = [];
          let fits = true;
          for (let i = 0; i < entry.word.length; i += 1) {
            const rr = dir === "v" ? r + i : r;
            const cc = dir === "h" ? c + i : c;
            if (rr < 0 || rr >= WORD_ROWS || cc < 0 || cc >= WORD_COLS) {
              fits = false;
              break;
            }
            cells.push({ r: rr, c: cc });
          }
          if (!fits) continue;
          if (!cells.every(({ r: rr, c: cc }) => grid[rr][cc] === "")) continue;
          cells.forEach(({ r: rr, c: cc }, i) => {
            grid[rr][cc] = entry.word[i];
            tones[rr][cc] = entry.tone;
          });
          placed = true;
        }
      }
    }
  });

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return grid.map((row, r) =>
    row.map((ch, c) => ({
      ch: ch || alphabet[(r * 31 + c * 17 + 5) % 26],
      tone: tones[r][c],
    })),
  );
}

export function WordSearchSection() {
  const grid = buildWordGrid();
  return (
    <section id="stories" className="cf-section cf-container">
      <Reveal className="mx-auto max-w-[660px] text-center">
        <span className="cf-eyebrow justify-center">Every kind of role</span>
        <h2 className="cf-section-title mt-3">Build a search that works across industries</h2>
        <p className="mx-auto mt-4 max-w-[540px] text-[14.5px] leading-relaxed text-[var(--ink-muted)]">
          Product, engineering, design, data, sales, marketing, finance,
          support, research, analytics. JobPilot adapts the same operating
          system to the work you actually do.
        </p>
      </Reveal>

      <div className="cf-wordsearch">
        <div className="cf-wordsearch-grid" aria-hidden="true">
          {grid.flatMap((row, r) =>
            row.map((cell, c) => (
              <span
                key={`${r}-${c}`}
                className={`cf-word-cell ${cell.tone !== null ? "is-found" : ""}`}
                style={
                  cell.tone !== null
                    ? {
                        ["--cell-bg" as string]: CELL_TONES[cell.tone].bg,
                        ["--cell-ink" as string]: CELL_TONES[cell.tone].ink,
                        animationDelay: `${(r + c) * 18}ms`,
                      }
                    : undefined
                }
              >
                {cell.ch}
              </span>
            )),
          )}
        </div>
      </div>
      <p className="cf-wordsearch-note">
        The point is not to search harder. It is to give every opportunity the
        same context, the same judgment, and the same follow-through.
      </p>
    </section>
  );
}

export function FooterCta() {
  return (
    <section id="cta" className="cf-footer-cta">
      <FooterSky className="cf-footer-sky" />
      <div className="cf-container">
        <Reveal className="cf-footer-inner">
          <div>
            <span className="cf-eyebrow">Start here</span>
            <h2 className="cf-footer-title mt-3">Run your entire job search with AI agents</h2>
            <p className="cf-footer-sub">
              JobPilot gives your agent the context, tools, and approval gates
              to keep the search moving without giving up control.
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              <Link href="/login" className="cf-btn cf-btn-dark">
                Open JobPilot
                <ArrowRight width={15} height={15} />
              </Link>
              <a href="#world-model" className="cf-btn cf-btn-light">
                See how it works
              </a>
            </div>
          </div>

          <div className="cf-footer-preview">
            <div className="cf-footer-preview-top">
              <span className="cf-mock-dot" />
              <span className="cf-mock-dot" />
              <span className="cf-mock-dot" />
              <span className="cf-mono ml-2 text-[8px] text-[var(--ink-faint)]">
                JobPilot / workspace
              </span>
            </div>
            <div className="cf-footer-preview-body">
              <div className="cf-footer-preview-row">
                <span>
                  <b>Senior Product Designer</b> · Northwind
                </span>
                <span>92 match</span>
              </div>
              <div className="cf-footer-preview-row">
                <span>
                  <b>Discovery run</b> · 31 new roles
                </span>
                <span>queued</span>
              </div>
              <div className="cf-footer-preview-row">
                <span>
                  <b>Application draft</b> · needs review
                </span>
                <span>review</span>
              </div>
              <div className="cf-footer-preview-input mt-3 flex items-center justify-between rounded-[7px] px-3 py-2 text-[10px] text-[var(--ink-faint)]">
                <span>Ask JobPilot to run a task...</span>
                <span className="cf-chat-send">↑</span>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function SiteFooter() {
  return (
    <footer className="cf-footer-main">
      <div className="cf-container">
        <div className="cf-footer-cols">
          <div className="cf-footer-brand">
            <Link href="#top" className="cf-wordmark" style={{ color: "var(--ink)" }}>
              <span className="cf-wordmark-mark" aria-hidden="true">
                <i /> <i /> <i /> <i /> <i /> <i /> <i /> <i /> <i />
              </span>
              <span className="cf-wordmark-text">JobPilot</span>
            </Link>
            <p>
              An AI job-search operating system. Discover, match, prepare, and
              track — with your context and your approval.
            </p>
          </div>

          <div className="cf-footer-col">
            <h4>How to</h4>
            <a href="#world-model">How to find</a>
            <a href="#articles">How to match</a>
            <a href="#surfaces">How to apply</a>
            <a href="#stories">How to track</a>
          </div>
          <div className="cf-footer-col">
            <h4>Product</h4>
            <Link href="/jobs">Jobs</Link>
            <Link href="/discovery">Discovery</Link>
            <Link href="/matches">Matches</Link>
            <Link href="/applications">Applications</Link>
          </div>
          <div className="cf-footer-col">
            <h4>Workspace</h4>
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/autopilot">Autopilot</Link>
            <Link href="/leads">Leads</Link>
            <Link href="/inbox">Inbox</Link>
          </div>
          <div className="cf-footer-col">
            <h4>Resources</h4>
            <a href="#faq">FAQ</a>
            <Link href="/login">Sign in</Link>
            <Link href="/integrations">Integrations</Link>
            <Link href="/settings">Settings</Link>
          </div>
        </div>

        <div className="cf-footer-bottom">
          <span>Copyright © 2026 JobPilot</span>
          <span className="flex items-center gap-4">
            <a href="#faq">Privacy</a>
            <a href="#faq">Terms</a>
            <span className="cf-social">
              <a href="#top" aria-label="X">
                X
              </a>
              <a href="#top" aria-label="LinkedIn">
                in
              </a>
            </span>
          </span>
        </div>
      </div>
    </footer>
  );
}
