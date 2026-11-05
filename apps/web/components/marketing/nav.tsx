"use client";

import { useEffect, useState } from "react";
import { Brand } from "./brand";
import {
  CalendarIcon,
  ChevronDown,
  CloseIcon,
  MenuIcon,
} from "./icons";

type MenuKey = "products" | "resources";

const MENUS: Record<
  MenuKey,
  { label: string; items: { label: string; href: string; tag?: string }[] }
> = {
  products: {
    label: "Products",
    items: [
      { label: "Job Discovery", href: "#world-model", tag: "New" },
      { label: "Smart Matching", href: "#router" },
      { label: "Personalization", href: "#review" },
      { label: "Autopilot", href: "#surfaces" },
      { label: "Application Tracker", href: "#search-behavior" },
    ],
  },
  resources: {
    label: "Resources",
    items: [
      { label: "Job Search Report", href: "#articles", tag: "PDF" },
      { label: "Benchmark", href: "#articles" },
      { label: "Guides", href: "#articles" },
      { label: "Docs", href: "#world-model" },
      { label: "Blog", href: "#articles" },
      { label: "Case studies", href: "#stories" },
    ],
  },
};

function AvatarStack() {
  const avatars = [
    "from-[#d8b08c] to-[#86552f]",
    "from-[#cfd6dd] to-[#5f6a75]",
    "from-[#e3c7ae] to-[#9a6a4a]",
  ];
  return (
    <span className="mr-0.5 flex -space-x-1.5" aria-hidden="true">
      {avatars.map((gradient, i) => (
        <span
          key={gradient}
          className={`relative inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-full border border-white bg-gradient-to-b ${gradient} ring-1 ring-black/10`}
          style={{ zIndex: 3 - i }}
        >
          <svg viewBox="0 0 24 24" className="mt-0.5 h-3.5 w-3.5 text-white/80" fill="currentColor">
            <circle cx="12" cy="8" r="3.4" />
            <path d="M4.8 21c.7-4 3.4-6.2 7.2-6.2s6.5 2.2 7.2 6.2" />
          </svg>
        </span>
      ))}
    </span>
  );
}

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [openMenu, setOpenMenu] = useState<MenuKey | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  return (
    <header
      className={`sticky top-0 z-50 border-b border-ent-line bg-white/92 backdrop-blur-md transition-shadow duration-300 ${
        scrolled ? "shadow-[0_8px_28px_rgba(0,0,0,0.06)]" : ""
      }`}
    >
      <div className="flex h-16 w-full items-center gap-4 px-4 md:px-6">
        <a href="#top" className="ent-focusable shrink-0 rounded-sm" aria-label="JobPilot home">
          <Brand />
        </a>

        <nav className="ml-2 hidden items-stretch self-stretch md:flex" aria-label="Main">
          {(Object.keys(MENUS) as MenuKey[]).length > 0 ? (
            <div className="flex items-stretch">
              <div
                className="relative flex items-stretch"
                onMouseEnter={() => setOpenMenu("products")}
                onMouseLeave={() => setOpenMenu(null)}
              >
                <button
                  type="button"
                  aria-expanded={openMenu === "products"}
                  onClick={() =>
                    setOpenMenu((v) => (v === "products" ? null : "products"))
                  }
                  className="flex items-center gap-1.5 px-4 text-[13.5px] text-ent-ink/85 transition-colors hover:text-ent-ink"
                >
                  Products
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform duration-200 ${
                      openMenu === "products" ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {openMenu === "products" ? (
                  <div className="absolute left-0 top-full z-50 w-64 overflow-hidden rounded-lg border border-ent-line bg-white p-1.5 shadow-[0_18px_50px_rgba(0,0,0,0.14)]">
                    {MENUS.products.items.map((item) => (
                      <a
                        key={item.label}
                        href={item.href}
                        onClick={() => setOpenMenu(null)}
                        className="flex items-center justify-between rounded-md px-3 py-2 text-[13px] text-ent-ink transition-colors hover:bg-[#f3f3ee]"
                      >
                        {item.label}
                        {item.tag ? (
                          <span className="rounded border border-ent-lime/40 bg-[#eef9d4] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#4d7c08]">
                            {item.tag}
                          </span>
                        ) : null}
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>

              <a
                href="#cta"
                className="flex items-center border-l border-ent-line/80 px-4 text-[13.5px] text-ent-ink/85 transition-colors hover:text-ent-ink"
              >
                Pricing
              </a>
              <a
                href="#stories"
                className="flex items-center border-l border-ent-line/80 px-4 text-[13.5px] text-ent-ink/85 transition-colors hover:text-ent-ink"
              >
                Case Studies
              </a>

              <div
                className="relative flex items-stretch border-l border-ent-line/80"
                onMouseEnter={() => setOpenMenu("resources")}
                onMouseLeave={() => setOpenMenu(null)}
              >
                <button
                  type="button"
                  aria-expanded={openMenu === "resources"}
                  onClick={() =>
                    setOpenMenu((v) => (v === "resources" ? null : "resources"))
                  }
                  className="flex items-center gap-1.5 px-4 text-[13.5px] text-ent-ink/85 transition-colors hover:text-ent-ink"
                >
                  Resources
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform duration-200 ${
                      openMenu === "resources" ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {openMenu === "resources" ? (
                  <div className="absolute left-0 top-full z-50 w-64 overflow-hidden rounded-lg border border-ent-line bg-white p-1.5 shadow-[0_18px_50px_rgba(0,0,0,0.14)]">
                    {MENUS.resources.items.map((item) => (
                      <a
                        key={item.label}
                        href={item.href}
                        onClick={() => setOpenMenu(null)}
                        className="flex items-center justify-between rounded-md px-3 py-2 text-[13px] text-ent-ink transition-colors hover:bg-[#f3f3ee]"
                      >
                        {item.label}
                        {item.tag ? (
                          <span className="rounded border border-ent-line bg-[#f3f3ee] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ent-muted">
                            {item.tag}
                          </span>
                        ) : null}
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </nav>

        <div className="ml-auto hidden items-center gap-2.5 md:flex">
          <a
            href="#cta"
            className="ent-btn ent-btn-ghost !py-2.5 !pl-2 !pr-3 text-[13px]"
          >
            <AvatarStack />
            Book a demo
            <CalendarIcon className="h-4 w-4 text-ent-muted" />
          </a>
          <a href="#cta" className="ent-btn ent-btn-primary !py-2.5 text-[13px]">
            Get started
          </a>
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          className="ml-auto rounded-md border border-ent-line p-2 text-ent-ink md:hidden"
        >
          {mobileOpen ? (
            <CloseIcon className="h-5 w-5" />
          ) : (
            <MenuIcon className="h-5 w-5" />
          )}
        </button>
      </div>

      {mobileOpen ? (
        <div className="border-t border-ent-line bg-white md:hidden">
          <div className="ent-container flex flex-col gap-1 py-4">
            {[
              ["Products", "#world-model"],
              ["Job Discovery", "#world-model"],
              ["Smart Matching", "#router"],
              ["Autopilot", "#surfaces"],
              ["Pricing", "#cta"],
              ["Case Studies", "#stories"],
              ["Resources", "#articles"],
            ].map(([label, href]) => (
              <a
                key={label}
                href={href}
                onClick={() => setMobileOpen(false)}
                className="rounded-md px-2 py-2.5 text-[15px] text-ent-ink transition-colors hover:bg-[#f3f3ee]"
              >
                {label}
              </a>
            ))}
            <div className="mt-3 flex flex-col gap-2 border-t border-ent-line pt-4">
              <a
                href="#cta"
                onClick={() => setMobileOpen(false)}
                className="ent-btn ent-btn-ghost w-full"
              >
                <AvatarStack />
                Book a demo
                <CalendarIcon className="h-4 w-4" />
              </a>
              <a
                href="#cta"
                onClick={() => setMobileOpen(false)}
                className="ent-btn ent-btn-primary w-full"
              >
                Get started
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
