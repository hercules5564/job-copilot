"use client";

import { useEffect, useState } from "react";
import { inboxApi, type InboxEmail } from "../../lib/api";
import { PageHeader, Card, Badge } from "../../components/ui";

const FILTERS = [
  { key: "", label: "All" },
  { key: "?classification=INTERVIEW_INVITATION", label: "Interviews" },
  { key: "?classification=RECRUITER_OUTREACH", label: "Recruiters" },
  { key: "?classification=ASSESSMENT", label: "Assessments" },
  { key: "?classification=REJECTION", label: "Rejections" },
  { key: "?classification=OFFER", label: "Offers" },
  { key: "?matchStatus=NEEDS_REVIEW", label: "Unmatched" },
];

export default function InboxPage() {
  const [emails, setEmails] = useState<InboxEmail[]>([]);
  const [filter, setFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    subject: string;
    fromEmail: string;
    receivedAt: string;
    classification: string;
    application?: { id: string; status: string; job?: { title: string; companyName: string } | null } | null;
    events: { id: string; newStatus: string; source: string; note?: string | null }[];
  } | null>(null);
  const [error, setError] = useState("");

  async function load(query: string) {
    try {
      const r = await inboxApi.list(query);
      setEmails(r.emails);
    } catch {
      setError("API unreachable. Start it with npm run dev:api.");
    }
  }

  useEffect(() => {
    void load(filter);
  }, [filter]);

  async function open(id: string) {
    setSelectedId(id);
    setDetail(null);
    try {
      const r = await inboxApi.get(id);
      setDetail({
        subject: r.email.subject,
        fromEmail: r.email.fromEmail,
        receivedAt: r.email.receivedAt,
        classification: r.email.classification,
        application: r.email.application ?? null,
        events: r.events,
      });
    } catch {
      setError("Could not load email.");
    }
  }

  return (
    <div>
      <PageHeader title="Inbox" sub="Application-related Gmail, classified and linked to your applications." />
      {error ? <Card className="mb-4"><p className="text-sm">{error}</p></Card> : null}
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.label}
            className={`rounded-lg border px-3 py-1 text-sm ${filter === f.key ? "bg-black text-white dark:bg-white dark:text-black" : ""}`}
            onClick={() => { setFilter(f.key); setSelectedId(null); setDetail(null); }}>
            {f.label}
          </button>
        ))}
      </div>
      <div className="grid gap-3">
        {emails.map((e) => (
          <Card key={e.id}>
            <button className="w-full text-left" onClick={() => open(e.id)}>
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">{e.subject || "(no subject)"}</div>
                <Badge>{e.classification.replace(/_/g, " ")}</Badge>
              </div>
              <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                {e.fromEmail} · {new Date(e.receivedAt).toLocaleString()}
              </p>
              <p className="mt-1 line-clamp-2 text-sm" style={{ color: "var(--muted)" }}>{e.snippet}</p>
              <p className="mt-1 text-sm">
                {e.applicationId ? `Linked application` : e.matchStatus === "NEEDS_REVIEW" ? "Needs review" : "Unmatched"}
              </p>
            </button>
            {selectedId === e.id && detail ? (
              <div className="mt-3 border-t pt-3 text-sm">
                <p><span className="font-medium">From:</span> {detail.fromEmail}</p>
                <p><span className="font-medium">Classification:</span> {detail.classification.replace(/_/g, " ")}</p>
                <p>
                  <span className="font-medium">Application:</span>{" "}
                  {detail.application ? `${detail.application.job?.title ?? ""} · ${detail.application.status}` : "none"}
                </p>
                {detail.events.length > 0 ? (
                  <>
                    <p className="mt-2 font-medium">Events created</p>
                    <ul className="mt-1">
                      {detail.events.map((ev) => (
                        <li key={ev.id}>• {ev.newStatus} ({ev.source}){ev.note ? ` — ${ev.note.slice(0, 160)}` : ""}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>
            ) : null}
          </Card>
        ))}
        {emails.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            No emails yet. Connect Gmail on the integrations page, then sync.
          </p>
        ) : null}
      </div>
    </div>
  );
}
