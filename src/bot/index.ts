import { Bot } from "grammy";
import { config } from "../config/env.js";
import { logger } from "../logger.js";
import { dmOnlyMiddleware } from "./middleware/dm-only.js";
import { allowlistMiddleware } from "./middleware/allowlist.js";

export const bot = new Bot(config.botToken);

// Middleware order: DM gate → allowlist → feature handlers (per D-04)
bot.use(dmOnlyMiddleware);
bot.use(allowlistMiddleware(config.allowedUserIds));

// Phase 1 placeholder handler — removed in Phase 2 when real handlers are added
bot.on("message:text", async (ctx) => {
  logger.info(
    { userId: ctx.from?.id, chatId: ctx.chat?.id, text: ctx.message.text },
    "Message received (Phase 1 echo)"
  );
  await ctx.reply(`Echo (Phase 1): ${ctx.message.text}`);
});

bot.catch((err) => {
  logger.error({ err }, "Unhandled bot error");
});
