import type { Context } from "grammy";
import { logger } from "../../logger.js";
import { createSession, sendPromptAsync } from "../../opencode/session.js";
import type { StreamingStateManager } from "../../opencode/streaming-state.js";

export function makeMessageHandler(
  manager: StreamingStateManager,
  openCodeUrl: string
) {
  return async (ctx: Context): Promise<void> => {
    const chatId = ctx.chat!.id;
    const text = ctx.message?.text;
    if (!text) return;

    // D-08: concurrency guard — check BEFORE typing action
    if (manager.isBusy(chatId)) {
      await ctx.reply("⏳ Still working on your last message. Please wait.");
      return;
    }

    // MSG-02: send typing action immediately
    await ctx.replyWithChatAction("typing");

    // D-01: auto-create session for this chatId on first message
    let sessionId = manager.getSession(chatId);
    if (!sessionId) {
      try {
        sessionId = await createSession(openCodeUrl);
        manager.setSession(chatId, sessionId);
        logger.info({ chatId, sessionId }, "Created new OpenCode session");
      } catch (err) {
        logger.error({ err, chatId }, "Failed to create OpenCode session");
        await ctx.reply(
          "❌ OpenCode is unreachable. Make sure it's running at localhost:4096."
        );
        return;
      }
    }

    // Send initial "Thinking..." message — will be edited as tokens stream in
    const sentMsg = await ctx.reply("⏳ Thinking...");
    const messageId = sentMsg.message_id;

    // D-08: set busy BEFORE prompt_async fires
    manager.startTurn(sessionId, chatId, messageId);

    // D-06: fire prompt_async — returns 204 immediately; all output arrives via SSE
    try {
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
