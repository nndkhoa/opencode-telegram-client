import { resolveDisplayModel } from "./display-model.js";

export type AssistantFooterInfo = {
  modelRef: string;
  /** Primary agent (e.g. build, plan); falls back to `mode` when agent is empty */
  agentLabel: string;
};

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
  return `<i>${m} · ${a}</i>`;
}

function escapeMini(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
