"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authApi, ApiError, notificationsApi, type AuthUser, type Notification } from "../lib/api";
import {
  clearSessionHint,
  currentAppPath,
  hadActiveSession,
  loginPath,
  markSessionActive,
} from "../lib/auth-redirect";
import {
  BellIcon,
  BillingIcon,
  BoltIcon,
  BriefcaseIcon,
  ChartIcon,
  CloseIcon,
  CompassIcon,
  DashboardIcon,
  FileIcon,
  FolderIcon,
  InboxIcon,
  LogoutIcon,
  MenuIcon,
  MoonIcon,
  PlugIcon,
  RadarIcon,
  SettingsIcon,
  SunIcon,
  TargetIcon,
  UserIcon,
} from "./icons";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/jobs", label: "Jobs" },
  { href: "/discovery", label: "Discovery" },
  { href: "/autopilot", label: "Autopilot" },
  { href: "/matches", label: "Matches" },
  { href: "/applications", label: "Applications" },
  { href: "/resume", label: "Resume" },
  { href: "/projects", label: "Projects" },
  { href: "/profile", label: "Profile" },
  { href: "/leads", label: "Leads" },
  { href: "/inbox", label: "Inbox" },
  { href: "/analytics", label: "Analytics" },
  { href: "/integrations", label: "Integrations" },
  { href: "/settings", label: "Settings" },
  { href: "/billing", label: "Billing" },
];

const ICONS: Record<string, (p: { width?: number; height?: number }) => JSX.Element> = {
  "/dashboard": DashboardIcon,
  "/jobs": BriefcaseIcon,
  "/discovery": CompassIcon,
  "/autopilot": BoltIcon,
  "/matches": TargetIcon,
  "/applications": FileIcon,
  "/resume": FileIcon,
  "/projects": FolderIcon,
  "/profile": UserIcon,
  "/leads": RadarIcon,
  "/inbox": InboxIcon,
  "/analytics": ChartIcon,
  "/integrations": PlugIcon,
  "/settings": SettingsIcon,
  "/billing": BillingIcon,
};

const NAV_GROUPS = [
  { label: "Workspace", items: NAV.slice(0, 6) },
  { label: "Career", items: NAV.slice(6, 9) },
  { label: "Signals", items: NAV.slice(9, 12) },
  { label: "System", items: NAV.slice(12) },
];

function AuthGate({ message }: { message?: string }) {
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-6"
      data-testid="auth-gate"
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="cf-wordmark-mark" aria-hidden="true" style={{ color: "var(--ink)" }}>
          <i /> <i /> <i /> <i /> <i /> <i /> <i /> <i /> <i />
        </span>
        <span className="cf-serif text-[24px] leading-none">JobPilot</span>
        <p className="app-loading m-0 text-[13px]">
          {message ?? "Checking your session…"}
        </p>
        {message ? (
          <Link href="/login" className="cf-btn cf-btn-light cf-btn-sm">
            Sign in
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const sync = () => setDark(document.documentElement.classList.contains("dark"));
    sync();
    window.addEventListener("jobpilot-theme-change", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("jobpilot-theme-change", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("jobpilot-theme", next ? "dark" : "light");
    } catch {
      // Storage can be unavailable in privacy modes; the DOM class still works.
    }
    window.dispatchEvent(new Event("jobpilot-theme-change"));
  }

  return (
    <button
      type="button"
      className={compact ? "cf-icon-btn" : "app-nav-link"}
      style={compact ? { width: 34, height: 34, borderColor: "var(--line)", background: "var(--surface-raised)", color: "var(--ink)" } : undefined}
      onClick={toggle}
      aria-label="Toggle theme"
    >
      {dark ? <SunIcon width={16} height={16} /> : <MoonIcon width={16} height={16} />}
      {compact ? null : <span>{dark ? "Light" : "Dark"}</span>}
    </button>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [unread, setUnread] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelItems, setPanelItems] = useState<Notification[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authError, setAuthError] = useState("");

  // Phase 9: automation fixtures stay public (Playwright targets + E2E).
  const isPublic =
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/demo-application" ||
    pathname === "/ats-demo" ||
    pathname.startsWith("/ats-demo/");

  useEffect(() => {
    if (isPublic) {
      setAuthChecked(true);
      return;
    }
    setAuthError("");
    authApi
      .me()
      .then((r) => {
        setUser(r.user);
        markSessionActive();
        setAuthChecked(true);
      })
      .catch((e) => {
        setUser(null);
        if (e instanceof ApiError && e.status === 401) {
          const next = currentAppPath();
          const expired = hadActiveSession();
          setAuthError("Please sign in to continue.");
          router.replace(loginPath({ next, expired }));
          setAuthChecked(true);
          return;
        }
        setAuthError("We couldn't verify your session. Please sign in again.");
        setAuthChecked(true);
      });
  }, [isPublic, router]);

  // Phase 11: unread badge. Refresh on auth + panel open + once a minute
  // while visible. No websockets; timer cleaned up on unmount/logout.
  useEffect(() => {
    if (isPublic || !user) return;
    let cancelled = false;
    async function refresh() {
      if (document.hidden) return;
      try {
        const r = await notificationsApi.unreadCount();
        if (!cancelled) setUnread(r.unread);
      } catch {
        // Badge stays stale rather than breaking navigation.
      }
    }
    void refresh();
    const timer = setInterval(refresh, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isPublic, user]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

  async function openPanel() {
    if (!panelOpen) {
      try {
        const r = await notificationsApi.list("?unreadOnly=true&limit=10");
        setPanelItems(r.notifications);
      } catch {
        setPanelItems([]);
      }
    }
    setPanelOpen((v) => !v);
  }

  async function openNotification(n: Notification) {
    try {
      await notificationsApi.markRead(n.id);
    } catch {
      // Navigation proceeds; the badge refreshes on its next poll.
    }
    setPanelOpen(false);
    setUnread((c) => Math.max(0, c - 1));
    router.push(n.applicationId ? `/applications/${n.applicationId}` : "/inbox");
  }

  if (pathname === "/") return <>{children}</>;

  if (pathname === "/login") {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-4 py-6">
        {children}
      </main>
    );
  }

  // Fail closed: protected pages never render until the session is confirmed.
  if (!isPublic && (!authChecked || !user)) {
    return <AuthGate message={authError || undefined} />;
  }

  async function logout() {
    try {
      await authApi.logout();
    } catch {
      // Cookie cleared server-side regardless; always leave.
    }
    clearSessionHint();
    setUser(null);
    setUnread(0);
    setPanelOpen(false);
    setPanelItems([]);
    setAuthError("");
    router.replace("/login");
  }

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <Link href="/dashboard" className="app-brand">
          <span className="cf-wordmark-mark" aria-hidden="true" style={{ color: "var(--ink)" }}>
            <i /> <i /> <i /> <i /> <i /> <i /> <i /> <i /> <i />
          </span>
          <span className="app-brand-text">
            <strong>JobPilot</strong>
            <span>Job-search OS</span>
          </span>
        </Link>

        <nav className="app-nav" aria-label="Primary">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="app-nav-group">{group.label}</div>
              {group.items.map((n) => {
                const Icon = ICONS[n.href] ?? DashboardIcon;
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    className={`app-nav-link ${isActive(n.href) ? "is-active" : ""}`}
                  >
                    <span className="app-nav-icon">
                      <Icon width={14} height={14} />
                    </span>
                    {n.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="app-sidebar-foot">
          {authChecked && user ? (
            <button
              type="button"
              onClick={openPanel}
              data-testid="notification-bell"
              aria-label="Notifications"
              className="relative flex w-full items-center gap-2 rounded-[7px] border border-transparent px-2 py-1.5 text-left text-[12px] text-[var(--ink-muted)] transition-colors hover:border-[var(--line)] hover:bg-[var(--surface-raised)] hover:text-[var(--ink)]"
            >
              <BellIcon width={15} height={15} />
              <span className="flex-1">Notifications</span>
              {unread > 0 ? (
                <span
                  data-testid="notification-badge"
                  className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--ink)] px-1 text-[10px] font-semibold text-[var(--bg)]"
                >
                  {unread > 99 ? "99+" : unread}
                </span>
              ) : null}
            </button>
          ) : null}
          {authChecked && user ? (
            <div className="app-user" data-testid="user-menu">
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatarUrl} alt="" className="app-avatar" referrerPolicy="no-referrer" />
              ) : (
                <span className="app-avatar">
                  {(user.name ?? user.email).slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-[11.5px]" title={user.email}>
                {user.name ?? user.email}
              </span>
              <button
                onClick={logout}
                data-testid="logout"
                aria-label="Logout"
                title="Logout"
                className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--ink-faint)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--ink)]"
              >
                <LogoutIcon width={14} height={14} />
                <span className="sr-only">Logout</span>
              </button>
            </div>
          ) : authChecked ? (
            <Link href="/login" data-testid="signin-link" className="cf-btn cf-btn-light cf-btn-sm w-full">
              Sign in
            </Link>
          ) : null}
          <ThemeToggle />
        </div>
      </aside>

      <div className="app-main">
        <div className="app-topbar">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="cf-icon-btn"
              aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((v) => !v)}
              style={{ width: 34, height: 34, borderColor: "var(--line)", background: "var(--surface-raised)", color: "var(--ink)" }}
            >
              {mobileOpen ? <CloseIcon width={17} height={17} /> : <MenuIcon width={17} height={17} />}
            </button>
            <Link href="/dashboard" className="flex items-center gap-2 no-underline" style={{ color: "var(--ink)" }}>
              <span className="cf-wordmark-mark" aria-hidden="true" style={{ width: 18, height: 18 }}>
                <i /> <i /> <i /> <i /> <i /> <i /> <i /> <i /> <i />
              </span>
              <span className="cf-serif text-[20px]">JobPilot</span>
            </Link>
          </div>
          <div className="flex items-center gap-1.5">
            {authChecked && user ? (
              <button
                type="button"
                onClick={openPanel}
                data-testid="notification-bell-mobile"
                aria-label="Notifications"
                className="relative flex h-8 w-8 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--surface-raised)] text-[var(--ink-soft)]"
              >
                <BellIcon width={15} height={15} />
                {unread > 0 ? (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--ink)] px-1 text-[9px] font-semibold text-[var(--bg)]">
                    {unread > 99 ? "99+" : unread}
                  </span>
                ) : null}
              </button>
            ) : null}
            <ThemeToggle compact />
          </div>
        </div>

        {mobileOpen ? (
          <div className="app-mobile-panel min-[880px]:hidden">
            <div className="mb-3 flex items-center justify-between px-1">
              <span className="cf-mono text-[9px] text-[var(--ink-faint)]">Navigate</span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--line)] text-[var(--ink-muted)]"
                aria-label="Close navigation"
              >
                <CloseIcon width={14} height={14} />
              </button>
            </div>
            {NAV_GROUPS.map((group) => (
              <div key={group.label}>
                <div className="app-nav-group">{group.label}</div>
                {group.items.map((n) => {
                  const Icon = ICONS[n.href] ?? DashboardIcon;
                  return (
                    <Link
                      key={n.href}
                      href={n.href}
                      onClick={() => setMobileOpen(false)}
                      className={`app-nav-link ${isActive(n.href) ? "is-active" : ""}`}
                    >
                      <span className="app-nav-icon">
                        <Icon width={14} height={14} />
                      </span>
                      {n.label}
                    </Link>
                  );
                })}
              </div>
            ))}
            <div className="mt-4 border-t border-[var(--line)] pt-3">
              {authChecked && user ? (
                <div className="flex items-center gap-2">
                  <span className="app-avatar">
                    {(user.name ?? user.email).slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12px]">{user.name ?? user.email}</span>
                  <button
                    onClick={logout}
                    className="cf-btn cf-btn-light cf-btn-sm"
                    aria-label="Log out"
                  >
                    Log out
                  </button>
                </div>
              ) : authChecked ? (
                <Link href="/login" data-testid="signin-link-mobile" className="cf-btn cf-btn-light cf-btn-sm w-full">
                  Sign in
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}

        <main className="app-content">{children}</main>
      </div>

      {panelOpen ? (
        <div
          data-testid="notification-panel"
          className="fixed right-3 top-[70px] z-[80] w-[min(340px,calc(100vw-24px))] rounded-[12px] border border-[var(--line)] bg-[var(--surface-raised)] p-2 shadow-[var(--shadow-pop)]"
        >
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="cf-mono text-[9px] text-[var(--ink-faint)]">Notifications</span>
            <button
              type="button"
              onClick={() => setPanelOpen(false)}
              className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--ink-muted)] hover:bg-[var(--surface-sunken)]"
              aria-label="Close notifications"
            >
              <CloseIcon width={13} height={13} />
            </button>
          </div>
          {panelItems.length === 0 ? (
            <p className="p-2 text-xs text-[var(--ink-muted)]">You are all caught up.</p>
          ) : (
            panelItems.map((n) => (
              <button
                key={n.id}
                onClick={() => openNotification(n)}
                className="block w-full rounded-lg px-2 py-2 text-left text-xs transition-colors hover:bg-[var(--surface-sunken)]"
              >
                <span className="block truncate font-medium text-[var(--ink)]">{n.title}</span>
                {n.body ? (
                  <span className="block truncate text-[var(--ink-muted)]">{n.body}</span>
                ) : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
