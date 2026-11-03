import type { JobSearchParamsInput,
  JobSourceInfo,
  RawJob,
} from "@jobcopilot/shared";
import type { JobSourceAdapter } from "../types.js";

/**
 * Demo/mock adapter — NOT a real production source.
 * Deterministic offline fixture implementing the exact same
 * JobSourceAdapter interface. Used by automated tests and local
 * development when the network is unavailable. The real source
 * remains "arbeitnow"; this adapter is never presented as real.
 */
const FIXTURES: RawJob[] = [
  {
    externalId: "demo-001",
    source: "demo",
    title: "  Backend Engineer ",
    company: "  Acme Corp ",
    companyUrl: null,
    jobUrl: "https://example.com/jobs/demo-001?utm_source=demo#frag",
    location: " Berlin, Germany ",
    remote: false,
    employmentType: "Full-time",
    salaryMin: 80000,
    salaryMax: 110000,
    salaryCurrency: "EUR",
    description: "Build APIs for the demo board.",
    postedAt: "2026-09-01T00:00:00.000Z",
    metadata: { fixture: true },
  },
  {
    externalId: "demo-002",
    source: "demo",
    title: "Frontend Engineer",
    company: "Acme Corp",
    companyUrl: null,
    jobUrl: "https://example.com/jobs/demo-002",
    location: "Remote",
    remote: true,
    employmentType: "Full-time",
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    description: "Build UI for the demo board.",
    postedAt: "2026-09-02T00:00:00.000Z",
    metadata: { fixture: true },
  },
  {
    externalId: "demo-003",
    source: "demo",
    title: "DevOps Engineer",
    company: "Globex",
    companyUrl: null,
    jobUrl: "https://example.com/jobs/demo-003",
    location: "Remote",
    remote: true,
    employmentType: "Contract",
    salaryMin: 90,
    salaryMax: 120,
    salaryCurrency: "USD",
    description: "Run infrastructure for the demo board.",
    postedAt: "2026-09-03T00:00:00.000Z",
    metadata: { fixture: true },
  },
  {
    // Intentionally malformed: empty title/description → must be rejected
    // by validation without stopping the ingestion run.
    externalId: "demo-bad-001",
    source: "demo",
    title: "",
    company: "Broken Inc",
    companyUrl: null,
    jobUrl: null,
    location: null,
    remote: null,
    employmentType: null,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    description: "",
    postedAt: null,
    metadata: { fixture: true },
  },
];

export class DemoAdapter implements JobSourceAdapter {
  readonly id = "demo";
  readonly name = "Demo fixtures (mock — not a real source)";
  readonly mock = true;

  /** When true, search() throws to exercise adapter-failure handling. */
  failNext = false;

  info(): JobSourceInfo {
    return {
      id: this.id,
      name: this.name,
      available: true,
      mock: true,
      capabilities: {
        query: true,
        location: true,
        remote: true,
        employmentType: true,
        pagination: false,
        signals: false,
      },
      limits: {
        timeoutMs: 5000,
        maxRequestsPerRun: 1,
        maxResults: 50,
      },
    };
  }

  async search(params: JobSearchParamsInput): Promise<RawJob[]> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("Demo adapter simulated failure");
    }
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 50);
    const q = (params.query ?? "").toLowerCase().trim();
    const loc = (params.location ?? "").toLowerCase().trim();
    const emp = (params.employmentType ?? "").toLowerCase().trim();
    return FIXTURES.filter((j) => {
      if (q && !`${j.title} ${j.company} ${j.description}`.toLowerCase().includes(q)) {
        return false;
      }
      if (loc && !(j.location ?? "").toLowerCase().includes(loc)) return false;
      if (params.remote === true && j.remote !== true) return false;
      if (params.remote === false && j.remote === true) return false;
      if (emp && !(j.employmentType ?? "").toLowerCase().includes(emp)) return false;
      return true;
    }).slice(0, limit);
  }
}
