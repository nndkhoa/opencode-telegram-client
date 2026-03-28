import type { Context } from "grammy";
import type { SessionRegistry } from "../../session/registry.js";
import type { StreamingStateManager } from "../../opencode/streaming-state.js";
import { checkHealth } from "../../opencode/health.js";
import { logger } from "../../logger.js";

async function fetchActiveModel(baseUrl: string, sessionId: string): Promise<string> {
  try {
    const res = await fetch(new URL(`/session/${sessionId}/message?limit=10`, baseUrl).toString());
    if (!res.ok) return "unknown";
    const msgs = (await res.json()) as Array<{
      info: { role: string; model?: { providerID: string; modelID: string } };
    }>;
    const withModel = msgs.find(m => m.info.role === "user" && m.info.model);
    return withModel?.info.model?.modelID ?? "unknown";
  } catch {
    return "unknown";
  }
}

export function makeCmdStatusHandler(
  registry: SessionRegistry,
  manager: StreamingStateManager,
  openCodeUrl: string
) {
  return async (ctx: Context): Promise<void> => {
    const chatId = ctx.chat!.id;
    const sessionName = registry.getActiveName(chatId);
    const sessionId = registry.getActiveSessionId(chatId);
    const isActive = manager.isBusy(chatId);

    let healthStr: string;
    let modelStr: string;
    let stateStr: string;

    try {
      const health = await checkHealth(openCodeUrl);
      const model = sessionId ? await fetchActiveModel(openCodeUrl, sessionId) : "unknown";
      healthStr = health.healthy ? "✅ healthy" : "⚠️ unhealthy";
      modelStr = model;
      stateStr = isActive ? "active" : "idle";
    } catch {
      healthStr = "❌ unreachable";
      modelStr = "unknown";
      stateStr = "unknown";
    }

    await ctx.reply(`Session: ${sessionName} | OpenCode: ${healthStr} | Model: ${modelStr} | State: ${stateStr}`);
    logger.info({ chatId, sessionName, healthStr }, "Status command executed");
  };
}
