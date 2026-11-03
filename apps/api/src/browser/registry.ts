import { badRequest } from "../services/errors.js";
import type { BrowserProvider, BrowserProviderId } from "./types.js";
import type { ApplicationAdapter } from "./adapters/types.js";

/**
 * Phase 7 — closed registries. Unknown provider/adapter ids are rejected;
 * nothing here executes arbitrary names.
 */

const browserProviders = new Map<BrowserProviderId, BrowserProvider>();

export function registerBrowserProvider(provider: BrowserProvider): void {
  browserProviders.set(provider.id, provider);
}

export function getBrowserProvider(id: string): BrowserProvider {
  const provider = browserProviders.get(id as BrowserProviderId);
  if (!provider) throw badRequest(`Unknown browser provider: "${id}"`);
  return provider;
}

const applicationAdapters = new Map<string, ApplicationAdapter>();

export function registerApplicationAdapter(adapter: ApplicationAdapter): void {
  applicationAdapters.set(adapter.id, adapter);
}

export function getApplicationAdapter(id: string): ApplicationAdapter {
  const adapter = applicationAdapters.get(id);
  if (!adapter) throw badRequest(`Unknown application adapter: "${id}"`);
  return adapter;
}

export function listApplicationAdapters(): ApplicationAdapter[] {
  return [...applicationAdapters.values()];
}
