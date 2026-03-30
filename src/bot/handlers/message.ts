import type { Context } from "grammy";
import { logger } from "../../logger.js";
import { ensurePersistedModelApplied } from "../../persist/last-model.js";
import { sendPromptAsync } from "../../opencode/session.js";
import type { StreamingStateManager } from "../../opencode/streaming-state.js";
import type { SessionRegistry } from "../../session/registry.js";
import type { PendingInteractiveState } from "../../opencode/interactive-pending.js";
import type { QuestionInfo } from "../../opencode/events.js";
import { postQuestionReply } from "../../opencode/replies.js";

/** Build `answers` for POST /question/{id}/reply from free-text user input (MCP-02). */
export function buildFreeTextQuestionAnswers(
  userText: string,
  questionInfos: QuestionInfo[] | undefined
): string[][] {
  const qs = questionInfos?.length ? questionInfos : [];
  if (qs.length <= 1) {
    return [[userText]];
  }
  const parts = userText.split(/\n\n+/).map((p) => p.trim());
  return qs.map((_, i) => [parts[i] ?? ""]);
}

export function makeMessageHandler(
  registry: SessionRegistry,
  manager: StreamingStateManager,
  openCodeUrl: string,
  pending: PendingInteractiveState
) {
  return async (ctx: Context): Promise<void> => {
    const chatId = ctx.chat!.id;
    const text = ctx.message?.text;
    if (!text) return;

    // MCP-02 / D-09: awaiting open-ended answer — before streaming busy guard (commands use bot.command first per D-08)
    // NOTE: do NOT apply isBusy guard here — OpenCode is waiting for this reply (that's why it's "busy").
    if (pending.isAwaitingFreeTextAnswer(chatId)) {
      const rec = pending.get(chatId);
      if (!rec || rec.kind !== "question") {
        pending.clear(chatId);
        return;
      }
      try {
        const answers = buildFreeTextQuestionAnswers(text, rec.questionInfos);
        await postQuestionReply(openCodeUrl, rec.requestID, { answers });
        const promptMid = rec.telegramMessageId;
        pending.clear(chatId);
        if (promptMid !== undefined) {
          await ctx.api.deleteMessage(chatId, promptMid).catch(() => {});
        }
        logger.info({ chatId, requestID: rec.requestID }, "Free-text question reply posted");
      } catch (err) {
        logger.error({ err, chatId, requestID: rec.requestID }, "postQuestionReply failed");
        await ctx.reply(
          "❌ Could not send your answer to OpenCode. Check the server and try again."
        );
      }
      return;
    }

    // D-08: concurrency guard — check BEFORE typing action
    if (manager.isBusy(chatId)) {
      await ctx.reply("⏳ Still working on your last message. Please wait.");
      return;
    }

    // MSG-02: send "Thinking..." immediately so user gets instant feedback,
    // then resolve/create session and fire the prompt afterward.
    const sentMsg = await ctx.reply("⏳ Thinking...");
    const messageId = sentMsg.message_id;

    // D-01: auto-create session for this chatId on first message via registry
    let sessionId: string;
    try {
      sessionId = await registry.getOrCreateDefault(chatId, openCodeUrl);
      pending.rememberSessionChat(sessionId, chatId);
    } catch (err) {
      logger.error({ err, chatId }, "Failed to create OpenCode session");
      await ctx.api.editMessageText(
        chatId,
        messageId,
        "❌ OpenCode is unreachable. Make sure it's running at localhost:4096."
      );
      return;
    }

    // D-08: set busy BEFORE prompt_async fires
    manager.startTurn(sessionId, chatId, messageId);

    // D-06: fire prompt_async — returns 204 immediately; all output arrives via SSE
    try {
      await ensurePersistedModelApplied(openCodeUrl);
      await sendPromptAsync(openCodeUrl, sessionId, text);
      logger.info({ chatId, sessionId }, "Prompt sent to OpenCode");
    } catch (err) {
      logger.error({ err, chatId, sessionId }, "sendPromptAsync failed");
      manager.endTurn(sessionId);
      await ctx.api.editMessageText(
        chatId,
        messageId,
        "❌ OpenCode is unreachable. Make sure it's running at localhost:4096."
      );
    }
  };
}
