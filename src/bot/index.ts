import { Bot, BotError, GrammyError, HttpError } from "grammy";
import { config } from "../config/env.js";
import { logger } from "../logger.js";
import { dmOnlyMiddleware } from "./middleware/dm-only.js";
import { allowlistMiddleware } from "./middleware/allowlist.js";
import { telegramLogMiddleware } from "./middleware/telegram-log.js";
import { makeMessageHandler } from "./handlers/message.js";
import { makePhotoHandler } from "./handlers/photo.js";
import { makeUnsupportedMediaHandler } from "./handlers/unsupported-media.js";
import { makeCmdNewHandler } from "./handlers/cmd-new.js";
import { makeCmdSwitchHandler } from "./handlers/cmd-switch.js";
import { makeCmdSessionsHandler } from "./handlers/cmd-sessions.js";
import { makeCmdStatusHandler } from "./handlers/cmd-status.js";
import { makeCmdCancelHandler } from "./handlers/cmd-cancel.js";
import { makeCmdHelpHandler } from "./handlers/cmd-help.js";
import { makeCmdModelHandler } from "./handlers/cmd-model.js";
import { makeCallbackInteractiveHandler } from "./handlers/callback-interactive.js";
import type { StreamingStateManager } from "../opencode/streaming-state.js";
import type { SessionRegistry } from "../session/registry.js";
import type { PendingInteractiveState } from "../opencode/interactive-pending.js";

export function createBot(
  registry: SessionRegistry,
  manager: StreamingStateManager,
  pending: PendingInteractiveState,
  openCodeUrl: string
): Bot {
  const bot = new Bot(config.botToken);

  // Middleware order: DM gate → allowlist → telegram log (allowed only) → handlers
  bot.use(dmOnlyMiddleware);
  bot.use(allowlistMiddleware(config.allowedUserIds));
  bot.use(telegramLogMiddleware);

  // Commands must be registered before the catch-all message:text handler,
  // otherwise bot.on("message:text") intercepts command messages first.
  bot.command("new", makeCmdNewHandler(registry, openCodeUrl, pending));
  bot.command("switch", makeCmdSwitchHandler(registry, pending));
  bot.command("sessions", makeCmdSessionsHandler(registry));
  bot.command("status", makeCmdStatusHandler(registry, manager, openCodeUrl));
  bot.command("cancel", makeCmdCancelHandler(registry, manager, openCodeUrl, pending));
  bot.command("help", makeCmdHelpHandler());
  bot.command("model", makeCmdModelHandler(registry, openCodeUrl));

  const unsupportedMedia = makeUnsupportedMediaHandler();
  bot.on("message:document", unsupportedMedia);
  bot.on("message:voice", unsupportedMedia);
  bot.on("message:video", unsupportedMedia);
  bot.on("message:sticker", unsupportedMedia);

  bot.on("message:photo", makePhotoHandler(registry, manager, openCodeUrl, pending));

  // Catch-all for plain text messages — must come after all bot.command() registrations
  bot.on("message:text", makeMessageHandler(registry, manager, openCodeUrl, pending));

  bot.on("callback_query", makeCallbackInteractiveHandler(pending, openCodeUrl, registry));

  bot.catch((err) => {
    if (err instanceof BotError) {
      const cause = err.error;
      if (cause instanceof GrammyError) {
        const chatId =
          typeof cause.payload.chat_id === "number" ? cause.payload.chat_id : err.ctx.chat?.id;
        logger.error(
          {
            err: cause,
            method: cause.method,
            telegramErrorCode: cause.error_code,
            chatId,
          },
          "Telegram API error",
        );
        return;
      }
      if (cause instanceof HttpError) {
        logger.error({ err: cause }, "Telegram HTTP error");
        return;
      }
      logger.error({ err: cause, chatId: err.ctx.chat?.id }, "Unhandled bot error");
      return;
    }
    logger.error({ err }, "Unhandled bot error");
  });

  return bot;
}
