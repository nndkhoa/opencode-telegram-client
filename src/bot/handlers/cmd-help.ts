import type { Context } from "grammy";

const HELP_TEXT = `Available commands:
/new <name> — Create and switch to a named session
/switch <name> — Switch to an existing named session
/sessions — List all sessions for this chat
/status — Show active session and OpenCode health
/cancel — Abort the current in-progress request
/help — Show this help message`;

export function makeCmdHelpHandler() {
  return async (ctx: Context): Promise<void> => {
    await ctx.reply(HELP_TEXT);
  };
}
