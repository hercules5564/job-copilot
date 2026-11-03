import { PageHeader, Card } from "../components/ui";

function Placeholder({ title, sub, body }: { title: string; sub: string; body: string }) {
  return (
    <div>
      <PageHeader title={title} sub={sub} />
      <Card>
        <p className="text-sm" style={{ color: "var(--muted)" }}>{body}</p>
      </Card>
    </div>
  );
}

export function ProfilePage() {
  return <Placeholder title="Profile" sub="Target roles, skills, salary, locations, work auth." body="Profile editor with Zod-validated preferences lands in Phase 2 (Prisma-backed)." />;
}
export function ResumePage() {
  return <Placeholder title="Resume" sub="Upload, parse, preview, version, activate." body="Resume upload + parsing (Candidate Profile Agent) lands in Phase 2/4." />;
}
export function ProjectsPage() {
  return <Placeholder title="Projects" sub="Project library for match recommendations." body="Project CRUD lands in Phase 2." />;
}
export function MatchesPage() {
  return <Placeholder title="Matches" sub="Hybrid matching: rules + embeddings + LLM." body="Matching engine lands in Phase 4. Scores are prioritization signals, not truth." />;
}
export function LeadsPage() {
  return <Placeholder title="Leads" sub="Hiring signals from permitted public sources." body="Hiring-signal discovery lands in Phase 9. No automated recruiter spam, ever." />;
}
export function InboxPage() {
  return <Placeholder title="Inbox" sub="Gmail recruiter/application email detection." body="Gmail integration lands in Phase 6. Read-only in MVP; no auto-send." />;
}
export function AnalyticsPage() {
  return <Placeholder title="Analytics" sub="Response rates, funnel, skills demand." body="Advanced analytics land in Phase 9. No causal claims without data." />;
}
export function IntegrationsPage() {
  return <Placeholder title="Integrations" sub="Google OAuth, Gmail, storage, LLM providers." body="OAuth connect buttons land in Phase 6. Tokens encrypted at rest." />;
}
export function SettingsPage() {
  return <Placeholder title="Settings" sub="Account, theme, notifications, data export." body="Settings land in Phase 2." />;
}
