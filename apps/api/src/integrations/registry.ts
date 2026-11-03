import { badRequest } from "../services/errors.js";
import type { IntegrationProviderId } from "@jobcopilot/shared";
import type { IntegrationProvider } from "./types.js";

/** Closed registry — unknown provider ids are rejected, never executed. */
const providers = new Map<IntegrationProviderId, IntegrationProvider>();

export function registerIntegrationProvider(provider: IntegrationProvider): void {
  providers.set(provider.id, provider);
}

export function getIntegrationProvider(id: string): IntegrationProvider {
  const provider = providers.get(id as IntegrationProviderId);
  if (!provider) throw badRequest(`Unknown integration provider: "${id}"`);
  return provider;
}

export function listIntegrationProviders(): IntegrationProvider[] {
  return [...providers.values()];
}
