const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    // Phase 9: session cookie auth is cross-origin (web :3000 -> api :4000).
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    let message = `API ${res.status} on ${path}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // Non-JSON error body; keep the status-based message.
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

export interface DashboardStats {
  jobsDiscovered: number;
  applications: number;
  byStatus: Record<string, number>;
  responses: number;
  interviews: number;
  offers: number;
  responseRate: number;
}

export interface Job {
  id: string;
  title: string;
  company: string;
  companyName?: string;
  location?: string | null;
  remote: boolean;
  description: string;
  sourceUrl?: string | null;
  sourceKey?: string;
  employmentType?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string;
  postedAt?: string | null;
  createdAt: string;
}

export interface JobSource {
  id: string;
  name: string;
  available: boolean;
  mock: boolean;
}

export interface IngestionResult {
  source: string;
  fetched: number;
  normalized: number;
  inserted: number;
  updated: number;
  duplicates: number;
  rejected: number;
  errors: { externalId?: string; reason: string }[];
  durationMs: number;
}

export interface JobMatch {
  jobId: string;
  overallScore: number;
  decision: "STRONG_MATCH" | "GOOD_MATCH" | "PARTIAL_MATCH" | "LOW_MATCH";
  breakdown: {
    skillScore: number;
    roleScore: number;
    experienceScore: number;
    locationScore: number;
    salaryScore: number;
    educationScore: number;
  };
  matchedSkills: string[];
  missingSkills: string[];
  matchedRequirements: string[];
  missingRequirements: string[];
  uncertainRequirements: string[];
  reasons: string[];
  warnings: string[];
  semanticScore?: number;
  matchMode?: "deterministic" | "semantic" | "hybrid" | "deterministic_fallback";
  semanticProvider?: string;
  semanticModel?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
  emailVerifiedAt?: string | null;
}

export const authApi = {
  /** Base URL for the browser login flow (top-level navigation, not fetch). */
  googleUrl: `${API}/api/auth/google`,
  me: () => req<{ user: AuthUser }>("/api/auth/me"),
  logout: () => req<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  login: (body: { email: string; password: string }) =>
    req<{ user: AuthUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  register: (body: { email: string; password: string; name?: string }) =>
    req<{ user: AuthUser }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

export interface DiscoveryConfig {
  id?: string;
  enabled: boolean;
  targetRoles: string[];
  targetLocations: string[];
  remoteOnly: boolean;
  minimumSalary?: number | null;
  employmentTypes: string[];
  experienceLevels: string[];
  preferredSkills: string[];
  excludedKeywords: string[];
  sourceKeys: string[];
  boards: string[];
  maxJobsPerRun: number;
  scheduleEnabled: boolean;
  scheduleIntervalHours: number;
  autopilotEnabled: boolean;
  autopilotMinScore: number;
  autopilotMaxPerRun: number;
  autopilotResumeId?: string | null;
  lastRunAt?: string | null;
  lastStatus?: string | null;
  lastSummary?: Record<string, number | boolean | string> | null;
  autopilotLastRunAt?: string | null;
  autopilotLastSummary?: AutopilotSummary | null;
}

export type AutopilotItemStatus = "filled" | "needs_input" | "blocked" | "failed" | "skipped";

export interface AutopilotItem {
  jobId: string;
  title: string;
  companyName: string;
  score: number;
  applicationId: string | null;
  runId: string | null;
  adapter: string | null;
  targetUrl: string | null;
  status: AutopilotItemStatus;
  message: string | null;
}

export interface AutopilotSummary {
  evaluated: number;
  attempted: number;
  filled: number;
  needsInput: number;
  skipped: number;
  failed: number;
  items: AutopilotItem[];
  durationMs: number;
}

export interface AutopilotRecentRun {
  runId: string;
  applicationId: string;
  jobId: string;
  title: string;
  companyName: string;
  adapter: string;
  status: string;
  targetUrl: string | null;
  createdAt: string;
}

export const autopilotApi = {
  run: (body: { limit?: number; minScore?: number; jobIds?: string[] } = {}) =>
    req<{ autopilot: AutopilotSummary }>("/api/autopilot/run", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  status: () =>
    req<{
      autopilot: {
        enabled: boolean;
        minScore: number;
        maxPerRun: number;
        resumeId: string | null;
        lastRunAt: string | null;
        lastSummary: AutopilotSummary | null;
      } | null;
      recentRuns: AutopilotRecentRun[];
    }>("/api/autopilot/status"),
};

export interface SignalRelatedJob {
  id: string;
  title: string;
  companyName: string;
}

export interface HiringSignal {
  id: string;
  companyId?: string | null;
  companyName: string;
  source: string;
  type: string;
  title: string;
  url?: string | null;
  evidenceSummary?: string | null;
  confidence: number;
  relatedJobId?: string | null;
  relatedJob?: SignalRelatedJob | null;
  applicationId?: string | null;
  detectedAt: string;
  createdAt?: string;
}

export const discoveryApi = {
  config: () => req<{ config: DiscoveryConfig | null }>("/api/discovery/config"),
  save: (body: Partial<DiscoveryConfig>) =>
    req<{ config: DiscoveryConfig; schedule: string }>("/api/discovery/config", { method: "PUT", body: JSON.stringify(body) }),
  run: (body: { sourceKeys?: string[] } = {}) =>
    req<{ queued: boolean; jobId: string; queue: string }>("/api/discovery/run", { method: "POST", body: JSON.stringify(body) }),
  status: () => req<{ config: Partial<DiscoveryConfig> | null; recentJobs: { jobId: string; queue: string; state: string }[] }>("/api/discovery/status"),
};

export const signalsApi = {
  list: (query = "") => req<{ signals: HiringSignal[] }>(`/api/signals${query}`),
  get: (id: string) => req<{ signal: HiringSignal }>(`/api/signals/${id}`),
};

export interface Notification {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  read: boolean;
  applicationId?: string | null;
  emailMessageId?: string | null;
  createdAt: string;
}

export const notificationsApi = {
  list: (query = "") => req<{ notifications: Notification[] }>(`/api/notifications${query}`),
  unreadCount: () => req<{ unread: number }>("/api/notifications/unread-count"),
  markRead: (id: string) =>
    req<{ notification: Notification }>(`/api/notifications/${id}`, { method: "PATCH" }),
};

export interface ProfilePreferences {
  targetRoles: string[];
  skills: string[];
  minSalary?: number | null;
  preferredSalary?: number | null;
  salaryCurrency: string;
  preferredLocations: string[];
  workMode: "REMOTE" | "HYBRID" | "ONSITE" | "ANY";
  employmentTypes: string[];
  noticePeriodDays?: number | null;
  workAuthorization: string[];
  preferredIndustries: string[];
  preferredCompanies: string[];
  excludedCompanies: string[];
}

export interface Profile {
  id: string;
  fullName?: string | null;
  headline?: string | null;
  summary?: string | null;
  yearsOfExperience?: number | null;
  education?: unknown;
  targetRoles: string[];
  skills: string[];
  minSalary?: number | null;
  preferredSalary?: number | null;
  salaryCurrency: string;
  preferredLocations: string[];
  workMode: "REMOTE" | "HYBRID" | "ONSITE" | "ANY";
  employmentTypes: string[];
  noticePeriodDays?: number | null;
  workAuthorization: string[];
  preferredIndustries: string[];
  preferredCompanies: string[];
  excludedCompanies: string[];
  portfolioUrl?: string | null;
  githubUrl?: string | null;
  linkedinUrl?: string | null;
  experienceLevel?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  technologies: string[];
  role?: string | null;
  contributions?: string | null;
  achievements?: string | null;
  githubUrl?: string | null;
  liveUrl?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Resume {
  id: string;
  name: string;
  targetRoles: string[];
  isActive: boolean;
  fileUrl?: string | null;
  parsedText?: string | null;
  kind?: "RESUME" | "PORTFOLIO";
  storageKey?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  originalName?: string | null;
  status?: "UPLOADED" | "PARSING" | "PARSED" | "FAILED";
  parseError?: string | null;
  parsedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SkillCategory =
  | "language"
  | "framework"
  | "database"
  | "cloud"
  | "devops"
  | "tool"
  | "platform"
  | "other";

export interface ExtractedSkill {
  name: string;
  category: SkillCategory;
}

export interface ExtractedExperience {
  company: string | null;
  title: string | null;
  responsibilities: string[];
  achievements: string[];
  internship: boolean;
}

export interface ExtractedProject {
  name: string;
  description: string;
  technologies: string[];
}

export type ExperienceLevel = "INTERN" | "ENTRY" | "MID" | "SENIOR" | "LEAD";
export type DiscoveryWorkMode = "REMOTE" | "HYBRID" | "ONSITE" | "ANY";

export interface ResumeExtraction {
  summary: string | null;
  currentTitle: string | null;
  yearsOfExperience: number | null;
  education: string[];
  location: string | null;
  preferredLocations: string[];
  skills: ExtractedSkill[];
  experience: ExtractedExperience[];
  projects: ExtractedProject[];
  targetRoles: string[];
  workMode: DiscoveryWorkMode;
  employmentTypes: string[];
  minSalary: number | null;
  experienceLevel: ExperienceLevel | null;
  confidence: number;
  warnings: string[];
}

export interface ResumeUploadResult {
  resume: Resume;
  extraction: ResumeExtraction | null;
  provider: "ai" | "heuristic" | null;
  parseError: string | null;
}

export interface PortfolioAnalysis {
  accessible: boolean;
  url: string;
  kind: "website" | "github";
  projects: ExtractedProject[];
  skills: ExtractedSkill[];
  error: string | null;
  warnings: string[];
}

export interface RecommendationItem {
  jobId: string;
  title: string;
  company: string;
  location: string | null;
  remote: boolean;
  employmentType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string;
  source: string;
  sourceUrl: string | null;
  applyUrl: string | null;
  postedAt: string | null;
  experienceRequirement: number | null;
  experienceLevel: ExperienceLevel | null;
  matchScore: number;
  decision: string;
  matchMode: string;
  breakdown: {
    skillScore: number;
    roleScore: number;
    experienceScore: number;
    projectScore: number;
    educationScore: number;
    locationScore: number;
    salaryScore: number;
    employmentTypeScore: number;
    workAuthScore: number;
  };
  reasons: string[];
  matchedSkills: string[];
  missingSkills: string[];
  warnings: string[];
  saved: boolean;
}

export interface RecommendationDetail extends RecommendationItem {
  explanation: {
    whyThisMatches: string[];
    matchedSkills: string[];
    matchedRequirements: string[];
    missingSkills: string[];
    missingRequirements: string[];
    uncertainRequirements: string[];
    matchingProjects: { id: string; name: string; role: string | null; technologies: string[] }[];
    recommendations: string[];
    warnings: string[];
  };
}

export interface RecommendationsResponse {
  items: RecommendationItem[];
  total: number;
}

export interface ProfileCompleteness {
  percent: number;
  missing: string[];
  hasProfile: boolean;
  parsedResumes: number;
}

export interface ResumeVersion {
  id: string;
  resumeId: string;
  version: number;
  content: unknown;
  note?: string | null;
  createdAt: string;
}

export const profileApi = {
  get: () => req<{ profile: Profile }>("/api/profile"),
  save: (body: Record<string, unknown>) =>
    req<{ profile: Profile }>("/api/profile", { method: "PUT", body: JSON.stringify(body) }),
};

export const projectsApi = {
  list: () => req<{ projects: Project[] }>("/api/projects"),
  create: (body: Record<string, unknown>) =>
    req<{ project: Project }>("/api/projects", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: Record<string, unknown>) =>
    req<{ project: Project }>(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  remove: (id: string) =>
    req<{ ok: boolean }>(`/api/projects/${id}`, { method: "DELETE" }),
};

export function uploadResumeDocument(input: {
  file: File;
  kind?: "RESUME" | "PORTFOLIO";
  name?: string;
  onProgress?: (percent: number) => void;
}): Promise<ResumeUploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API}/api/resumes/upload`);
    xhr.withCredentials = true;
    const lowerName = input.file.name.toLowerCase();
    const contentType =
      input.file.type ||
      (lowerName.endsWith(".docx")
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/pdf");
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.setRequestHeader("x-file-name", encodeURIComponent(input.file.name));
    xhr.setRequestHeader("x-resume-kind", input.kind ?? "RESUME");
    if (input.name) xhr.setRequestHeader("x-resume-name", encodeURIComponent(input.name));
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && input.onProgress) {
        input.onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // Non-JSON error body.
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as ResumeUploadResult);
      } else {
        const message =
          (body as { error?: string } | null)?.error ?? `Upload failed (${xhr.status})`;
        reject(new ApiError(xhr.status, message));
      }
    };
    xhr.onerror = () => reject(new ApiError(0, "Could not reach the API."));
    xhr.send(input.file);
  });
}

export const resumesApi = {
  list: () => req<{ resumes: Resume[] }>("/api/resumes"),
  create: (body: Record<string, unknown>) =>
    req<{ resume: Resume }>("/api/resumes", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: Record<string, unknown>) =>
    req<{ resume: Resume }>(`/api/resumes/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  remove: (id: string) =>
    req<{ ok: boolean }>(`/api/resumes/${id}`, { method: "DELETE" }),
  versions: (id: string) =>
    req<{ versions: ResumeVersion[] }>(`/api/resumes/${id}/versions`),
  upload: uploadResumeDocument,
  parse: (id: string) =>
    req<{ extraction: ResumeExtraction; provider: "ai" | "heuristic"; resume: Resume }>(
      `/api/resumes/${id}/parse`,
      { method: "POST" },
    ),
  extraction: (id: string) =>
    req<{ resume: Resume; extraction: ResumeExtraction | null }>(`/api/resumes/${id}/extraction`),
  confirm: (
    id: string,
    body: {
      extraction: ResumeExtraction;
      portfolioUrl?: string | null;
      githubUrl?: string | null;
      linkedinUrl?: string | null;
      setActive?: boolean;
    },
  ) =>
    req<{ profile: Profile; projects: Project[]; resume: Resume }>(
      `/api/resumes/${id}/extraction`,
      { method: "PUT", body: JSON.stringify(body) },
    ),
  downloadUrl: (id: string) => `${API}/api/resumes/${id}/download`,
};

export const portfolioApi = {
  analyze: (url: string) =>
    req<{ analysis: PortfolioAnalysis }>("/api/portfolio/analyze", {
      method: "POST",
      body: JSON.stringify({ url }),
    }),
};

export const recommendationsApi = {
  list: (query = "") => req<RecommendationsResponse>(`/api/recommendations${query}`),
  run: (body: { limit?: number; mode?: string; async?: boolean } = {}) =>
    req<{ matched: number; mode: string }>("/api/recommendations/run", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  detail: (jobId: string) =>
    req<{ recommendation: RecommendationDetail }>(`/api/recommendations/${jobId}`),
  completeness: () => req<ProfileCompleteness>("/api/recommendations/completeness"),
};

export const savedJobsApi = {
  list: () =>
    req<{ savedJobs: { id: string; jobId: string; createdAt: string; job: Job }[] }>(
      "/api/saved-jobs",
    ),
  save: (jobId: string) =>
    req<{ savedJob: { id: string; jobId: string } }>("/api/saved-jobs", {
      method: "POST",
      body: JSON.stringify({ jobId }),
    }),
  remove: (jobId: string) =>
    req<{ ok: boolean }>(`/api/saved-jobs/${jobId}`, { method: "DELETE" }),
};

export type BillingInterval = "monthly" | "yearly";

export interface BillingPlanLimits {
  savedJobs: number | null;
  resumeAnalysesPerMonth: number | null;
  coverLetters: boolean;
  interviewPreparation: boolean;
  interviewSimulations: boolean;
  priorityProcessing: boolean;
}

export interface BillingPlanView {
  id: "free" | "pro" | "premium";
  name: string;
  description: string;
  popular: boolean;
  prices: Record<BillingInterval, number>;
  limits: BillingPlanLimits;
  features: string[];
  yearlySavings: number;
  yearlySavingsPercent: number;
}

export interface BillingSubscription {
  id: string;
  planId: string;
  planName: string;
  billingInterval: BillingInterval;
  status: "PENDING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED";
  startDate: string;
  expirationDate: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  renewalDate: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  amount: number;
  currency: string;
}

export interface BillingPayment {
  id: string;
  planId: string;
  planName: string;
  billingInterval: BillingInterval;
  amount: number;
  currency: string;
  status: string;
  provider: string;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface BillingOverview {
  pricing: {
    currency: string;
    currencySymbol: string;
    yearlySavingsLabel: string;
  };
  plans: BillingPlanView[];
  subscription: BillingSubscription | null;
  currentPlanId: string;
  currentInterval: BillingInterval | null;
  entitlements: BillingPlanLimits;
  paymentsConfigured: boolean;
  paymentProvider: "razorpay" | "mock" | "disabled";
  payments: BillingPayment[];
}

export interface BillingCheckout {
  transactionId: string;
  provider: "razorpay" | "mock";
  orderId: string;
  keyId: string | null;
  checkoutUrl: string | null;
  amount: number;
  currency: string;
  planId: string;
  interval: BillingInterval;
  receipt: string;
  prefill?: { email?: string; name?: string };
}

export interface BillingCheckoutSession {
  transactionId: string;
  provider: string;
  orderId: string | null;
  keyId: string | null;
  checkoutUrl: string | null;
  amount: number;
  currency: string;
  planId: string;
  planName: string;
  interval: BillingInterval;
  status: string;
  receipt: string | null;
  createdAt: string;
  paidAt: string | null;
  prefill?: { email?: string; name?: string };
}

export const billingApi = {
  overview: () => req<BillingOverview>("/api/billing"),
  plans: () =>
    req<{
      pricing: BillingOverview["pricing"];
      plans: BillingPlanView[];
      paymentProvider: BillingOverview["paymentProvider"];
    }>("/api/billing/plans"),
  payments: () => req<{ payments: BillingPayment[] }>("/api/billing/payments"),
  checkout: (body: { planId: "pro" | "premium"; interval: BillingInterval }) =>
    req<{ checkout: BillingCheckout }>("/api/billing/checkout", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  checkoutSession: (transactionId: string) =>
    req<{ checkout: BillingCheckoutSession }>(
      `/api/billing/checkout/${encodeURIComponent(transactionId)}`,
    ),
  changePlan: (body: { planId: "pro" | "premium"; interval: BillingInterval }) =>
    req<{ checkout: BillingCheckout; note?: string }>("/api/billing/change-plan", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  confirmMock: (transactionId: string) =>
    req<BillingOverview>("/api/billing/mock/confirm", {
      method: "POST",
      body: JSON.stringify({ transactionId }),
    }),
  cancel: () => req<{ subscription: BillingSubscription }>("/api/billing/cancel", { method: "POST" }),
  resume: () => req<{ subscription: BillingSubscription }>("/api/billing/resume", { method: "POST" }),
};

export interface AnalyticsOverview {
  applications: {
    total: number;
    byStatus: Record<string, number>;
    applied: number;
    recruiterResponse: number;
    assessment: number;
    interview: number;
    offer: number;
    rejected: number;
  };
  events: {
    total: number;
    funnel: { recruiterResponse: number; assessment: number; interview: number; offer: number };
  };
  rates: { responseRate: number; interviewRate: number; offerRate: number };
  matches: {
    total: number;
    byDecision: Record<string, number>;
    averageScore: number | null;
    byMode: Record<string, number>;
  };
  jobs: { total: number; bySource: Record<string, number> };
  activity: { applicationsLast7Days: number; applicationsLast30Days: number; matchesLast30Days: number };
  discovery: {
    configured: boolean;
    enabled: boolean;
    sources: string[];
    scheduled: boolean;
    lastRunAt: string | null;
    lastStatus: string | null;
    lastSummary: unknown;
  };
}

export const analyticsApi = {
  get: () => req<{ analytics: AnalyticsOverview }>("/api/analytics"),
};

export const api = {
  stats: () => req<DashboardStats>("/api/dashboard/stats"),
  jobs: () => req<{ jobs: Job[] }>("/api/jobs"),
  job: (id: string) => req<{ job: Job }>(`/api/jobs/${id}`),
  matchForJob: (jobId: string) =>
    req<{ match: (JobMatch & { id?: string }) | null }>(`/api/jobs/${jobId}/match`),
  createJob: (body: { title: string; company: string; description: string; location?: string }) =>
    req<{ job: Job }>("/api/jobs", { method: "POST", body: JSON.stringify(body) }),
  jobSources: () => req<{ sources: JobSource[] }>("/api/jobs/sources"),
  ingestJobs: (body: { source: string; query?: string; location?: string; remote?: boolean; limit?: number }) =>
    req<{ ingestion: IngestionResult }>("/api/jobs/ingest", { method: "POST", body: JSON.stringify(body) }),
  matchJob: (jobId: string) =>
    req<{ match: JobMatch }>(`/api/jobs/${jobId}/match`, { method: "POST" }),
  runMatches: (limit = 20) =>
    req<{ matched: number; matches: JobMatch[] }>("/api/matches/run", { method: "POST", body: JSON.stringify({ limit }) }),
  matches: (query = "") => req<{ matches: (JobMatch & { job?: Job })[] }>(`/api/matches${query}`),
  applications: () => req<{ applications: ApplicationSummary[] }>("/api/applications"),
  application: (id: string) =>
    req<{ application: ApplicationDetail }>(`/api/applications/${id}`),
  createApplication: (body: { jobId: string; resumeId?: string | null }) =>
    req<{ application: ApplicationDetail }>(`/api/applications`, { method: "POST", body: JSON.stringify(body) }),
  updateApplication: (id: string, body: { resumeId?: string | null }) =>
    req<{ application: ApplicationDetail }>(`/api/applications/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  health: () => req<{ status: string }>("/api/health"),
};

export interface IntegrationInfo {
  provider: string;
  configured: boolean;
  connected: boolean;
  status: string;
  accountEmail?: string | null;
  scopes: string[];
  connectedAt?: string | null;
  lastSyncedAt?: string | null;
  lastSyncError?: string | null;
}

export interface GmailSyncResult {
  synced: number;
  matched: number;
  needsReview: number;
  eventsCreated: number;
  notificationsCreated: number;
  status: string;
  errors: string[];
}

export interface InboxEmail {
  id: string;
  providerMessageId: string;
  threadId?: string | null;
  fromEmail: string;
  fromName?: string | null;
  subject: string;
  snippet: string;
  receivedAt: string;
  classification: string;
  classificationScore: number;
  classificationReasons: string[];
  applicationId?: string | null;
  matchStatus: string;
  matchReason?: string | null;
  emailEventCreated: boolean;
}

export interface ApplicationSummary {
  id: string;
  jobId: string;
  status: string;
  updatedAt?: string;
  job?: { id: string; title: string; companyName: string; location?: string | null; remote?: boolean } | null;
}

export interface ApplicationDetail {
  id: string;
  jobId: string;
  status: string;
  resumeId?: string | null;
  resume?: { id: string; name: string; isActive: boolean } | null;
  mode?: string;
  job?: { id: string; title: string; companyName: string } | null;
  events: { id: string; oldStatus?: string | null; newStatus: string; source: string; note?: string | null; createdAt: string }[];
  emails?: { id: string; fromEmail: string; fromName?: string | null; subject: string; receivedAt: string; classification: string; matchStatus: string }[];
}

export const integrationsApi = {
  list: () => req<{ integrations: IntegrationInfo[] }>("/api/integrations"),
  gmail: () => req<{ integration: IntegrationInfo }>("/api/integrations/gmail"),
  connectUrl: () => req<{ configured: boolean; url?: string; message?: string }>("/api/integrations/gmail/connect"),
  sync: (maxMessages = 25) =>
    req<{ sync: GmailSyncResult }>("/api/integrations/gmail/sync", { method: "POST", body: JSON.stringify({ maxMessages }) }),
  disconnect: () => req<{ integration: IntegrationInfo }>("/api/integrations/gmail/disconnect", { method: "POST" }),
};

export const inboxApi = {
  list: (query = "") => req<{ emails: InboxEmail[] }>(`/api/inbox${query}`),
  get: (id: string) =>
    req<{ email: InboxEmail & { bodyText?: string; application?: { id: string; status: string; job?: { id: string; title: string; companyName: string } | null } | null }; events: { id: string; newStatus: string; source: string; note?: string | null; createdAt: string }[] }>(`/api/inbox/${id}`),
};

export interface RunAnswer {
  fieldId: string;
  label: string;
  fieldType: string;
  required: boolean;
  mapping: string;
  proposedValue: string;
  source: string;
  status: string;
}

export interface ApplicationRun {
  id: string;
  applicationId: string;
  jobId: string;
  adapter: string;
  status: string;
  currentStep: string;
  targetUrl?: string | null;
  currentUrl?: string | null;
  currentTitle?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  fields: { fieldId: string; label: string; type: string; required: boolean; mapping: string }[];
  answers: RunAnswer[];
  filledFields: string[];
  warnings: string[];
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  capabilities: string[];
  submissionMode: string;
  sessionStatus?: string | null;
  sessionMode?: string | null;
  retryCount: number;
  resumedFromRunId?: string | null;
  recoveryReason?: string | null;
  submissionConfirmedAt?: string | null;
  lastSafeCheckpoint?: string | null;
}

export interface AdapterDescriptor {
  adapterId: string;
  displayName: string;
  submissionMode: string;
  capabilities: string[];
  manualLogin: boolean;
}

export interface DraftFact {
  id: string;
  sourceType: string;
  sourceId: string;
  field: string;
  value: string;
}

export interface DraftAnswerView {
  question: string;
  answer: string;
  status: "ANSWERED" | "NEEDS_USER_INPUT";
  usedFactIds: string[];
  warnings: string[];
}

export interface PersonalizationDraft {
  id: string;
  applicationId: string;
  jobId?: string | null;
  jobTitle: string;
  jobCompany: string;
  type: string;
  status: "DRAFT" | "REVIEW_REQUIRED" | "APPROVED" | "REJECTED";
  content: {
    summary?: { text: string; usedFactIds: string[]; warnings: string[] } | null;
    coverLetter?: { text: string; usedFactIds: string[]; warnings: string[] } | null;
    answers: DraftAnswerView[];
    selectedProjects: { projectId: string; name: string; rationale: string; matchedSkills: string[] }[];
    warnings: string[];
  };
  factInventory: DraftFact[];
  provider: string;
  model?: string | null;
  promptVersion: string;
  userEdited: boolean;
  createdAt: string;
  updatedAt: string;
}

export const personalizationApi = {
  status: (applicationId: string) =>
    req<{ status: { configured: boolean; provider: string | null } }>(
      `/api/applications/${applicationId}/personalization/status`,
    ),
  generate: (applicationId: string, body: { resumeId?: string | null; includeSummary?: boolean; includeCoverLetter?: boolean; questions?: string[] }) =>
    req<{ draft: PersonalizationDraft }>(`/api/applications/${applicationId}/personalization/generate`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  drafts: (applicationId: string) =>
    req<{ drafts: PersonalizationDraft[] }>(`/api/applications/${applicationId}/personalization/drafts`),
  approved: (applicationId: string) =>
    req<{ draft: PersonalizationDraft | null }>(`/api/applications/${applicationId}/personalization/approved`),
  get: (applicationId: string, draftId: string) =>
    req<{ draft: PersonalizationDraft }>(`/api/applications/${applicationId}/personalization/drafts/${draftId}`),
  edit: (applicationId: string, draftId: string, body: { summaryText?: string | null; coverLetterText?: string | null; answers?: { question: string; answer: string }[] }) =>
    req<{ draft: PersonalizationDraft }>(`/api/applications/${applicationId}/personalization/drafts/${draftId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  approve: (applicationId: string, draftId: string) =>
    req<{ draft: PersonalizationDraft }>(`/api/applications/${applicationId}/personalization/drafts/${draftId}/approve`, {
      method: "POST",
    }),
  reject: (applicationId: string, draftId: string) =>
    req<{ draft: PersonalizationDraft }>(`/api/applications/${applicationId}/personalization/drafts/${draftId}/reject`, {
      method: "POST",
    }),
};

export const runsApi = {
  list: (applicationId: string) =>
    req<{ runs: ApplicationRun[] }>(`/api/applications/${applicationId}/runs`),
  create: (applicationId: string, body: { adapter: string; targetUrl?: string }) =>
    req<{ run: ApplicationRun }>(`/api/applications/${applicationId}/runs`, { method: "POST", body: JSON.stringify(body) }),
  get: (runId: string) => req<{ run: ApplicationRun }>(`/api/application-runs/${runId}`),
  start: (runId: string) => req<{ run: ApplicationRun }>(`/api/application-runs/${runId}/start`, { method: "POST" }),
  approve: (runId: string, answers: { fieldId: string; value?: string; rejected?: boolean }[]) =>
    req<{ run: ApplicationRun }>(`/api/application-runs/${runId}/approve`, { method: "POST", body: JSON.stringify({ answers }) }),
  fill: (runId: string) => req<{ run: ApplicationRun }>(`/api/application-runs/${runId}/fill`, { method: "POST" }),
  submit: (runId: string) =>
    req<{ run: ApplicationRun }>(`/api/application-runs/${runId}/submit`, { method: "POST", body: JSON.stringify({ confirm: true }) }),
  cancel: (runId: string) => req<{ run: ApplicationRun }>(`/api/application-runs/${runId}/cancel`, { method: "POST" }),
  resume: (runId: string) => req<{ run: ApplicationRun }>(`/api/application-runs/${runId}/resume`, { method: "POST", body: JSON.stringify({}) }),
  recover: (runId: string, reason: string) =>
    req<{ run: ApplicationRun }>(`/api/application-runs/${runId}/recover`, { method: "POST", body: JSON.stringify({ reason }) }),
  resolve: (runId: string, outcome: "submitted" | "not-submitted") =>
    req<{ run: ApplicationRun }>(`/api/application-runs/${runId}/resolve`, { method: "POST", body: JSON.stringify({ outcome }) }),
  adapters: () => req<{ adapters: AdapterDescriptor[] }>("/api/application-runs/adapters"),
};
