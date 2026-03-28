import type { ConfigProvidersPayload } from "./config.js";

/**
 * Builds a deterministic flat list of selectable `provider/model` refs for numbering and `/model <n>`.
 * Sort rules must stay in sync with `formatCatalogBlocks` in `src/bot/handlers/cmd-model.ts`.
 */
export function buildFlatSelectableModelRefs(payload: ConfigProvidersPayload): string[] {
  const sortedProviders = [...payload.providers].sort((a, b) =>
    (a.name || a.id).localeCompare(b.name || b.id, undefined, { sensitivity: "base" })
  );
  const refs: string[] = [];
  for (const provider of sortedProviders) {
    const models = provider.models ?? {};
    // Per-provider key order: UTF-16 code unit sort (must match catalog rendering).
    const ids = Object.keys(models).sort();
    for (const id of ids) {
      const fullRef = id.includes("/") ? id : `${provider.id}/${id}`;
      refs.push(fullRef);
    }
  }
  return refs;
}
