import type { Context } from "grammy";
import { GrammyError } from "grammy";
import type { SessionRegistry } from "../../session/registry.js";
import type { StreamingStateManager } from "../../opencode/streaming-state.js";
import { checkHealth } from "../../opencode/health.js";
import { resolveDisplayModel } from "../../opencode/display-model.js";
import { logger } from "../../logger.js";

const MAX_RETRY_WAIT_MS = 30_000;

async function replyWithRetry(ctx: Context, text: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await ctx.reply(text);
      return;
    } catch (err) {
      if (
        err instanceof GrammyError &&
        err.error_code === 429 &&
        attempt < 2
      ) {
        const retryAfterMs = ((err.parameters.retry_after as number | undefined) ?? 5) * 1000;
        const waitMs = Math.min(retryAfterMs, MAX_RETRY_WAIT_MS);
        logger.warn({ retryAfterMs: waitMs, attempt }, "Rate-limited by Telegram on /status — retrying");
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }
      throw err;
    }
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

    await replyWithRetry(ctx, `Session: ${sessionName} | OpenCode: ${healthStr} | Model: ${modelStr} | State: ${stateStr}`);
    logger.info({ chatId, sessionName, healthStr }, "Status command executed");
  };
}
