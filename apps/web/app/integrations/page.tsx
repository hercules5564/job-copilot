"use client";

import { useEffect, useState } from "react";
import { integrationsApi, type IntegrationInfo } from "../../lib/api";
import { PageHeader, Card, Badge } from "../../components/ui";

export default function IntegrationsPage() {
  const [gmail, setGmail] = useState<IntegrationInfo | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function load() {
    try {
      const r = await integrationsApi.gmail();
      setGmail(r.integration);
    } catch {
      setError("API unreachable. Start it with npm run dev:api.");
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("gmail");
    if (status === "connected") setNotice("Gmail connected successfully.");
    else if (status === "error") setError("Gmail authorization failed. Please try again.");
    void load();
  }, []);

  async function connect() {
    setError("");
    setBusy(true);
    try {
      const r = await integrationsApi.connectUrl();
      if (!r.configured || !r.url) {
        setError(r.message ?? "Gmail integration requires server configuration.");
        return;
      }
      window.location.href = r.url;
    } catch {
      setError("Could not start Gmail authorization.");
    } finally {
      setBusy(false);
    }
  }

  async function sync() {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const r = await integrationsApi.sync(25);
      const s = r.sync;
      setNotice(
        `Synced ${s.synced} messages · matched ${s.matched} · needs review ${s.needsReview} · events ${s.eventsCreated}` +
          (s.errors.length > 0 ? ` · ${s.errors[0]}` : ""),
      );
      await load();
    } catch {
      setError("Gmail sync failed. Reconnect if authorization expired.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const r = await integrationsApi.disconnect();
      setGmail(r.integration);
      setNotice("Gmail disconnected. Stored credentials were removed; previously synced emails are retained.");
    } catch {
      setError("Could not disconnect Gmail.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Integrations" sub="Connect Gmail to track applications automatically. Read-only; nothing is ever sent." />
      {error ? <Card className="mb-4"><p className="text-sm">{error}</p></Card> : null}
      {notice ? <Card className="mb-4"><p className="text-sm">{notice}</p></Card> : null}
      <Card>
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">Gmail</h2>
            <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
              {gmail?.connected
                ? `Connected as ${gmail.accountEmail ?? "unknown account"}`
                : "Not connected"}
              {gmail?.lastSyncedAt ? ` · Last synced ${new Date(gmail.lastSyncedAt).toLocaleString()}` : ""}
            </p>
            {gmail && !gmail.configured ? (
              <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                Gmail integration requires server configuration.
              </p>
            ) : null}
          </div>
          <Badge>{gmail?.connected ? "Connected" : "Not connected"}</Badge>
        </div>
        <div className="mt-3 flex gap-2">
          {!gmail?.connected ? (
            <button
              className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
              onClick={connect} disabled={busy}>
              Connect Gmail
            </button>
          ) : (
            <>
              <button
                className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
                onClick={sync} disabled={busy}>
                {busy ? "Syncing…" : "Sync now"}
              </button>
              <button className="rounded-lg border px-4 py-2 text-sm" onClick={disconnect} disabled={busy}>
                Disconnect
              </button>
            </>
          )}
        </div>
        <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>
          Gmail access is read-only with the minimum scope. Tokens stay on the server and are never shown here.
          Disconnecting removes stored credentials immediately.
        </p>
      </Card>
    </div>
  );
}
