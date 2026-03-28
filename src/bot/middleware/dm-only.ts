import type { Context, NextFunction } from "grammy";

export async function dmOnlyMiddleware(ctx: Context, next: NextFunction): Promise<void> {
  const chatType = ctx.chat?.type ?? ctx.callbackQuery?.message?.chat?.type;

  if (chatType !== "private") {
    return;
  }

  await next();
}
