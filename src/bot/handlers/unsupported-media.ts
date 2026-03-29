import type { Context } from "grammy";

/** D-03: short rejection for non-photo media; must include \"not supported\" for UX copy consistency. */
export const UNSUPPORTED_MEDIA_REPLY =
  "Sorry — that media type is not supported yet. Send a photo or plain text.";

export function makeUnsupportedMediaHandler() {
  return async (ctx: Context): Promise<void> => {
    await ctx.reply(UNSUPPORTED_MEDIA_REPLY);
  };
}
