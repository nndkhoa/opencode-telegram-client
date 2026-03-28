import type { Context } from "grammy";
import type { SessionRegistry } from "../../session/registry.js";
import { createSession } from "../../opencode/session.js";
import { logger } from "../../logger.js";

const NAME_REGEX = /^[a-z0-9][a-z0-9\-_]*$/;

export function makeCmdNewHandler(registry: SessionRegistry, openCodeUrl: string) {
  return async (ctx: Context): Promise<void> => {
    const chatId = ctx.chat!.id;
    const rawArg = (ctx.match as string | undefined)?.trim() ?? "";

    // D-05: no argument → timestamp-based name
    const name = rawArg.length > 0
      ? rawArg.toLowerCase()
      : `session-${Math.floor(Date.now() / 1000)}`;

    // D-03: validate name format (only if user provided explicit name)
    if (rawArg.length > 0 && !NAME_REGEX.test(name)) {
      await ctx.reply(`❌ Invalid session name "${name}". Use only lowercase letters, digits, hyphens, underscores.`);
      return;
    }

    // D-04: duplicate name check
    if (registry.hasNamed(chatId, name)) {
      await ctx.reply(`❌ Session "${name}" already exists. Use /switch ${name} to switch to it.`);
      return;
    }

    try {
      const sessionId = await createSession(openCodeUrl);
      registry.createNamed(chatId, name, sessionId);
      logger.info({ chatId, name, sessionId }, "Created named session");
      await ctx.reply("─────────────────────");
      await ctx.reply(`✅ Created and switched to session "${name}".`);
    } catch (err) {
      logger.error({ err, chatId }, "Failed to create named session");
      await ctx.reply("❌ OpenCode is unreachable. Make sure it's running at localhost:4096.");
    }
  };
}
