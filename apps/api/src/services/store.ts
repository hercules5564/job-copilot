/** In-memory stub store so the MVP dashboard works before Postgres is running.
 *  Phase 2 replaces reads/writes with Prisma. Shape mirrors the Prisma models.
 */
export interface StoredJob {
  id: string;
  title: string;
  company: string;
  location?: string | null;
  remote: boolean;
  description: string;
  sourceUrl?: string | null;
  createdAt: string;
}

export interface StoredApplication {
  id: string;
  jobId: string;
  status: string;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
}

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

const jobs: StoredJob[] = [
  {
    id: "job_seed_1",
    title: "Full Stack Engineer",
    company: "Example Corp",
    location: "Remote",
    remote: true,
    description: "Seed job so the dashboard is not empty. Add real jobs in Phase 2.",
    sourceUrl: null,
    createdAt: new Date().toISOString(),
  },
];

const applications: StoredApplication[] = [];

export const store = {
  listJobs(): StoredJob[] {
    return [...jobs].reverse();
  },
  createJob(input: Omit<StoredJob, "id" | "createdAt">): StoredJob {
    const job: StoredJob = { ...input, id: uid("job"), createdAt: new Date().toISOString() };
    jobs.push(job);
    return job;
  },
  listApplications(): StoredApplication[] {
    return [...applications].reverse();
  },
  createApplication(jobId: string): StoredApplication {
    const now = new Date().toISOString();
    const app: StoredApplication = {
      id: uid("app"),
      jobId,
      status: "DISCOVERED",
      createdAt: now,
      updatedAt: now,
    };
    applications.push(app);
    return app;
  },
  transitionApplication(id: string, toStatus: string, note?: string | null): StoredApplication | null {
    const app = applications.find((a) => a.id === id);
    if (!app) return null;
    app.status = toStatus;
    app.note = note ?? app.note;
    app.updatedAt = new Date().toISOString();
    return app;
  },
  reset(): void {
    jobs.length = 0;
    applications.length = 0;
  },
};
