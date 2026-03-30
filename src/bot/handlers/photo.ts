import type { Context } from "grammy";
import { config } from "../../config/env.js";
import { logger } from "../../logger.js";
import { ensurePersistedModelApplied } from "../../persist/last-model.js";
import { sendPromptAsyncWithPhoto } from "../../opencode/session.js";
import type { StreamingStateManager } from "../../opencode/streaming-state.js";
import type { SessionRegistry } from "../../session/registry.js";
import type { PendingInteractiveState } from "../../opencode/interactive-pending.js";

const BUSY_REPLY = "⏳ Still working on your last message. Please wait.";
/** D-16 / D-17: photo cannot answer MCP prompts — user must use text, buttons, or /cancel. */
const MCP_BLOCK_REPLY =
  "Reply with text or tap an option, or send /cancel. Photos cannot be used for this prompt.";

function mimeFromTelegramPath(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

export function makePhotoHandler(
  registry: SessionRegistry,
  manager: StreamingStateManager,
  openCodeUrl: string,
  pending: PendingInteractiveState
) {
  return async (ctx: Context): Promise<void> => {
    const chatId = ctx.chat!.id;

    if (manager.isBusy(chatId)) {
      await ctx.reply(BUSY_REPLY);
      return;
    }

    // D-16: isAwaitingFreeTextAnswer; D-17: active question (keyboard) or permission — any pending blocks photos
    if (
      pending.isAwaitingFreeTextAnswer(chatId) ||
      pending.get(chatId) !== undefined
    ) {
      await ctx.reply(MCP_BLOCK_REPLY);
      return;
    }

    await ctx.replyWithChatAction("upload_photo");

    let sessionId: string;
    try {
      sessionId = await registry.getOrCreateDefault(chatId, openCodeUrl);
      pending.rememberSessionChat(sessionId, chatId);
    } catch (err) {
      logger.error({ err, chatId }, "Failed to create OpenCode session");
      await ctx.reply(
        "❌ OpenCode is unreachable. Make sure it's running at localhost:4096."
      );
      return;
    }

    // Fix 4: Resolve file metadata (cheap — just file_path, no download yet)
    const tgFile = await ctx.getFile();
    if (!tgFile.file_path) {
      await ctx.reply("❌ Could not download this photo.");
      return;
    }

    // Fix 4: Send "⏳ Thinking..." immediately after we have the file_path,
    // before the actual photo bytes are downloaded. The download happens async
    // so the webhook handler (and user) isn't blocked by potentially large file fetches.
    const sentMsg = await ctx.reply("⏳ Thinking...");
    const messageId = sentMsg.message_id;
    manager.startTurn(sessionId, chatId, messageId);

    const tgUrl = `https://api.telegram.org/file/bot${config.botToken}/${tgFile.file_path}`;
    const mime = mimeFromTelegramPath(tgFile.file_path);
    const filename = tgFile.file_path.split("/").pop() ?? "photo.jpg";

    // Download + send to OpenCode async — does not block webhook response
    (async () => {
      let buf: Buffer;
      try {
        const res = await fetch(tgUrl);
        if (!res.ok) throw new Error(`Telegram file HTTP ${res.status}`);
        buf = Buffer.from(await res.arrayBuffer());
      } catch (err) {
        logger.error({ err, chatId }, "Failed to download Telegram photo");
        manager.endTurn(sessionId);
        await ctx.api.editMessageText(chatId, messageId, "❌ Could not download this photo.");
        return;
      }

      try {
        await ensurePersistedModelApplied(openCodeUrl);
        await sendPromptAsyncWithPhoto(openCodeUrl, sessionId, buf, mime, { filename });
        logger.info({ chatId, sessionId }, "Photo prompt sent to OpenCode");
      } catch (err) {
        logger.error({ err, chatId, sessionId }, "sendPromptAsyncWithPhoto failed");
        manager.endTurn(sessionId);
        await ctx.api.editMessageText(
          chatId,
          messageId,
          "❌ OpenCode is unreachable. Make sure it's running at localhost:4096."
        );
      }
    })().catch((err: unknown) => {
      logger.error({ err, chatId }, "Unhandled error in photo async pipeline");
    });
  };
}
