import { resolveDisplayModel } from "./display-model.js";

export type AssistantFooterInfo = {
  modelRef: string;
  /** Primary agent (e.g. build, plan); falls back to `mode` when agent is empty */
  agentLabel: string;
};

export type LastAssistantMessage = {
  id: string;
  text: string;
  footerInfo: AssistantFooterInfo;
};

/** API shape for a single message item from GET /session/{id}/message */
type SessionMessageItem = {
  info: {
    id?: string;
    role: string;
    modelID?: string;
    providerID?: string;
    agent?: string;
    mode?: string;
  };
  /** parts is at top-level, NOT inside info */
  parts?: Array<{ type: string; text?: string; [key: string]: unknown }>;
};

function extractTextFromMessageParts(
  parts: Array<{ type: string; text?: string; [key: string]: unknown }> | undefined
): string {
  return (parts ?? [])
    .filter((p) => p.type === "text" && typeof p.text === "string" && p.text.trim() !== "")
    .map((p) => p.text as string)
    .join("\n\n");
}

/**
 * Fetches all messages for a session via HTTP.
 * Returns parsed items or null on error.
 */
async function fetchSessionMessages(
  baseUrl: string,
  sessionId: string
): Promise<SessionMessageItem[] | null> {
  try {
    const res = await fetch(new URL(`/session/${sessionId}/message?limit=40`, baseUrl).toString());
    if (!res.ok) return null;
    return (await res.json()) as SessionMessageItem[];
  } catch {
    return null;
  }
}

/**
 * Fetches text content of a specific message by ID from the session message list.
 * Used for out-of-band user message forwarding — SSE message.updated never includes parts.
 */
export async function fetchMessageTextById(
  baseUrl: string,
  sessionId: string,
  messageId: string
): Promise<string | null> {
  const msgs = await fetchSessionMessages(baseUrl, sessionId);
  if (!msgs) return null;
  for (const { info, parts } of msgs) {
    if (info.id !== messageId) continue;
    const text = extractTextFromMessageParts(parts);
    return text.trim() ? text : null;
  }
  return null;
}

/**
 * Fetches the last assistant message from a session via HTTP.
 * Used for out-of-band delivery when a message was created from webUI (no active Telegram turn).
 */
export async function fetchLastAssistantMessage(
  baseUrl: string,
  sessionId: string
): Promise<LastAssistantMessage | null> {
  const msgs = await fetchSessionMessages(baseUrl, sessionId);
  if (!msgs) return null;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const { info, parts } = msgs[i]!;
    if (info.role !== "assistant") continue;
    if (!info.id) continue;

    const text = extractTextFromMessageParts(parts);
    if (!text.trim()) continue;

    const modelRef =
      info.providerID && info.modelID
        ? `${info.providerID}/${info.modelID}`
        : (info.modelID ?? "—");
    const rawAgent = typeof info.agent === "string" ? info.agent.trim() : "";
    const rawMode = typeof info.mode === "string" ? info.mode.trim() : "";
    const agentLabel = rawAgent || rawMode || "—";

    return { id: info.id, text, footerInfo: { modelRef, agentLabel } };
  }
  return null;
}

/**
 * Reads the latest assistant message from OpenCode so we can show actual model + agent
 * for the completed turn (matches OpenCode SDK `AssistantMessage`: agent, mode, provider/model).
 */
export async function fetchLastAssistantFooterInfo(
  baseUrl: string,
  sessionId: string
): Promise<AssistantFooterInfo | null> {
  try {
    const res = await fetch(new URL(`/session/${sessionId}/message?limit=40`, baseUrl).toString());
    if (!res.ok) return null;
    const msgs = (await res.json()) as Array<{
      info: {
        role: string;
        modelID?: string;
        providerID?: string;
        agent?: string;
        mode?: string;
      };
    }>;
    for (let i = msgs.length - 1; i >= 0; i--) {
      const info = msgs[i]!.info;
      if (info.role !== "assistant") continue;
      const modelRef =
        info.providerID && info.modelID
          ? `${info.providerID}/${info.modelID}`
          : (info.modelID ?? "—");
      const rawAgent = typeof info.agent === "string" ? info.agent.trim() : "";
      const rawMode = typeof info.mode === "string" ? info.mode.trim() : "";
      const agentLabel = rawAgent || rawMode || "—";
      return { modelRef, agentLabel };
    }
  } catch {
    return null;
  }
  return null;
}

export async function resolveAssistantFooterLines(
  baseUrl: string,
  sessionId: string
): Promise<AssistantFooterInfo> {
  const fromApi = await fetchLastAssistantFooterInfo(baseUrl, sessionId);
  if (fromApi) return fromApi;
  const r = await resolveDisplayModel(baseUrl, sessionId);
  return {
    modelRef: r.kind === "resolved" ? r.ref : "—",
    agentLabel: "—",
  };
}

export function formatAssistantFooterHtml(modelRef: string, agentLabel: string): string {
  const m = escapeMini(modelRef);
  const a = escapeMini(agentLabel);
  return `<em>${m} · ${a}</em>`;
}

function escapeMini(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
