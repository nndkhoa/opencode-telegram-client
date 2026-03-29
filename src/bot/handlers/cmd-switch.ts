import type { Context } from "grammy";
import type { SessionRegistry } from "../../session/registry.js";
import type { PendingInteractiveState } from "../../opencode/interactive-pending.js";
import { logger } from "../../logger.js";

export function makeCmdSwitchHandler(
  registry: SessionRegistry,
  pending: PendingInteractiveState
) {
  return async (ctx: Context): Promise<void> => {
    const chatId = ctx.chat!.id;
    const rawArg = (ctx.match as string | undefined)?.trim() ?? "";

    if (!rawArg) {
      await ctx.reply("❌ Usage: /switch <name>");
      return;
    }

    const name = rawArg.toLowerCase();
    const switched = registry.switchTo(chatId, name);

    if (switched) {
      pending.clear(chatId);
      const activeId = registry.getActiveSessionId(chatId);
      if (activeId) pending.rememberSessionChat(activeId, chatId);
      logger.info({ chatId, name }, "Switched session");
      await ctx.reply("─────────────────────");
      await ctx.reply(`✅ Switched to session "${name}".`);
    } else {
      await ctx.reply(`❌ Session "${name}" not found. Use /sessions to see available sessions.`);
    }
  };
}
