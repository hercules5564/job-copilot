# JobPilot

AI Job Search Operating System

Monorepo: Next.js 14 frontend + Express API + Prisma/PostgreSQL + Redis/BullMQ worker.

## Current Status

Phase 12C validated: API suite **273/273 passed with DB** (265 Phase 1–11
+ 8 new analytics tests), typecheck/build/lint pass, `migrate status`
clean (9 migrations, none added), Chromium/E2E **11/11** on production
builds (login redirect, seeded metric render, empty state, isolation,
mobile 390px). Previous Phase 11 notes are kept below.

- `demo` adapter on `/demo-application`: create → inspect/map/propose →
  approve → verified fill → `{confirm:true}` → `SUBMITTED` → application
  `APPLIED`, all `BROWSER_*` audit milestones present, cross-user access
  404, re-submit blocked with exactly one submission event.
- `fixture-ats` adapter on `/ats-demo/apply`: full loop to `SUBMITTED`
  after human edits (experience band set to exact offered label `3-5
  years`; required certification checkbox checked). Without the edits the
  run correctly refuses to guess (`FORM_VALIDATION_ERROR` / ambiguous —
  never auto-retries).
- Login wall on `/ats-demo/login`: `BLOCKED` / `LOGIN_REQUIRED`, session
  `WAITING_FOR_LOGIN`; resume mints a fresh session (`retryCount: 1`).
- Session resume produces a fresh session; terminal sessions end `CLOSED`.
- `HEADLESS` default verified live; `HEADED` resolution verified
  (`BROWSER_HEADED=1` → `HEADED`, no display launch attempted in CI).
- `https://evil.example.com` target and unknown adapter `nope` rejected
  with 400. No `headless_shell`/Playwright-chrome zombies after the run.

Known live findings (safe behavior, no code changed for this report):

- Re-submitting an already-`SUBMITTED` run returns 422 (state guard fires
  before the duplicate check), not 409 `ALREADY_SUBMITTED`. The 409 path
  applies to runs still in `WAITING_FOR_SUBMISSION` with a prior recorded
  submission (covered by the automated suite). No double click occurs in
  either path (single submission event verified live).
- The `demo` adapter uses the in-memory provider unless
  `BROWSER_PROVIDER_DEMO=playwright` (local-verification escape hatch);
  without it, live navigation fails with `NAVIGATION_FAILED` by design.
- Without `DATABASE_URL`, `GET /api/application-runs/adapters` returns 503
  (`requireDb`) and one non-DB-gated Phase 8 test fails; with DB it passes.

## Current architecture

```text
DISCOVER → UNDERSTAND → MATCH → PRIORITIZE → PERSONALIZE → APPLY → TRACK → MONITOR → LEARN
```

```text
apps/web (Next.js 14, TS, Tailwind, App Router) ──REST──▶ apps/api (Express, Zod, thin controllers)
packages/shared (ApplicationStatus state machine, Zod schemas, match/source/browser/queue contracts)
packages/queues (BullMQ infra: registry, producers, DLQ, scheduler, error classification)
packages/db (Prisma: User/Profile/Resume/Project/Job/JobMatch/Application/ApplicationEvent/
  Integration/EmailMessage/BrowserSession/ApplicationRun/ApplicationAnswer/AuthAccount/AuthSession/...)
        │                              │
PostgreSQL 16 + pgvector image     Redis 7 (BullMQ queue state only)
(vectors not yet stored)                │
                                   apps/worker (no HTTP: 5 queues → existing services → PostgreSQL)
```

App-session auth is real (Phase 9): Google OIDC sign-in + server-side
sessions in HttpOnly cookies (`apps/api/src/auth/`, `AuthAccount` /
`AuthSession` tables). The old `x-dev-user-id` stub only works with explicit
`AUTH_DEV_BYPASS=true` outside production. Gmail OAuth tokens remain a
separate integration (encrypted at rest, see Phase 6).

## Current implemented phases

- Phase 1 — Foundation ✅
- Phase 2 — Database & CRUD ✅
- Phase 3 — Live Job Ingestion ✅
- Phase 4 — Deterministic Matching ✅
- Phase 5 — Semantic/Hybrid Matching ✅
- Phase 6 — Gmail & Application Tracking ✅
- Phase 7 — Browser Application Assistance ✅
- Phase 8 — Production Browser Hardening & Safe Recovery ✅
- Phase 9 — Real Authentication & Account Security ✅
- Phase 10A — Background Workers + BullMQ Infrastructure ✅
- Phase 10B — Automated Discovery + Hiring Signals ✅
- Phase 11 — Track & Monitor (notifications + match visibility) ✅
- Phase 12C — Analytics / Monitor views (descriptive, no predictions) ✅
- Phase 13 — C3 Leads / Hiring Signal Inbox ✅
- Phase 14 — C5 Second-Wave Job Sources (Lever + Ashby, public board APIs) ✅
- Phase 15 — AI Application Personalization Foundation (review-gated drafts) ✅
- Phase 16 — Personalization Validation + Application Workflow Integration ✅
- Phase 17 — Production Infrastructure, Full E2E Validation & Deployment Readiness ✅
- Phase 16 — Personalization Validation + Application Workflow Integration ✅
- Phase 20 — Autopilot (prepare + fill) & broader public job sources ✅
- Phase 21 — Email + password authentication ✅

## IMPLEMENTED

Verified in code/tests (not just file existence):

- Arbeitnow live job ingestion (`apps/api/src/sources/adapters/arbeitnow.ts`):
  public keyless JSON API, single bounded request per run, 10s timeout, no
  pagination crawling. Phase 20 adds `remoteok` (keyless), `adzuna` and
  `jooble` (free API keys; report `available: false` when unconfigured), all
  with the same single-bounded-request pattern. Plus `demo` mock source.
  Closed source registry — `getSource("linkedin")` throws.
- Discovery planning searches by target role and preferred skill (deduped,
  max 2 queries per run) so fetching follows both signals.
- Autopilot (`apps/api/src/services/autopilot.ts`,
  `POST /api/autopilot/run`): selects matches at/above the configured score
  with no existing application, creates the application (mode `APPROVAL`),
  starts a browser run, auto-approves deterministic answers, fills the form,
  and stops at `WAITING_FOR_SUBMISSION`. It never submits; the human still
  confirms. LinkedIn/X/Twitter targets are skipped, file uploads stay
  manual, and the per-run cap is 10. A `/autopilot` page exposes settings
  (enabled, min score, max per run, resume) and results.
- Deterministic matching (`services/job-matcher.ts`, `match-components.ts`):
  explainable skill/role/experience/education/project/location/salary/type/
  work-auth scoring with reasons, missing requirements, risk flags.
- Semantic/hybrid matching (`services/semantic-matcher.ts`,
  `services/embeddings.ts`): `MATCH_PROVIDER=deterministic|semantic|hybrid`
  (default `deterministic`). `EMBEDDING_PROVIDER=local` (offline token-hash,
  default) or `openai` (OpenAI-compatible embeddings via `AI_API_KEY` +
  `AI_EMBEDDING_BASE_URL`). Hybrid weights via
  `HYBRID_DETERMINISTIC_WEIGHT` / `HYBRID_SEMANTIC_WEIGHT`. Failures fall
  back to deterministic with `matchMode: "deterministic_fallback"`. Vectors
  cached in memory only, never stored/returned.
- Gmail read-only integration (`apps/api/src/integrations/gmail/`):
  OAuth (`gmail.readonly` + `openid email`), AES-256-GCM tokens
  (`INTEGRATION_ENCRYPTION_KEY`), bounded sync (default 25, cap 100),
  deterministic classification, strong-evidence-only application linkage,
  `ApplicationEvent(source: "GMAIL")` via state machine, notifications,
  idempotent re-sync, disconnect revokes (best effort) + deletes tokens.
  No sending, no attachments (body capped at 4000 chars).
- Application tracking: full `Application` CRUD + state-machine-guarded
  status transitions + `ApplicationEvent` timeline + dashboard stats.
- Browser application assistance (`apps/api/src/browser/`):
  create → start (open/inspect/map/propose) → review → approve → fill
  (verified) → `WAITING_FOR_SUBMISSION` → `{confirm: true}` → verified
  submit. Deterministic field mapping + deterministic answers only (no LLM;
  `answers.ts` notes a future `LLMAnswerProvider` interface).
- Controlled ATS/demo fixtures: `/demo-application` (tricky fields fixture)
  and `/ats-demo/apply|login|captcha` (production-style ATS contract
  fixture). These are the only submittable targets.
- Playwright/Chromium (`browser/providers/playwright-browser.ts` — the only
  file importing `playwright-core`): one isolated `BrowserContext` per
  session, 30s nav / 10s action timeouts, max 3 pages per context,
  redirect-escape detection, block-signal reporting (never bypassed).
- Human-approved filling/submission: `APPROVED`/`EDITED` answers only fill;
  `UNKNOWN` fills only when user-supplied (`EDITED`); file inputs stay
  manual; `POST /:id/submit` requires Zod `{confirm: true}` plus a 14-point
  `verifySubmissionSafety` check (`run-service.ts`).
- Manual-login continuation (code + demo-provider tests): login wall →
  `BLOCKED`/`LOGIN_REQUIRED`, session `WAITING_FOR_LOGIN`, user signs in
  (headed window when `BROWSER_HEADED=1`), then `POST /:id/resume`
  re-inspects on a fresh session. Live headed E2E not run in this
  validation (no DB/display).
- Safe recovery (code + demo-provider tests): `resume` safe statuses only
  with checkpoint restore (`review`/`approved`/`filled`), `recover` terminal
  runs into linked runs with approved answers carried over, max 3
  retries (`RESOURCE_LIMIT`), `SUBMITTED` never replayed, ambiguous runs
  blocked until resolved.
- Session expiration: 30-min absolute + 10-min idle, enforced lazily on
  access; expired handles closed, never resurrected.
- Origin restrictions: adapter allowlists + `net-guard.ts`
  (`http(s)` only, origin must match, private-IP literals blocked except
  loopback, redirect escapes blocked). Verified at provider and submit time.
- Sensitive-field protection: `field-mapper.ts` quarantine
  (`password` type + password/OTP/SSN/payment patterns →
  `UNSUPPORTED_SENSITIVE_FIELD`), never stored as fillable, approve rejects,
  fill refuses, submit guards. Covered by unit tests.
- Application run history: `GET /api/applications/:id/runs`, `GET
  /api/application-runs/:id`, `GET /:id/status`, audit milestones as
  same-status `BROWSER` events (`SESSION_STARTED`, `FORM_INSPECTED`,
  `ANSWERS_GENERATED`, `REVIEW_APPROVED`, `WAITING_FOR_SUBMISSION`,
  submission evidence, resume/recover markers).
- User ownership isolation: every run/session/answer query scoped by
  `userId`; cross-user access returns 404; `P2003` mapped to 404.
- Safe error responses: typed `HttpError`s, 500s return generic message +
  `requestId`, no cookies/tokens/passwords/stack traces in responses or logs.
- Real application authentication (Phase 9, `apps/api/src/auth/`):
  Google OIDC sign-in (`GET /api/auth/google` → `GET
  /api/auth/google/callback`), signed state + PKCE (S256, stateless),
  provider-validated identity via userinfo (verified email required),
  safe account linking (`AuthAccount`: existing link → link by verified
  email → create), fresh server-side sessions per login (fixation-safe).
- Server sessions (`AuthSession`): 32-byte random tokens (base64url),
  SHA-256 hash stored (raw never persisted/logged/returned except in
  `Set-Cookie`), 30-day absolute expiry with lazy revocation, revocation on
  logout, throttled `lastSeenAt`. Cookie `jobpilot_session`: HttpOnly,
  `Path=/`, `SameSite=Lax`, `Secure` in production, 30-day Max-Age. No
  token in localStorage/URLs/JS state.
- Auth endpoints: `GET /api/auth/me` (safe fields only), idempotent `POST
  /api/auth/logout` (revoke + clear, always 200). Unauthenticated → uniform
  401 (no existence oracle). `/api/auth` volume-limited (in-process
  120/min/IP; per-process — sticky sessions or external limiter for
  multi-instance).
- CSRF: `SameSite=Lax` + enforced Origin/Referer allowlist on unsafe methods
  (403 on mismatch; absent headers = non-browser client, allowed). OAuth
  callback relies on signed state/PKCE, not cookies.
- Frontend auth: `/login` (Continue with Google, loading/error/expired
  states), shell user menu (avatar/name/email + Logout), unauthenticated
  app pages redirect to `/login?expired=1`; fixtures (`/demo-application`,
  `/ats-demo/*`) stay public. Web fetch uses `credentials: "include"`.
  Security headers in `next.config.mjs` (nosniff, referrer-policy,
  `X-Frame-Options: DENY`, minimal permissions-policy; no CSP by design).
- Background workers (Phase 10A, `packages/queues/` + `apps/worker/`):
  six closed queues (`job-ingestion`, `job-matching`, `gmail-sync`,
  `notifications`, `analytics`, `job-discovery`) with one job type each; processors reuse
  existing services (no duplicated business logic); deterministic job ids
  (`q.<queue>.<user>.<key>`) for queue-level dedup plus service-level
  idempotency (upserts, dedup fingerprints, identical-notification guard);
  attempts=3 with 1s/5s/25s custom backoff; permanent errors
  (`UnrecoverableError`, 4xx, bad payloads, unknown sources, missing users,
  disconnected integrations — never CAPTCHA/login/access-denied) skip
  retries; exhausted failures recorded sanitized to the `dead-letter` queue
  (metadata only); waiting jobs cancellable (active never preempted);
  per-queue concurrency (Gmail conservative at 1); user-ownership
  re-checked in every processor (foreign → 404-safe permanent failure);
  repeatable-job infrastructure with no schedules enabled by default;
  SIGINT/SIGTERM graceful shutdown (bounded, then close workers/Redis/Prisma).
- Async API modes (backwards compatible, default sync): `POST
  /api/jobs/ingest`, `POST /api/matches/run`, `POST
  /api/integrations/gmail/sync` accept `{async: true}` → `202 {queued,
  jobId, queue}`. Queue ops: `GET /api/queues/health` (auth, counts only),
  `GET /api/queues/status/:jobId` (owner only), `POST /api/queues/cancel`,
  `GET /api/queues/dlq` (owner-scoped), `POST /api/queues/dlq/retry`.
- Automated discovery (Phase 10B, `apps/api/src/services/job-discovery.ts`
  + `job-discovery` queue): user-scoped `DiscoveryConfig` (explicit config
  wins, Profile fills blanks; all fields bounded), planned bounded searches
  (≤3 sources/run, ≤8 searches/run, per-search budget from `maxJobsPerRun`,
  250ms politeness gaps), permitted sources only — Arbeitnow (public board
  API), Greenhouse (public board API per board token, verified live against
  two boards; 1 list + ≤limit detail fetches, HTML stripped to text),
  `lever` (public Postings API per board token, verified live; single
  list request, `descriptionPlain` preferred), `ashby` (public Job Board
  API per board slug, verified live; single list request, unlisted
  postings skipped), demo mock; unknown sources/bad boards fail
  permanently without retries.
- Cross-source dedup unchanged (source+externalId → canonical URL
  (utm/fragment-stripped) → fingerprint); repeats update safe fields only
  (description/URL/postedAt), never user fields; reruns insert nothing new.
- Discovery follow-ups: changed jobs enqueue `job-matching` (run-unique
  key; existing matcher/modes/fallback untouched) and mint `JOB_POSTING`
  hiring signals (deduped per user+source+type+key, evidence ≤500 chars,
  confidence heuristic, company linked via exact normalized-name match
  only — `Acme Inc.`/`Acme, Inc.` merge, `ABC Technologies`/`ABC
  Consulting` never do). Other signal types are validated but not produced.
- Discovery APIs (all authed): `GET`/`PUT /api/discovery/config` (save
  syncs the per-user schedule), `POST /api/discovery/run` (always 202),
  `GET /api/discovery/status` (last run + recent jobs), `GET
  /api/signals[?type&company]` + `GET /api/signals/:id` (owner-scoped,
  foreign → 404). Minimal `/discovery` page (config form, run, status,
  signals). Source payloads/descriptions treated as inert data (prompt
  injection stays stored text, never instructions).
- AI personalization drafts (Phase 15, `services/personalization*.ts` +
  `services/generation.ts` + `PersonalizationDraft` table + application
  detail section): deterministic candidate context (Profile/Resume/Projects,
  stored JobMatch reused, all bounded) → vendor-neutral provider
  (`AI_GENERATION_PROVIDER=off|openai|test`, OpenAI-compatible chat with
  `json_object`, timeout/max-token caps) → Zod + provenance validation
  (unknown fact/project citations rejected, never persisted) → persisted
  `REVIEW_REQUIRED` draft with fact-inventory snapshot → explicit
  approve/reject/edit (approval flips status only; never submits, automates,
  or contacts anyone). Unconfigured servers return a clear 409/`{configured:
  false}`; the test provider is offline, deterministic, and refused in
  production. Job text travels as labeled untrusted data.
- Personalization integration (Phase 16, additive only): same-status `AI`
  `ApplicationEvent` audit trail (`PERSONALIZATION_GENERATED/REGENERATED/
  EDITED/APPROVED/REJECTED`, metadata-only notes), `GET
  /api/applications/:id/personalization/approved` (latest `APPROVED` draft
  or null — review-required content never served), deterministic
  unverified-numeric flagging (numbers absent from inventory → warnings,
  stays `REVIEW_REQUIRED`), `approved-personalization` answer source for
  the browser assistant (approved cover letter + selected projects only;
  deleted selections fall back deterministically; still `PROPOSED` +
  human approve/fill), and an "Approved Application Content" section on
  the application page. No schema change; one provider call per
  generation; 20-draft cap retained.
- Descriptive analytics (Phase 12C, `services/analytics.ts` + `GET
  /api/analytics` + `/analytics` page): owner-scoped PostgreSQL aggregates
  (counts/groupBy/avg) over applications, events (unique-app funnel),
  matches (decisions/modes/average), jobs by source, 7/30-day activity,
  and discovery config status. Rates use unique applications over total
  applications. Zero-data returns zeros (no NaN); CSS bars + text values,
  empty state, no predictions anywhere.

## NOT YET IMPLEMENTED

- Broad internet-wide job crawling (Arbeitnow + Greenhouse + Lever + Ashby
  + RemoteOK + Adzuna + Jooble + demo mock only).
- LinkedIn/X/Indeed scraping behind restrictions (unknown-adapter/source
  rejected, tested, documented unsupported; browser `generic` adapter also
  blocks LinkedIn/X automation).
- Mass auto-apply / automatic submission (autopilot fills forms only; the
  submit call still requires human confirmation).
- CAPTCHA bypass (detection stops the run; `CAPTCHA_DETECTED`).
- Anti-bot bypass (no stealth plugins, no fingerprint spoofing, no proxies).
- Credential automation/storage (never captured, never persisted; login is
  manual-only in the user's own headed window).
- Unrestricted third-party website automation (closed adapter registry +
  origin allowlists; `generic` overrides limited to local demo targets).
- Automatic recruiter spam (no sender exists; `/leads` is an information inbox only).
- Automatic final submission without human confirmation (requires
  `WAITING_FOR_SUBMISSION` + `{confirm: true}` + 14-point check).
- Fully autonomous answer generation (factual fields stay deterministic via
  `DeterministicAnswerProvider`; AI drafts are review-gated and only approved
  cover letters/projects may overlay proposals).
- Billing/subscriptions (zero code matches for stripe/billing/subscription).
- MFA, enterprise SSO (email/password + Google OIDC only).
- Non-posting hiring-signal types (validated enum; only `JOB_POSTING` is produced).
- Recruiter messaging/outreach of any kind (no sender exists).
- Automatic application submission or recruiter messaging.
- Analytics product/learning system (only descriptive counts; no predictions,
  no models, no recommendations).
- Managed-hosting automation (deployment is Docker Compose + explicit migrate step; see Production deployment).
- Advanced analytics beyond descriptive counts, leads discovery, settings
  pages (still placeholders in `apps/web/app/_placeholders.tsx`).

## Prerequisites

- Node ≥ 20, npm, Docker Desktop (for Postgres + Redis).

## Setup

Environment (see `.env.example` — copy, never commit secrets):

```powershell
# 1. Install
npm install

# 2. Env
Copy-Item .env.example .env
Copy-Item apps\web\.env.example apps\web\.env.local
```

Key variables (actual, from `.env.example`):

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql://jobcopilot:jobcopilot@localhost:5433/jobcopilot?schema=public` | required for all DB routes |
| `REDIS_URL` | `redis://localhost:6379` | BullMQ queue state (never credentials); API 503s queue ops when unreachable |
| `WORKER_ENABLED` | `true` | `false` exits the worker immediately (disabled) |
| `WORKER_SHUTDOWN_TIMEOUT_MS` | `30000` | bounded graceful shutdown (5s–120s) |
| `QUEUE_*_CONCURRENCY` | 2/2/1/2/2/2 (ingestion/matching/gmail/notifications/analytics/discovery) | validated 1–10; Gmail stays 1 |
| `QUEUE_SCHEDULE_ANALYTICS` | `false` | all repeatable schedules opt-in only |
| `API_PORT` / `WEB_PORT` | `4000` / `3000` | |
| `FRONTEND_URL` / `API_BASE_URL` / `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:3000` / `http://localhost:4000` | CORS + fixture origin allowlist |
| `SESSION_SECRET` / `AUTH_SESSION_SECRET` | — (min 32 chars) | HMAC for OAuth state (`AUTH_*` preferred, falls back to `SESSION_*`); auth 503s when missing |
| `AUTH_DEV_BYPASS` | `false` | dev/test header bypass ONLY; ignored in production (fail closed) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | Gmail callback default | Gmail integration; without id/secret Gmail reports `configured: false` |
| `GOOGLE_AUTH_CLIENT_ID` / `GOOGLE_AUTH_CLIENT_SECRET` | fall back to Gmail vars | app sign-in (separate registration optional); without them `/login` shows `oauth_not_configured` |
| `GOOGLE_AUTH_REDIRECT_URI` | `http://localhost:4000/api/auth/google/callback` | must be registered in Google Cloud Console; must differ from Gmail URI |
| `INTEGRATION_ENCRYPTION_KEY` | — | AES-256-GCM for Gmail tokens |
| `GMAIL_SYNC_MAX_MESSAGES` | `25` | hard cap 100 |
| `MATCH_PROVIDER` | `deterministic` | `deterministic`\|`semantic`\|`hybrid` |
| `EMBEDDING_PROVIDER` | `local` | `local`\|`openai` |
| `AI_API_KEY` / `AI_EMBEDDING_MODEL` / `AI_EMBEDDING_BASE_URL` / `AI_EMBEDDING_TIMEOUT_MS` | `text-embedding-3-small` / `https://api.openai.com/v1` / `15000` | server-only |
| `HYBRID_DETERMINISTIC_WEIGHT` / `HYBRID_SEMANTIC_WEIGHT` | `70` / `30` | must sum > 0 |
| `ARBEITNOW_API_URL` / `JOB_SOURCE_TIMEOUT_MS` | arbeitnow endpoint / `10000` | keyless |
| `REMOTEOK_API_URL` | `https://remoteok.com/api` | keyless |
| `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` / `ADZUNA_COUNTRY` | — / — / `us` | source unavailable without both credentials |
| `JOOBLE_API_KEY` | — | source unavailable without it |
| `BROWSER_PROVIDER` | `playwright` | `playwright`\|`demo` (tests force `demo`) |
| `BROWSER_PROVIDER_DEMO` | — | set `playwright` only for local demo-on-Chromium verification |
| `BROWSER_HEADED` | — | `1` opens visible window for manual login |
| `BROWSER_MAX_SESSIONS_PER_USER` / `BROWSER_MAX_SESSIONS` | `3` / `20` | 429 beyond |
| `STORAGE_PROVIDER` | `local` | S3 fields unused |

Database:

```powershell
# 3. Infra (Postgres on :5433 + Redis on :6379)
docker compose up -d

# 4. DB client + migrate (needs DATABASE_URL)
npm run db:generate
npm run db:migrate   # or: npm run db:push --workspace=packages/db
```

Migrations (all applied in order; none pending in files):

- `20260923000000_init`
- `20260923000001_job_source_dedup`
- `20260924000000_job_match_explainability`
- `20260924000001_job_match_semantic`
- `20260925000000_gmail_tracking`
- `20260926000000_browser_runs` (Phase 7 tables)
- `20260927000000_run_recovery` (Phase 8: `mode`, `adapterId`, `retryCount`,
  `resumedFromRunId`, `recoveryReason`, `submissionConfirmedAt`,
  `lastSafeCheckpoint`, `submissionUnverified`)
- `20260924120036_app_auth` (Phase 9: `avatarUrl`/`emailVerifiedAt` on users,
  `auth_accounts` + `auth_sessions` with unique/lookup indexes; also drops
  the undeclared `application_runs_resumedFromRunId_idx` left over from
  Phase 8 — pre-existing schema drift, behavior-neutral).
- `20260928000000_discovery_signals` (Phase 10B: `discovery_configs`,
  `HiringSignalType` enum, `hiring_signals` with user-dedup unique +
  indexes; FKs cascade to users, nullify to companies/jobs).
- `20261103000000_autopilot` (Phase 20: autopilot settings + last summary
  on `discovery_configs`; no submission flag — submit stays human-confirmed).
- `20261103000001_password_auth` (Phase 21: nullable `users.passwordHash`
  scrypt credential; Google-only accounts keep it null).

Browser/Chromium:

```powershell
# playwright-core ships with npm install; download the headless shell once:
npx playwright-core install chromium --only-shell
# run from apps/api if scoped installs are preferred
```

Run:

```powershell
npm run dev:api      # :4000 (Express API)
npm run dev:web      # :3000 (Next.js)
npm run worker       # BullMQ worker (dev); prod: npm run worker:start
```

Exact local startup:

```powershell
docker compose up -d            # postgres :5433 + redis :6379
npm run dev:api                 # needs DATABASE_URL (+ AUTH_DEV_BYPASS=true for header auth in dev)
npm run worker                  # needs DATABASE_URL + REDIS_URL
npm run dev:web                 # needs NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
```

## Verify

```powershell
curl http://localhost:4000/api/health
curl http://localhost:4000/api/health/db
curl http://localhost:4000/api/dashboard/stats
npm test                # all workspaces (api vitest; db package has no tests)
npm run typecheck       # all workspaces
npm run lint            # api/db/shared echo; web has no eslint config (skipped)
$env:DATABASE_URL="postgresql://jobcopilot:jobcopilot@localhost:5433/jobcopilot?schema=public"
npx prisma validate --schema=packages\db\prisma\schema.prisma
npx prisma migrate status --schema=packages\db\prisma\schema.prisma  # needs live DB
```

Web has no test script (`apps/web/package.json`: dev/build/start/typecheck/lint only).

## Production deployment (Phase 17)

Images: `Dockerfile.api`, `Dockerfile.worker`, `Dockerfile.web`
(node:20-slim, `npm ci`, Prisma client generated at build time).
App services are opt-in compose profiles so plain `docker compose up -d`
still starts infrastructure (postgres :5433 + redis :6379) only.

```powershell
# 0. Infra + secrets (never commit real secrets)
docker compose up -d
$env:AUTH_SESSION_SECRET="<min-32-char-random>"   # required in production (auth 503s without it)
$env:INTEGRATION_ENCRYPTION_KEY="<min-32-char-random>"  # required for Gmail tokens
# optional: GOOGLE_AUTH_CLIENT_ID/SECRET, AI_GENERATION_PROVIDER=openai + AI_LLM_API_KEY

# 1. Explicit migration step (never auto-applied on boot; never reset)
docker compose --profile tools run --rm migrate

# 2. App services
docker compose --profile app up -d --build

# 3. Health
curl http://localhost:4000/api/health       # liveness (unauthenticated, safe body)
curl http://localhost:4000/api/health/db    # readiness probe (ok / skipped / 503)
```

Notes (validated Phase 19 against real Docker builds + containerized stack):

- `NEXT_PUBLIC_API_BASE_URL` is inlined into the web bundle at build time;
  pass `--build-arg NEXT_PUBLIC_API_BASE_URL=https://…` (or compose
  `NEXT_PUBLIC_API_BASE_URL`) to point at the deployed API origin. The
  default bake is `http://localhost:4000` (local production validation).
- Images are single-stage `node:20-slim` (~1.5 GB: full `npm ci` + build
  tooling kept for Prisma/Next builds). Multi-stage slimming is a post-v1
  optimization, not a launch blocker. API/worker images install `openssl`
  (required by Prisma engines — without it `migrate deploy` and DB queries
  fail in-container; fixed Phase 19). `.dockerignore` keeps host
  `node_modules`, `.env*`, and build output out of images; only
  `.env.example` templates ship (no secrets baked in — verified).
- Validated boot order: postgres/redis → `migrate` (`migrate deploy`, 10
  migrations, none pending, never reset) → `api` (healthy) → `worker`
  (`worker_ready`, 6/6 queues, redis+db up) → `web` (routes 200).
- Container security probes: unauthenticated data routes → 401,
  cross-origin unsafe POST → 403 (CSRF guard), `/api/auth/google` without
  credentials → 302 `…/login?error=oauth_not_configured`, health bodies
  carry no secrets. Production CORS allows only `FRONTEND_URL`
  (localhost exception is dev-only).
- Worker graceful shutdown verified in-container: SIGTERM →
  `shutdown_started` → `shutdown_complete`, exit 0, clean restart to
  `worker_ready`. API has the same bounded shutdown (10s force bound). On
  Windows, console signal delivery to child processes is unreliable —
  containers (Linux) are the supported target.
- Multi-instance API deployments need sticky sessions or an external limiter:
  the `/api/auth` limiter is per-process. Single-instance is acceptable
  for v1.

### Production configuration checklist

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV=production` | yes | fail-closed auth, Secure cookies, localhost CORS exception off |
| `DATABASE_URL` | yes | Postgres; API 503s DB routes without it |
| `REDIS_URL` | yes | BullMQ state; queue ops 503 without it |
| `AUTH_SESSION_SECRET` (≥32 chars) | yes | auth 503s without it; OAuth state + sessions |
| `FRONTEND_URL` | yes | exact web origin; CORS + OAuth redirects |
| `INTEGRATION_ENCRYPTION_KEY` (≥32) | for Gmail | AES-256-GCM for Gmail tokens |
| `GOOGLE_AUTH_CLIENT_ID/SECRET` (+ `_REDIRECT_URI`) | for login | exact redirect URI registered in Google Cloud Console |
| `GOOGLE_CLIENT_ID/SECRET` (+ `GOOGLE_REDIRECT_URI`) | for Gmail | separate registration allowed; `gmail.readonly` minimum scope |
| `AI_GENERATION_PROVIDER` / `AI_LLM_API_KEY` / `AI_LLM_*` | for AI drafts | server-side only, never `NEXT_PUBLIC_*`; `off` = 409 `configured:false` |
| `NEXT_PUBLIC_API_BASE_URL` | yes (build-time) | baked into web bundle; no secrets in it |
| `AUTH_DEV_BYPASS` | never in prod | ignored when `NODE_ENV=production` (warns + fails closed) |

Phase 19 credential status: `REAL_GOOGLE_OAUTH = BLOCKED_BY_CREDENTIALS`,
`REAL_LLM = BLOCKED_BY_CREDENTIALS`, Gmail live OAuth likewise blocked —
no production Google/LLM credentials were available, so provider-bound
flows are validated with mocked boundaries + test provider only.

### Backup / recovery (deployment responsibility — no automation in-repo)

- PostgreSQL: schedule `pg_dump` (or volume snapshots) of the `jobcopilot`
  database; practice restores; never `prisma migrate reset` (destroys data).
  Forward-only `migrate deploy` is the rollback story (no down migrations).
- Redis: ephemeral queue state only (BullMQ jobs + repeatable schedules).
  No backup required; safe to lose (re-enqueue from the API on demand).
- Secrets (`AUTH_SESSION_SECRET`, `INTEGRATION_ENCRYPTION_KEY`, OAuth
  client secrets, `AI_LLM_API_KEY`): back up in a secret manager. Rotating
  `AUTH_SESSION_SECRET` invalidates all sessions (users re-login);
  rotating `INTEGRATION_ENCRYPTION_KEY` orphan existing Gmail tokens
  (users reconnect Gmail).
- Browser sessions/runs are intentionally ephemeral (isolated contexts,
  no cookies persisted) and cannot be restored from the database.

### Domain / HTTPS checklist (required when a real domain exists)

1. Point DNS at the host; terminate TLS (reverse proxy / platform).
2. Set `FRONTEND_URL=https://<web>` and `NEXT_PUBLIC_API_BASE_URL=https://<api>`.
3. Register both Google redirect URIs (`/api/auth/google/callback`,
   `/api/integrations/gmail/callback`) exactly in Google Cloud Console.
4. Confirm `Secure` cookies (automatic when `NODE_ENV=production` + HTTPS),
   CORS allows only the web origin, and `/api/health` + `/api/health/db`
   are reachable from the orchestrator.

## API (current)

Auth: server-side sessions (`jobpilot_session` HttpOnly cookie). All
`/api/*` data routes require it (401 otherwise). Prisma-backed routes
additionally require `DATABASE_URL` (`requireDb` → 503 otherwise, including
`GET /api/application-runs/adapters`). Dev/test header bypass works only
with explicit `AUTH_DEV_BYPASS=true` outside production.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health`, `/api/health/db` | liveness + DB probe |
| GET | `/api/auth/google` | 302 to Google (or to `/login?error=oauth_not_configured`) |
| GET | `/api/auth/google/callback` | state/PKCE check → session cookie → 302 `/dashboard` (failures → `/login?error=…`) |
| GET | `/api/auth/me` | safe user fields; 401 unauthenticated |
| POST | `/api/auth/register` | email + password signup (scrypt, min 8 chars), sets session |
| POST | `/api/auth/login` | email + password login, sets session; uniform 401 on failure |
| POST | `/api/auth/logout` | revoke + clear cookie; always 200 (idempotent) |
| GET/POST | `/api/jobs` | manual entry + ingestion triggers |
| GET/POST | `/api/applications` | tracker |
| PATCH | `/api/applications/:id/status` | state-machine-guarded |
| GET | `/api/dashboard/stats` | counts |
| PUT/GET | `/api/profile` | Prisma-backed |
| GET/POST | `/api/resumes`, `/api/projects` | Prisma-backed |
| GET/POST | `/api/matches`, `POST /api/jobs/:id/match`, `POST /api/matches/run` | deterministic/semantic/hybrid + `{mode}` override |
| GET/POST | `/api/integrations`, `/api/inbox` | Gmail connect/sync/list (DB-required) |
| POST/GET | `/api/applications/:id/runs` | create run / history (DB-required) |
| GET | `/api/application-runs/adapters` | closed registry descriptors (DB-required) |
| POST | `/api/application-runs/:id/start\|approve\|fill\|submit\|cancel\|resume\|recover\|resolve` | lifecycle (DB-required; submit needs `{confirm:true}`) |
| GET | `/api/application-runs/:id`, `/:id/status` | run detail / pollable status |
| GET | `/api/notifications[?unreadOnly&limit≤100]` | owner-scoped list, newest first |
| GET | `/api/notifications/unread-count` | owner unread count, no side effects |
| PATCH | `/api/notifications/:id` | idempotent mark-read; foreign → 404 |
| GET | `/api/analytics` | owner-scoped descriptive aggregates (funnel, matches, jobs, activity, discovery) |
| GET | `/api/autopilot/status` | autopilot settings, last summary, recent prepared runs |
| POST | `/api/autopilot/run` | prepare + fill matches (stops at `WAITING_FOR_SUBMISSION`; never submits) |

## Job matching modes

Three server-side modes (`MATCH_PROVIDER`, default `deterministic`). Offline
by default; no AI credentials needed.

| Mode | Behavior |
|---|---|
| `deterministic` | Explainable scoring only. No external calls. |
| `semantic` | Overall score from embedding cosine; deterministic breakdown/skills/requirements kept as guardrails. |
| `hybrid` | 70/30 deterministic/semantic blend (configurable). Hard mismatches cap to LOW. |

`EMBEDDING_PROVIDER=local` (offline token-hash) or `openai` (compatible API
via `AI_EMBEDDING_BASE_URL` + `AI_API_KEY`, server-side only). Failures fall
back with `matchMode: "deterministic_fallback"`. Tests use fake providers +
mocked HTTP — no live AI calls.

## Gmail integration

Read-only tracking. Nothing is ever sent.

- Connect at `/integrations` (Google OAuth, `gmail.readonly` + `openid
  email`). Without `GOOGLE_CLIENT_ID`/`SECRET` the API reports
  `configured: false`. Separate from app sign-in sessions (different
  tokens, different tables, different OAuth registrations allowed).
- Stored: AES-256-GCM tokens, account email/scopes/expiry/sync stamps; per
  email: provider IDs, sender/subject/snippet, normalized body ≤4000 chars,
  classification + evidence, linkage. No attachments.
- Behavior: bounded sync (default 25, cap 100), deterministic
  classification, strong-evidence-only linkage (`NEEDS_REVIEW` otherwise),
  `ApplicationEvent(source: "GMAIL")` via state machine, notifications for
  interviews/offers/rejections/assessments/recruiter replies. Idempotent.
- Disconnect revokes (best effort) + deletes tokens; synced email rows stay
  as history. Email text treated as untrusted; only counts logged.

## Browser-assisted applications (Phases 7–8)

Human-in-the-loop: JobPilot prepares; you approve and submit. No CAPTCHA
solving, no anti-bot bypass, no stealth, no credential handling, no mass
applications. LinkedIn, Indeed, X unsupported.

- Adapters (closed registry): `demo` (local demo page, `HUMAN_CONFIRMED`),
  `fixture-ats` (controlled `/ats-demo` fixture, `HUMAN_CONFIRMED` + target
  verification), `generic` (ordinary http(s) except LinkedIn/X blocklist,
  `MANUAL_ONLY` — never auto-submits). Explicit `capabilities` +
  `submissionMode`; no automatic mode exists.
- Flow: create → start (open/inspect/map/propose) → review → approve → fill
  (verified) → `WAITING_FOR_SUBMISSION` → `{confirm:true}` → verified submit
  → `BROWSER` event + transition. Milestones audited on the timeline.
- Manual login: login wall → `LOGIN_REQUIRED` / `WAITING_FOR_LOGIN`; sign in
  yourself in the headed window (`BROWSER_HEADED=1`), then Resume.
  CAPTCHA/denied stops; nothing bypassed.
- Recovery: resume safe runs (fresh session, checkpoint restore, ≤3
  retries), recover terminal runs into linked runs (approvals carry over,
  submissions never replay). Ambiguous → `SUBMISSION_STATUS_UNKNOWN`, manual
  resolve (`submitted` completes without clicking; `not-submitted` clears).
  Duplicates → `ALREADY_SUBMITTED` without clicking.
- Limits: 10-min idle / 30-min absolute session expiry, 15-min run budget,
  ≤3 sessions/user (429), adapter allowlists (private-IP + redirect escapes
  blocked), 30s nav / 10s action timeouts. Failed runs close contexts.
- Stored: run/answer metadata only — never cookies, storage, tokens,
  passwords. Responses never contain browser secrets.
- Local E2E: start API + web + DB, create job/application, open
  `/demo-application` (adapter `demo`) or `/ats-demo/apply` (adapter
  `fixture-ats`), walk the assistant UI to confirmed submit, clean up.

## Application authentication (Phase 9)

Google OIDC sign-in + server-side sessions. No passwords, no MFA, no SSO.

- **Setup:** create a Google OAuth client (Web application) with authorized
  redirect URI `http://localhost:4000/api/auth/google/callback`
  (production: your `https://…` equivalent). Set `GOOGLE_AUTH_CLIENT_ID` /
  `GOOGLE_AUTH_CLIENT_SECRET` (or reuse the Gmail `GOOGLE_CLIENT_ID` /
  `GOOGLE_CLIENT_SECRET` — documented fallback), `GOOGLE_AUTH_REDIRECT_URI`,
  and `AUTH_SESSION_SECRET` (≥32 random chars). Without them, `/login`
  shows `oauth_not_configured` and `/api/auth/google` redirects there.
- **Flow:** `/login` → Continue with Google → Google consent → callback
  validates signed state (HMAC, 10-min, purpose-bound) + PKCE (S256),
  exchanges the code, resolves identity from provider userinfo (verified
  email required), links/creates the user, mints a fresh session, sets the
  `HttpOnly` cookie, redirects to `/dashboard`. Failures redirect to
  `/login?error=oauth_failed|invalid_state` (never raw provider errors).
- **Cookie:** `jobpilot_session` = opaque random token; `Path=/`,
  `HttpOnly`, `SameSite=Lax`, `Secure` in production, 30-day `Max-Age`.
  DB holds only the SHA-256 hash. Web fetch uses `credentials: "include"`;
  nothing auth-related lives in localStorage/URLs/JS state.
- **Email + password (Phase 21):** `POST /api/auth/register` and
  `POST /api/auth/login`; scrypt hashes with a per-user salt (min 8 chars),
  the same server-side session cookie, duplicate emails → 409, and uniform
  401 on bad credentials. Unverified password accounts are never auto-linked
  to Google by email (prevents pre-registration takeover).
- **Logout:** `POST /api/auth/logout` revokes the session, clears the
  cookie, always returns 200 (second logout reveals nothing).
- **Dev/test:** `AUTH_DEV_BYPASS=true` restores the legacy `x-dev-user-id`
  header, and is ignored when `NODE_ENV=production`. Vitest enables it via
  `vitest.config.ts` env; auth tests unset it to verify 401 paths.
- **Production requirements:** `NODE_ENV=production`, HTTPS (Secure
  cookies), `AUTH_SESSION_SECRET` ≥32 chars (auth 503s without it),
  Postgres + applied migrations, Google client with the exact redirect URI.
  The in-process `/api/auth` limiter (120/min/IP) is per-process — use
  sticky sessions or an external limiter for multi-instance deployments.
- **Security model:** uniform 401s (no user/session oracle); userId-scoped
  queries everywhere (foreign → 404); browser automation never touches app
  cookies/tokens (isolated contexts, fixture allowlists only); Gmail tokens
  never used as app sessions and vice versa. No CSP by design (Next inline
  runtime); helmet + SameSite + CSRF origin checks carry the model.
- **Limitations:** no MFA/enterprise SSO; userinfo-based
  identity validation rather than full JWT signature verification; no
  "revoke all sessions" endpoint; real Google E2E never run (no
  credentials) — login covered by mocked-HTTP fixture + production-build
  browser E2E up to the provider boundary.

## Background workers (Phase 10A)

Production-oriented async infrastructure (BullMQ 6 + Redis). No new
product features — future phases enqueue into these queues.

- **Start:** `docker compose up -d` (Redis :6379), then `npm run worker`
  (dev) or `npm run worker:start` (prod build). The worker is not an HTTP
  API: it validates env, pings Redis, probes Postgres, registers sources,
  starts one BullMQ Worker per queue, then reports `worker_ready`.
  Missing Redis/DB fails fast with an actionable message (no silent
  healthy, no infinite crash loop).
- **Queues:** `job-ingestion`, `job-matching`, `gmail-sync`,
  `notifications`, `analytics`, `job-discovery` — closed enum, one job type
  each (`ingest`/`match`/`sync`/`notify`/`record`/`discover`). Processors
  live in `apps/api/src/queues/` (discovery logic in
  `services/job-discovery.ts`) and call existing services only.
- **Producing:** `POST /api/jobs/ingest`, `POST /api/matches/run`, `POST
  /api/integrations/gmail/sync` accept `{async: true}` → `202 {queued,
  jobId, queue}` (sync default unchanged). Central `queue-service` is the
  only BullMQ entry point for routes.
- **Retry policy:** attempts=3, custom 1s → 5s → 25s backoff. Transient
  (429/5xx, timeouts, DB connection loss) retries; permanent (4xx, bad
  payloads, unknown sources, missing users/integrations, disconnected
  Gmail — and never CAPTCHA/login/access-denied) throws
  `UnrecoverableError` immediately.
- **Idempotency:** deterministic ids (`q.<queue>.<user>.<key>`) dedupe
  queue entries; services dedupe side effects (ingest fingerprints + PG
  uniques, match upserts, identical-notification guard, Gmail sync guards).
- **Dead letter:** exhausted failures recorded sanitized to the
  `dead-letter` queue (queue/type/ids/attempts/timestamp/code/message —
  never payloads). Owners inspect via `GET /api/queues/dlq` and retry via
  `POST /api/queues/dlq/retry` (re-runs the retained origin job; gone
  retentions report 404-style failure, never resurrected).
- **Control:** `GET /api/queues/health` (auth; counts only),
  `GET /api/queues/status/:jobId` (owner only), `POST /api/queues/cancel`
  (waiting jobs removed; active never preempted — reported honestly).
- **Scheduling:** `upsertJobScheduler` infrastructure, idempotent by fixed
  ids; zero schedules enabled by default (`QUEUE_SCHEDULE_*` opt-in).
- **Shutdown:** SIGINT/SIGTERM stop polling, finish active work within
  `WORKER_SHUTDOWN_TIMEOUT_MS`, then close workers → Redis → Prisma.
- **Logs:** structured JSON (`worker`/`queue-service`/`job-discovery`
  components, safe fields only — no payloads, tokens, cookies, or
  connection strings).

## Automated discovery (Phase 10B)

Discovery configuration → scheduled/manual job → BullMQ → permitted
adapters → normalize → validate → dedupe → PostgreSQL → queued matching →
existing matcher → JobMatch. Hiring signals are evidence, never predictions.

- **Sources (closed registry, verified):** `arbeitnow` (public Job Board
  API, single bounded request/run), `greenhouse` (public Job Board API;
  verified live against two boards with no credentials — list returns
  structured jobs, per-job detail returns HTML stripped to ≤8000 chars of
  plain text; 1 list + ≤limit detail fetches per search with 250ms
  politeness gaps and fixed timeouts; per-board tokens charset-validated
  into a fixed endpoint template — never URLs), `lever` (public Postings
  API; verified live against `leverdemo`/`lever` with no credentials —
  single list request ≤100 rows, client-side filter, `descriptionPlain`
  preferred else HTML stripped to ≤8000 chars; board token is the company
  fallback), `ashby` (public Job Board API; verified live against `Ashby`
  with no credentials — single list request, `descriptionPlain` preferred,
  `isListed: false` skipped, compensation never requested; board slug is
  the company fallback), `remoteok` (keyless public remote job board API,
  single list request, HTML stripped), `adzuna` (public search API; free
  app id/key required; one bounded request per run), `jooble` (public
  search API; free key required; one bounded POST per run), `demo` mock
  (offline tests). HN-scraping/LinkedIn/X/Indeed are NOT integrated
  (unverified or access-restricted — documented unsupported, registry
  rejects them).
- **Configuration:** `DiscoveryConfig` per user (enabled, roles/locations/
  skills/excluded-keywords bounds, remoteOnly, minimumSalary,
  employmentTypes, sourceKeys ≤5, boards ≤5, maxJobsPerRun ≤50, schedule
  toggle + 1–168h interval). Explicit config wins; Profile fills blanks.
  `PUT /api/discovery/config` syncs the per-user schedule (active/removed/
  unavailable reported, never silent).
- **Pipeline:** plan (≤3 sources, ≤8 searches, job-budget split) → existing
  `ingestJobs` per search (normalization/validation/dedup unchanged;
  salary floor + excluded keywords gate follow-ups only, never storage) →
  changed jobs enqueue `job-matching` (run-unique key) → `JOB_POSTING`
  signals for new jobs. Partial source failure completes with counts;
  total failure throws for BullMQ retry/DLQ classification.
- **Rate limits:** per-source timeouts + request caps in
  `info().limits`; 429/5xx/timeouts are transient (`transient:` signal),
  4xx/malformed/permanent are `UnrecoverableError` — never bypassed,
  never retried blindly.
- **Dedup/lifecycle:** source+externalId → canonical URL (utm/fragment
  stripped) → fingerprint; reruns update safe fields only and insert
  nothing; uncertain cases stay separate (never aggressive merges).
- **Signals:** `HiringSignal` (user-scoped, unique per user+source+type+
  key, evidence ≤500 chars, confidence heuristic); company linked via
  exact normalized-name match only; `GET /api/signals[?type&company]`,
  `GET /api/signals/:id` (foreign → 404).
- **Trust boundary:** descriptions/announcements are untrusted data —
  stored verbatim, never instructions (no LLM in this phase by design).
- **Limitations:** Greenhouse/Lever/Ashby need explicit board tokens (no board
  discovery; Lever tokens are case-sensitive, Ashby slugs are not); no salary/experience filters at adapters (post-filter for
  follow-ups); schedules are per-user opt-in only; no real-board testing
  beyond `airbnb` (one live run) — Stripe board verified reachable but not
  ingested.

## Autopilot (Phase 20)

Prepare applications automatically; the human still submits.

- Settings live on `DiscoveryConfig` (`autopilotEnabled`,
  `autopilotMinScore` 0–100 default 80, `autopilotMaxPerRun` 1–10 default 3,
  optional `autopilotResumeId`). The `/autopilot` page edits them and shows
  the last run + recent prepared runs.
- `POST /api/autopilot/run` runs in the API process (browser handles are
  in-process): select `JobMatch` rows at/above the threshold whose job has
  no application → create application (mode `APPROVAL`, resume attached) →
  create/start the run → auto-approve deterministic answers → fill → stop at
  `WAITING_FOR_SUBMISSION`. It never calls submit.
- Adapter choice is URL-based: `/ats-demo/*` → `fixture-ats`,
  `/demo-application` → `demo`, otherwise `generic` (`MANUAL_ONLY`).
  LinkedIn/X/Twitter and jobs without an http(s) URL are skipped.
- File inputs are never filled; upload the resume manually in the run.
  Required fields without deterministic values leave the run in
  `WAITING_FOR_REVIEW` (`needs_input`) rather than guessing.
- Per-run cap is 10; re-running skips jobs that already have an application.
  Status/summary are persisted on the discovery config for the UI.

## Known discrepancies (Phase 8 validation, kept for record)

- `GET /api/application-runs/adapters` requires `DATABASE_URL` (503 in stub
  mode). `browser-phase8.test.ts` calls it outside a DB-gated block, so it
  fails without a DB. No behavior changed for this report.
- `leads`, `analytics`, `settings` (and parts of `matches`/`integrations`
  copy) still reference future phases in `apps/web/app/_placeholders.tsx`.
- Live headed manual-login + full run-loop E2E against real Chromium + DB
  was not executed in the Phase 8 validation (DB down, no display). Covered
  by demo-provider integration tests when `DATABASE_URL` is set.

## Next recommended phase

Phase 11 candidates (do not start without explicit approval). Keep the same
guardrails: closed registries, allowlists, human confirmation, no
LinkedIn/Indeed/X automation, no CAPTCHA/anti-bot bypass, no credential
handling, no mass auto-apply, no LLM features unless explicitly approved.
