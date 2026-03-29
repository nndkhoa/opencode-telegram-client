import type { Context } from "grammy";
import { logger } from "../../logger.js";
import { postPermissionReply, postQuestionReply } from "../../opencode/replies.js";
import { PendingInteractiveState } from "../../opencode/interactive-pending.js";
import type { SessionRegistry } from "../../session/registry.js";
import {
  buildQuestionKeyboardForChat,
  QUESTION_OPTIONS_PAGE_SIZE,
} from "../../opencode/interactive-dispatch.js";

type AnswerOpts = { text?: string; show_alert?: boolean };

/** Remove the prompt message entirely (same idea as deletePriorPromptMessage on new prompts). */
async function deleteInteractivePromptMessage(
  api: Context["api"],
  chatId: number,
  messageId: number | undefined
): Promise<void> {
  if (messageId === undefined) return;
  await api.deleteMessage(chatId, messageId).catch(() => {});
}

/**
 * Inline keyboard callbacks for MCP question/permission prompts (ACC-02 after allowlist).
 * Exactly one answerCallbackQuery per update via try/finally.
 */
export function makeCallbackInteractiveHandler(
  pending: PendingInteractiveState,
  openCodeUrl: string,
  registry: SessionRegistry
) {
  return async (ctx: Context): Promise<void> => {
    let answerOpts: AnswerOpts | undefined;

    try {
      const cq = ctx.callbackQuery;
      const chatId = ctx.chat?.id;
      const data = cq?.data;

      if (data === undefined || chatId === undefined) {
        return;
      }

      const resolved = pending.resolveCallbackToken(data);
      if (!resolved) {
        answerOpts = { text: "This button is no longer valid." };
        return;
      }

      if (resolved.chatId !== chatId) {
        logger.warn({ resolvedChatId: resolved.chatId, chatId }, "callback chat mismatch");
        return;
      }

      const rec = pending.get(chatId);
      if (!rec) {
        answerOpts = { text: "Nothing to answer here." };
        return;
      }

      const active = registry.getActiveSessionId(chatId);
      if (active !== rec.sessionID) {
        answerOpts = { text: "Active session changed — dismiss this prompt." };
        return;
      }

      if (resolved.kind === "permission" && rec.kind === "permission") {
        if (resolved.role === "p:once") {
          await postPermissionReply(openCodeUrl, rec.requestID, { reply: "once" });
        } else if (resolved.role === "p:always") {
          await postPermissionReply(openCodeUrl, rec.requestID, { reply: "always" });
        } else if (resolved.role === "p:reject") {
          await postPermissionReply(openCodeUrl, rec.requestID, { reply: "reject" });
        } else {
          answerOpts = { text: "Unknown action." };
          return;
        }
        await deleteInteractivePromptMessage(ctx.api, chatId, rec.telegramMessageId);
        pending.clear(chatId);
        return;
      }

      if (resolved.kind === "question" && rec.kind === "question") {
        const q0 = rec.questionInfos?.[0];
        if (!q0) {
          answerOpts = { text: "Question data missing." };
          return;
        }

        if (resolved.role === "q:page") {
          const dir = resolved.payload ?? "";
          const n = q0.options.length;
          let off = rec.optionsPageOffset;
          if (dir === "prev") off = Math.max(0, off - QUESTION_OPTIONS_PAGE_SIZE);
          else if (dir === "next") {
            const maxOff = Math.max(0, n - QUESTION_OPTIONS_PAGE_SIZE);
            off = Math.min(maxOff, off + QUESTION_OPTIONS_PAGE_SIZE);
          }
          pending.setOptionsPageOffset(chatId, off);
          const built = buildQuestionKeyboardForChat(pending, chatId);
          if (built && rec.telegramMessageId !== undefined) {
            await ctx.api.editMessageText(chatId, rec.telegramMessageId, built.text, {
              reply_markup: built.reply_markup,
            });
          }
          return;
        }

        if (resolved.role === "q:toggle" && q0.multiple) {
          const parts = (resolved.payload ?? "").split(":");
          const qi = Number(parts[0]);
          const oi = Number(parts[1]);
          if (!Number.isFinite(qi) || !Number.isFinite(oi)) {
            answerOpts = { text: "Invalid option." };
            return;
          }
          pending.toggleQuestionOption(chatId, qi, oi);
          const built = buildQuestionKeyboardForChat(pending, chatId);
          if (built && rec.telegramMessageId !== undefined) {
            await ctx.api.editMessageText(chatId, rec.telegramMessageId, built.text, {
              reply_markup: built.reply_markup,
            });
          }
          return;
        }

        if (resolved.role === "q:submit" && q0.multiple) {
          const sel = rec.selectedOptionIndicesByQuestion.get(0);
          const indices = sel ? Array.from(sel).sort((a, b) => a - b) : [];
          const labels = indices.map((i) => q0.options[i]?.label).filter(Boolean) as string[];
          await postQuestionReply(openCodeUrl, rec.requestID, { answers: [labels] });
          await deleteInteractivePromptMessage(ctx.api, chatId, rec.telegramMessageId);
          pending.clear(chatId);
          answerOpts = { text: "Submitted." };
          return;
        }

        if (resolved.role === "q:pick" && !q0.multiple) {
          const parts = (resolved.payload ?? "").split(":");
          const qi = Number(parts[0]);
          const oi = Number(parts[1]);
          const opt = q0.options[oi];
          if (!Number.isFinite(qi) || !Number.isFinite(oi) || !opt) {
            answerOpts = { text: "Invalid option." };
            return;
          }
          await postQuestionReply(openCodeUrl, rec.requestID, { answers: [[opt.label]] });
          await deleteInteractivePromptMessage(ctx.api, chatId, rec.telegramMessageId);
          pending.clear(chatId);
          answerOpts = { text: "Submitted." };
          return;
        }

        answerOpts = { text: "Unsupported action." };
        return;
      }

      answerOpts = { text: "State mismatch." };
    } catch (err) {
      logger.error({ err, chatId: ctx.chat?.id }, "callback interactive handler failed");
      answerOpts = { text: "Request failed. Try again.", show_alert: true };
    } finally {
      await ctx.answerCallbackQuery(
        answerOpts?.text !== undefined || answerOpts?.show_alert
          ? {
              text: answerOpts?.text,
              show_alert: answerOpts?.show_alert,
            }
          : undefined
      ).catch(() => {});
    }
  };
}
