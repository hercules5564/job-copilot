"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronDown, CloseIcon, MenuIcon } from "../icons";

const PRODUCT = [
  { href: "/jobs", label: "Jobs", desc: "Every role in one clean queue" },
  { href: "/discovery", label: "Discovery", desc: "Agents that keep the pipeline full" },
  { href: "/matches", label: "Matches", desc: "Ranked against your real experience" },
  { href: "/applications", label: "Applications", desc: "One workspace per opportunity" },
];

const WORKFLOW = [
  { href: "/autopilot", label: "Autopilot", desc: "Fill applications with approval gates" },
  { href: "/resume", label: "Resume", desc: "Versioned, reusable career context" },
  { href: "/projects", label: "Projects", desc: "Proof of work that gets pulled in" },
  { href: "/profile", label: "Profile", desc: "The facts every agent works from" },
];

const INTELLIGENCE = [
  { href: "/leads", label: "Leads", desc: "Hiring signals before the job is posted" },
  { href: "/inbox", label: "Inbox", desc: "Recruiter email, classified" },
  { href: "/analytics", label: "Analytics", desc: "See what is actually converting" },
];

const SIMPLE = [
  { href: "/integrations", label: "Integrations" },
  { href: "#cta", label: "Pricing" },
];

type MenuKey = "product" | "workflow" | "intelligence" | null;

function Dropdown({
  label,
  open,
  onOpen,
  onClose,
  items,
  width,
}: {
  label: string;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  items: { href: string; label: string; desc: string }[];
  width?: string;
}) {
  return (
    <div
      className="relative"
      onMouseEnter={onOpen}
      onMouseLeave={onClose}
    >
      <button
        type="button"
        className="cf-nav-link"
        data-open={open ? "true" : "false"}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => (open ? onClose() : onOpen())}
      >
        {label}
        <ChevronDown
          width={13}
          height={13}
          style={{
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 160ms ease",
            opacity: 0.6,
          }}
        />
      </button>
      {open ? (
        <div className="cf-dropdown" style={width ? { width } : undefined} role="menu">
          {items.map((item) => (
            <Link key={item.href} href={item.href} onClick={onClose} role="menuitem">
              <strong>{item.label}</strong>
              <span>{item.desc}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menu, setMenu] = useState<MenuKey>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 24);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

  function openMenu(key: MenuKey) {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setMenu(key);
  }

  function scheduleClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setMenu(null), 120);
  }

  return (
    <>
      <header className={`cf-site-header ${scrolled || mobileOpen ? "is-solid" : ""}`}>
        <div className="cf-site-header-inner">
          <Link href="/" className="cf-wordmark" aria-label="JobPilot home">
            <span className="cf-wordmark-mark" aria-hidden="true">
              <i /> <i /> <i /> <i /> <i /> <i /> <i /> <i /> <i />
            </span>
            <span className="cf-wordmark-text">JobPilot</span>
          </Link>

          <div className="hidden items-center gap-3 min-[1000px]:flex">
            <nav className="cf-nav-pill" aria-label="Primary">
              <Dropdown
                label="Product"
                open={menu === "product"}
                onOpen={() => openMenu("product")}
                onClose={scheduleClose}
                items={PRODUCT}
              />
              <Dropdown
                label="Workflow"
                open={menu === "workflow"}
                onOpen={() => openMenu("workflow")}
                onClose={scheduleClose}
                items={WORKFLOW}
              />
              <Dropdown
                label="Intelligence"
                open={menu === "intelligence"}
                onOpen={() => openMenu("intelligence")}
                onClose={scheduleClose}
                items={INTELLIGENCE}
              />
              <span className="cf-nav-divider" aria-hidden="true" />
              {SIMPLE.map((item) => (
                <a key={item.label} href={item.href} className="cf-nav-link">
                  {item.label}
                </a>
              ))}
            </nav>
            <Link href="/login" className="cf-btn cf-btn-dark">
              Open JobPilot
            </Link>
          </div>

          <div className="flex items-center gap-2 min-[1000px]:hidden">
            <Link href="/login" className="cf-btn cf-btn-light cf-btn-sm">
              Open JobPilot
            </Link>
            <button
              type="button"
              className="cf-icon-btn cf-menu-toggle"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((v) => !v)}
            >
              {mobileOpen ? <CloseIcon /> : <MenuIcon />}
            </button>
          </div>
        </div>
      </header>

      {mobileOpen ? (
        <div className="cf-mobile-panel min-[1000px]:hidden">
          {[
            { label: "Product", items: PRODUCT },
            { label: "Workflow", items: WORKFLOW },
            { label: "Intelligence", items: INTELLIGENCE },
          ].map((group) => (
            <div key={group.label} className="mb-4">
              <div className="cf-mono mb-1 px-1 text-[9px] text-[var(--ink-faint)]">
                {group.label}
              </div>
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                >
                  <span>{item.label}</span>
                  <ArrowRight width={14} height={14} style={{ opacity: 0.4 }} />
                </Link>
              ))}
            </div>
          ))}
          <div className="mb-4">
            <div className="cf-mono mb-1 px-1 text-[9px] text-[var(--ink-faint)]">
              More
            </div>
            {SIMPLE.map((item) => (
              <a key={item.label} href={item.href} onClick={() => setMobileOpen(false)}>
                <span>{item.label}</span>
                <ArrowRight width={14} height={14} style={{ opacity: 0.4 }} />
              </a>
            ))}
          </div>
          <Link href="/login" className="cf-btn cf-btn-dark w-full" onClick={() => setMobileOpen(false)}>
            Open JobPilot
            <ArrowRight width={15} height={15} />
          </Link>
        </div>
      ) : null}
    </>
  );
}
