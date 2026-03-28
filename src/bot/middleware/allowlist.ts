import type { Context, NextFunction } from "grammy";
import { logger } from "../../logger.js";

const REJECTION_MESSAGE = "You don't have access to this bot";

export function allowlistMiddleware(allowed: Set<number>) {
  return async (ctx: Context, next: NextFunction): Promise<void> => {
    const uid = ctx.from?.id;

    if (uid === undefined || !allowed.has(uid)) {
      logger.warn({ uid }, "Blocked update from unlisted or anonymous user");

      if (ctx.callbackQuery) {
        await ctx.answerCallbackQuery({ text: REJECTION_MESSAGE, show_alert: true });
        return;
      }

      await ctx.reply(REJECTION_MESSAGE);
      return;
    }

    await next();
  };
}
