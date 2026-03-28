import { Bot } from "grammy";
import { config } from "../config/env.js";
import { logger } from "../logger.js";
import { dmOnlyMiddleware } from "./middleware/dm-only.js";
import { allowlistMiddleware } from "./middleware/allowlist.js";
import { makeMessageHandler } from "./handlers/message.js";
import { makeCmdNewHandler } from "./handlers/cmd-new.js";
import { makeCmdSwitchHandler } from "./handlers/cmd-switch.js";
import { makeCmdSessionsHandler } from "./handlers/cmd-sessions.js";
import { makeCmdStatusHandler } from "./handlers/cmd-status.js";
import { makeCmdCancelHandler } from "./handlers/cmd-cancel.js";
import { makeCmdHelpHandler } from "./handlers/cmd-help.js";
import { makeCmdModelHandler } from "./handlers/cmd-model.js";
import type { StreamingStateManager } from "../opencode/streaming-state.js";
import type { SessionRegistry } from "../session/registry.js";

export function createBot(registry: SessionRegistry, manager: StreamingStateManager): Bot {
  const bot = new Bot(config.botToken);

  // Middleware order: DM gate → allowlist → feature handlers (per D-04)
  bot.use(dmOnlyMiddleware);
  bot.use(allowlistMiddleware(config.allowedUserIds));

  // Commands must be registered before the catch-all message:text handler,
  // otherwise bot.on("message:text") intercepts command messages first.
  bot.command("new", makeCmdNewHandler(registry, config.openCodeUrl));
  bot.command("switch", makeCmdSwitchHandler(registry));
  bot.command("sessions", makeCmdSessionsHandler(registry));
  bot.command("status", makeCmdStatusHandler(registry, manager, config.openCodeUrl));
  bot.command("cancel", makeCmdCancelHandler(registry, manager, config.openCodeUrl));
  bot.command("help", makeCmdHelpHandler());
  bot.command("model", makeCmdModelHandler(registry, config.openCodeUrl));

  // Catch-all for plain text messages — must come after all bot.command() registrations
  bot.on("message:text", makeMessageHandler(registry, manager, config.openCodeUrl));

  bot.catch((err) => {
    logger.error({ err }, "Unhandled bot error");
  });

  return bot;
}
