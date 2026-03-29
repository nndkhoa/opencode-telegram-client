import type { Context } from "grammy";
import type { SessionRegistry } from "../../session/registry.js";
import type { StreamingStateManager } from "../../opencode/streaming-state.js";
import type { PendingInteractiveState } from "../../opencode/interactive-pending.js";
import { abortSession } from "../../opencode/session.js";
import { logger } from "../../logger.js";

export function makeCmdCancelHandler(
  registry: SessionRegistry,
  manager: StreamingStateManager,
  openCodeUrl: string,
  pending: PendingInteractiveState
) {
  return async (ctx: Context): Promise<void> => {
    const chatId = ctx.chat!.id;

    // MCP-06: dismiss interactive prompt (e.g. awaiting free-text) when not streaming
    if (!manager.isBusy(chatId)) {
      if (pending.get(chatId)) {
        pending.clear(chatId);
        await ctx.reply("✅ Cancelled.");
        logger.info({ chatId }, "Cancel dismissed pending interactive");
      } else {
        await ctx.reply("ℹ️ Nothing in progress to cancel.");
      }
      return;
    }

    const sessionId = registry.getActiveSessionId(chatId);
    if (!sessionId) {
      pending.clear(chatId);
      await ctx.reply("ℹ️ Nothing in progress to cancel.");
      return;
    }

    // D-12: capture turn data FIRST (before endTurn clears it)
    const turn = manager.getTurn(sessionId);

    // Abort OpenCode session (non-fatal if fails)
    try {
      await abortSession(openCodeUrl, sessionId);
    } catch (err) {
      logger.warn({ err, sessionId }, "abortSession failed — continuing cancel cleanup");
    }

    // Clear turn state
    manager.endTurn(sessionId);

    // Edit original streaming message (use captured turn data)
    if (turn) {
      await ctx.api.editMessageText(turn.chatId, turn.messageId, "🚫 Cancelled.").catch(() => {});
    }

    pending.clear(chatId);
    await ctx.reply("✅ Cancelled.");
    logger.info({ chatId, sessionId }, "Cancel command executed");
  };
}
