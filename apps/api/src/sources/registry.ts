import { HttpError } from "../services/errors.js";
import type { JobSourceAdapter, JobSourceInfo } from "./types.js";

/**
 * Registry of available job sources.
 * Ingestion resolves adapters via getSource(id) — no source-specific
 * logic may live in routes or the ingestion service.
 */
const sources = new Map<string, JobSourceAdapter>();

export function registerSource(adapter: JobSourceAdapter): void {
  sources.set(adapter.id, adapter);
}

export function getSource(id: string): JobSourceAdapter {
  const adapter = sources.get(id);
  if (!adapter) {
    throw new HttpError(
      404,
      `Unknown job source: "${id}". Use GET /api/jobs/sources for available sources.`,
    );
  }
  return adapter;
}

export function listSourceInfos(): JobSourceInfo[] {
  return [...sources.values()].map((s) => s.info());
}

/** Test-only escape hatch: restores the registry after test doubles. */
export function __clearSourcesForTests(): void {
  sources.clear();
}
