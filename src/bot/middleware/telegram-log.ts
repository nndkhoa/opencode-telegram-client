import type { Context, NextFunction } from "grammy";
import type { Update } from "grammy/types";
import { logger } from "../../logger.js";

function getUpdateType(update: Update): string {
  if (update.message) return "message";
  if (update.edited_message) return "edited_message";
  if (update.callback_query) return "callback_query";
  if (update.channel_post) return "channel_post";
  if (update.edited_channel_post) return "edited_channel_post";
  if (update.inline_query) return "inline_query";
  if (update.chosen_inline_result) return "chosen_inline_result";
  if (update.shipping_query) return "shipping_query";
  if (update.pre_checkout_query) return "pre_checkout_query";
  if (update.poll) return "poll";
  if (update.poll_answer) return "poll_answer";
  if (update.my_chat_member) return "my_chat_member";
  if (update.chat_member) return "chat_member";
  if (update.chat_join_request) return "chat_join_request";
  return "unknown";
}

function getMessageId(update: Update): number | undefined {
  if (update.message) return update.message.message_id;
  if (update.edited_message) return update.edited_message.message_id;
  if (update.channel_post) return update.channel_post.message_id;
  if (update.edited_channel_post) return update.edited_channel_post.message_id;
  if (update.callback_query?.message && "message_id" in update.callback_query.message) {
    return update.callback_query.message.message_id;
  }
  return undefined;
}

function getTimestampIso(update: Update): string {
  const raw =
    update.message?.date ??
    update.edited_message?.date ??
    update.channel_post?.date ??
    update.edited_channel_post?.date;
  if (update.callback_query?.message && "date" in update.callback_query.message) {
    const d = (update.callback_query.message as { date?: number }).date;
    if (d !== undefined) return new Date(d * 1000).toISOString();
  }
  if (raw !== undefined) return new Date(raw * 1000).toISOString();
  return new Date().toISOString();
}

/** LOG-01: incoming Telegram metadata at info (no message text). Runs after allowlist. */
export function telegramLogMiddleware(ctx: Context, next: NextFunction): Promise<void> {
  const update = ctx.update;
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;
  const payload: Record<string, unknown> = {
    userId,
    chatId,
    updateType: getUpdateType(update),
    timestamp: getTimestampIso(update),
  };
  const mid = getMessageId(update);
  if (mid !== undefined) payload.messageId = mid;
  logger.info(payload, "telegram update");
  return next();
}
