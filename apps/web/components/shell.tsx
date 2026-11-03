"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authApi, ApiError, notificationsApi, type AuthUser, type Notification } from "../lib/api";

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
];

function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);
  return (
    <button
      className="rounded-lg border px-3 py-1.5 text-sm"
      style={{ borderColor: "var(--border)" }}
      onClick={() => {
        const next = !dark;
        setDark(next);
        document.documentElement.classList.toggle("dark", next);
      }}
      aria-label="Toggle theme"
    >
      {dark ? "Light" : "Dark"}
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

  // Phase 9: automation fixtures stay public (Playwright targets + E2E).
  const isPublic =
    pathname === "/login" ||
    pathname === "/demo-application" ||
    pathname === "/ats-demo" ||
    pathname.startsWith("/ats-demo/");

  useEffect(() => {
    if (isPublic) {
      setAuthChecked(true);
      return;
    }
    authApi
      .me()
      .then((r) => {
        setUser(r.user);
        setAuthChecked(true);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) router.push("/login?expired=1");
        else setAuthChecked(true);
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

  if (pathname === "/login") return <main className="mx-auto w-full max-w-6xl flex-1 p-6">{children}</main>;

  async function logout() {
    try {
      await authApi.logout();
    } catch {
      // Cookie cleared server-side regardless; always leave.
    }
    setUser(null);
    setUnread(0);
    setPanelOpen(false);
    setPanelItems([]);
    router.push("/login");
  }

  return (
    <div className="flex min-h-screen">
      <aside
        className="hidden w-60 shrink-0 flex-col border-r p-4 md:flex"
        style={{ borderColor: "var(--border)", background: "var(--card)" }}
      >
        <div className="mb-6 flex items-start justify-between px-2">
          <div>
            <div className="text-lg font-bold">Job Copilot</div>
            <div className="text-xs" style={{ color: "var(--muted)" }}>
              AI job-search OS
            </div>
          </div>
          {authChecked && user ? (
            <div className="relative">
              <button
                onClick={openPanel}
                data-testid="notification-bell"
                aria-label="Notifications"
                className="relative rounded-lg border px-2.5 py-1.5 text-sm"
                style={{ borderColor: "var(--border)" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </svg>
                {unread > 0 ? (
                  <span
                    data-testid="notification-badge"
                    className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold"
                    style={{ background: "var(--fg)", color: "var(--bg)" }}
                  >
                    {unread > 99 ? "99+" : unread}
                  </span>
                ) : null}
              </button>
              {panelOpen ? (
                <div
                  data-testid="notification-panel"
                  className="absolute right-0 z-10 mt-2 w-72 rounded-lg border p-2"
                  style={{ borderColor: "var(--border)", background: "var(--card)" }}
                >
                  {panelItems.length === 0 ? (
                    <p className="p-2 text-xs" style={{ color: "var(--muted)" }}>
                      You are all caught up.
                    </p>
                  ) : (
                    panelItems.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => openNotification(n)}
                        className="block w-full rounded-lg px-2 py-1.5 text-left text-xs hover:opacity-80"
                      >
                        <span className="block truncate font-medium">{n.title}</span>
                        {n.body ? (
                          <span className="block truncate" style={{ color: "var(--muted)" }}>
                            {n.body}
                          </span>
                        ) : null}
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`rounded-lg px-3 py-2 text-sm ${
                pathname === n.href || pathname.startsWith(n.href + "/")
                  ? "font-semibold"
                  : ""
              }`}
              style={
                pathname === n.href || pathname.startsWith(n.href + "/")
                  ? { background: "var(--bg)" }
                  : undefined
              }
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2 px-2 pt-4">
          {authChecked && user ? (
            <div className="flex items-center gap-2 rounded-lg border p-2" style={{ borderColor: "var(--border)" }} data-testid="user-menu">
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-full" referrerPolicy="no-referrer" />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold" style={{ borderColor: "var(--border)" }}>
                  {(user.name ?? user.email).slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-xs" title={user.email}>
                {user.name ?? user.email}
              </span>
              <button onClick={logout} data-testid="logout" className="rounded-lg border px-2 py-1 text-xs" style={{ borderColor: "var(--border)" }}>
                Logout
              </button>
            </div>
          ) : authChecked ? (
            <Link href="/login" data-testid="signin-link" className="rounded-lg border px-3 py-1.5 text-center text-sm" style={{ borderColor: "var(--border)" }}>
              Sign in
            </Link>
          ) : null}
          <ThemeToggle />
        </div>
      </aside>
      <main className="mx-auto w-full max-w-6xl flex-1 p-6">{children}</main>
    </div>
  );
}
