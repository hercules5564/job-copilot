import { registerSource } from "./registry.js";
import { ArbeitnowAdapter } from "./adapters/arbeitnow.js";
import { DemoAdapter } from "./adapters/demo.js";
import { GreenhouseAdapter } from "./adapters/greenhouse.js";
import { LeverAdapter } from "./adapters/lever.js";
import { AshbyAdapter } from "./adapters/ashby.js";
import { RemoteOkAdapter } from "./adapters/remoteok.js";
import { AdzunaAdapter } from "./adapters/adzuna.js";
import { JoobleAdapter } from "./adapters/jooble.js";

export * from "./types.js";
export { getSource, listSourceInfos, registerSource } from "./registry.js";

/**
 * Default source set. Idempotent: re-registering replaces the entry.
 * - "arbeitnow": first permitted production source (public Job Board API).
 * - "greenhouse": second permitted source (public Job Board API, per-board
 *   tokens; verified live; board required per search — see DiscoveryConfig).
 * - "lever": third permitted source (public Postings API, per-board site
 *   tokens; verified live; board required per search).
 * - "ashby": fourth permitted source (public Job Board API, per-board
 *   slugs; verified live; board required per search).
 * - "remoteok": keyless public remote job board API.
 * - "adzuna": public job search API (needs ADZUNA_APP_ID/ADZUNA_APP_KEY).
 * - "jooble": public job search API (needs JOOBLE_API_KEY).
 * - "demo": deterministic mock fixtures (clearly marked mock, for tests
 *   and offline development — never a real source).
 */
export function registerDefaultSources(): void {
  registerSource(new ArbeitnowAdapter());
  registerSource(new GreenhouseAdapter());
  registerSource(new LeverAdapter());
  registerSource(new AshbyAdapter());
  registerSource(new RemoteOkAdapter());
  registerSource(new AdzunaAdapter());
  registerSource(new JoobleAdapter());
  registerSource(new DemoAdapter());
}
