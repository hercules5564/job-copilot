import { ButtonLink, Brand } from "./brand";
import {
  CalendarIcon,
  Check,
  GithubIcon,
  LinkedinIcon,
  XIcon,
  YoutubeIcon,
  ArrowUpRight,
} from "./icons";
import { Reveal } from "./reveal";

const COLUMNS: {
  title: string;
  links: { label: string; href: string; tag?: string }[];
}[] = [
  {
    title: "Product",
    links: [
      { label: "Job Discovery", href: "#world-model", tag: "New" },
      { label: "Smart Matching", href: "#router" },
      { label: "Personalization", href: "#review" },
      { label: "Autopilot", href: "#surfaces" },
      { label: "Application Tracker", href: "#search-behavior" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Job Search Report", href: "#articles", tag: "PDF" },
      { label: "Benchmark", href: "#articles" },
      { label: "Guides", href: "#articles" },
      { label: "Docs", href: "#world-model" },
      { label: "Blog", href: "#articles" },
      { label: "Case studies", href: "#stories" },
    ],
  },
  {
    title: "Compare",
    links: [
      { label: "vs. Easy Apply", href: "#stories" },
      { label: "vs. spreadsheets", href: "#stories" },
      { label: "vs. generic AI writers", href: "#review" },
      { label: "vs. job boards", href: "#world-model" },
      { label: "vs. manual tracking", href: "#search-behavior" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "#top" },
      { label: "Careers", href: "#top", tag: "Hiring" },
      { label: "Security", href: "#faq" },
      { label: "Privacy policy", href: "#faq" },
      { label: "Terms of service", href: "#faq" },
    ],
  },
];

function Tag({ children }: { children: string }) {
  const lime = children === "New" || children === "Hiring";
  return (
    <span
      className={`ml-1.5 inline-flex translate-y-[-1px] items-center rounded border px-1 py-[1px] text-[8px] font-semibold uppercase tracking-[0.06em] ${
        lime
          ? "border-[#4d6b24] bg-[#1b260d] text-[#b6e35a]"
          : "border-[#33332e] bg-[#1b1b18] text-[#8f8f88]"
      }`}
    >
      {children}
    </span>
  );
}

function RingBadge({ label }: { label: string }) {
  return (
    <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#3a3a34]">
      <span className="absolute inset-[3px] rounded-full border border-dashed border-[#3a3a34]" />
      <span className="text-[6px] font-semibold uppercase tracking-[0.08em] text-[#7f7f78]">
        {label}
      </span>
    </span>
  );
}

const COMPLIANCE = [
  {
    title: "Encrypted at rest",
    badge: "AES",
    body: "Tokens encrypted at rest. Sessions are server-side and revoke on sign-out.",
  },
  {
    title: "GDPR",
    badge: "GDPR",
    body: "Data handling aligned to EU data protection requirements.",
  },
  {
    title: "Self hosted & BYOK",
    badge: "BYOK",
    body: "Run JobPilot in your cloud with your own AI and email keys.",
  },
];

const GUARANTEES = [
  "No training on your data",
  "Secrets encrypted at rest",
  "Read-only Gmail sync",
  "You approve every application",
];

export function CtaSection() {
  return (
    <section id="cta" className="relative overflow-hidden bg-[#d2f273] py-24 md:py-32">
      <div className="pointer-events-none absolute inset-y-0 left-0 w-28 opacity-[0.13] ent-halftone sm:w-44" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-28 opacity-[0.13] ent-halftone sm:w-44" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 opacity-70 ent-halftone-fade" />

      <div className="ent-container relative">
        <Reveal className="text-center">
          <h2 className="ent-display mx-auto max-w-[820px] text-[clamp(40px,5vw,66px)] text-[#1b2010]">
            Your next role starts the
            <br />
            day you connect your profile.
          </h2>
          <p className="mx-auto mt-5 max-w-[520px] text-[15px] leading-7 text-[#3b422a]">
            From that day on, every job, match and follow-up lands in the same index.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <ButtonLink href="#top" variant="dark" size="lg" arrow>
              Start for free
            </ButtonLink>
            <ButtonLink href="#cta" variant="ghost" size="lg">
              Book a demo
              <CalendarIcon className="h-4 w-4 text-ent-muted" />
            </ButtonLink>
          </div>
          <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-[11.5px] text-[#3b422a]">
            {[
              "No credit card required",
              "Human-approved applications",
              "Your data stays yours",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 bg-[#26310f]" />
                {item}
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}

export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden bg-[#0a0a0a] text-[#8f8f88]">
      <div className="ent-container pt-16 md:pt-20">
        <div className="grid gap-10 border-b border-[#212120] pb-12 lg:grid-cols-[1.5fr_repeat(4,1fr)] lg:gap-8">
          <div className="max-w-[260px]">
            <Brand
              logoClassName="h-7 w-7"
              textClassName="text-[15px] text-white"
            />
            <p className="mt-5 text-[12px] leading-6 text-[#7f7f78]">
              Find better roles, apply with context, and keep every follow-up in one
              place.
            </p>
            <div className="mt-6 flex items-center gap-3">
              {[
                { label: "X", icon: <XIcon className="h-3.5 w-3.5" /> },
                { label: "GitHub", icon: <GithubIcon className="h-3.5 w-3.5" /> },
                { label: "LinkedIn", icon: <LinkedinIcon className="h-3.5 w-3.5" /> },
                { label: "YouTube", icon: <YoutubeIcon className="h-3.5 w-3.5" /> },
              ].map((social) => (
                <a
                  key={social.label}
                  href="#top"
                  aria-label={social.label}
                  className="text-[#6f6f68] transition-colors hover:text-white"
                >
                  {social.icon}
                </a>
              ))}
            </div>
            <p className="mt-6 text-[10.5px] text-[#5f5f58]">
              © 2026 JobPilot
            </p>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.title}>
              <p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#5f5f58]">
                {column.title}
              </p>
              <ul className="space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="inline-flex items-center text-[12px] text-[#8f8f88] transition-colors hover:text-white"
                    >
                      {link.label}
                      {link.tag ? <Tag>{link.tag}</Tag> : null}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-8 grid gap-3 md:grid-cols-3">
          {COMPLIANCE.map((item) => (
            <div
              key={item.title}
              className="flex items-start justify-between gap-4 rounded border border-[#242422] bg-[#101010] p-5"
            >
              <div>
                <p className="text-[13px] font-medium text-[#f0f0ea]">{item.title}</p>
                <p className="mt-3 max-w-[260px] text-[11px] leading-5 text-[#7f7f78]">
                  {item.body}
                </p>
              </div>
              <RingBadge label={item.badge} />
            </div>
          ))}
        </div>

        <div className="mt-3 grid gap-3 rounded border border-[#242422] bg-[#0d0d0d] px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
          {GUARANTEES.map((item) => (
            <div key={item} className="flex items-center gap-2 text-[10.5px] text-[#8f8f88]">
              <Check className="h-3 w-3 text-[#b6e35a]" />
              {item}
            </div>
          ))}
        </div>

        <div className="relative left-1/2 mt-14 w-screen -translate-x-1/2 overflow-hidden">
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/60 to-transparent" />
          <p
            aria-hidden="true"
            className="ent-wordmark translate-y-[12%] text-center text-[clamp(110px,23vw,440px)]"
          >
            jobpilot
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#212120] py-6 text-[10px] text-[#5f5f58]">
          <p>Built for people who want offers, not tabs.</p>
          <a href="#top" className="ent-link-arrow hover:text-white">
            Back to top
            <ArrowUpRight className="h-3 w-3" />
          </a>
        </div>
      </div>
    </footer>
  );
}
