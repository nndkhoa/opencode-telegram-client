import { extractConfiguredModel, getConfig } from "./config.js";
import { logger } from "../logger.js";
import { getPersistedModelRef } from "../persist/last-model.js";

export type ResolveDisplayModelResult = { kind: "resolved"; ref: string } | { kind: "unset" };

function refFromAssistantMessage(info: {
  role: string;
  modelID?: string;
  providerID?: string;
}): string | undefined {
  if (info.role !== "assistant" || !info.modelID) return undefined;
  const { providerID, modelID } = info;
  return providerID ? `${providerID}/${modelID}` : modelID;
}

/**
 * Resolves which model ref to show: Telegram-persisted `/model` choice, then GET /config,
 * then recent session messages (D-01).
 */
export async function resolveDisplayModel(
  baseUrl: string,
  sessionId: string | undefined
): Promise<ResolveDisplayModelResult> {
  const persisted = getPersistedModelRef();
  if (persisted) {
    return { kind: "resolved", ref: persisted };
  }

  try {
    const cfg = await getConfig(baseUrl);
    const fromConfig = extractConfiguredModel(cfg);
    if (typeof fromConfig === "string" && fromConfig.trim()) {
      return { kind: "resolved", ref: fromConfig.trim() };
    }
  } catch (err) {
    logger.warn({ err }, "config leg failed — continuing to session messages if available");
  }

  if (sessionId === undefined || sessionId === "") {
    return { kind: "unset" };
  }

  try {
    const res = await fetch(new URL(`/session/${sessionId}/message?limit=10`, baseUrl).toString());
    if (!res.ok) return { kind: "unset" };
    const msgs = (await res.json()) as Array<{
      info: { role: string; modelID?: string; providerID?: string };
    }>;
    const assistant = msgs.find((m) => refFromAssistantMessage(m.info) !== undefined);
    const ref = assistant ? refFromAssistantMessage(assistant.info) : undefined;
    if (ref) return { kind: "resolved", ref };
  } catch {
    // treat as unset
  }

  return { kind: "unset" };
}
