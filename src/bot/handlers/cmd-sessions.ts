import type { Context } from "grammy";
import type { SessionRegistry } from "../../session/registry.js";

export function makeCmdSessionsHandler(registry: SessionRegistry) {
  return async (ctx: Context): Promise<void> => {
    const chatId = ctx.chat!.id;
    const sessions = registry.list(chatId);

    if (sessions.length === 0) {
      await ctx.reply("No sessions yet. Use /new <name> to create a named session.");
      return;
    }

    const lines = sessions.map(s =>
      `• ${s.name}${s.active ? " (active)" : ""}`
    );

    // D-07: append usage hint if only the default session exists (no named sessions)
    const hasOnlyDefault = sessions.length === 1 && sessions[0].name === "default";
    const hint = hasOnlyDefault ? "\n\nUse /new <name> to create a named session." : "";

    await ctx.reply(`Sessions:\n${lines.join("\n")}${hint}`);
  };
}
