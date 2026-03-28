import type { Context } from "grammy";
import type { SessionRegistry } from "../../session/registry.js";
import type { StreamingStateManager } from "../../opencode/streaming-state.js";
import { checkHealth } from "../../opencode/health.js";
import { resolveDisplayModel } from "../../opencode/display-model.js";
import { logger } from "../../logger.js";

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
      const resolved = await resolveDisplayModel(openCodeUrl, sessionId);
      if (resolved.kind === "resolved") {
        modelStr = resolved.ref;
      } else {
        modelStr = "not set — /model";
      }
      healthStr = health.healthy ? "✅ healthy" : "⚠️ unhealthy";
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
