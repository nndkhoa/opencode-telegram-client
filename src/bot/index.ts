import { Bot } from "grammy";
import { config } from "../config/env.js";
import { logger } from "../logger.js";
import { dmOnlyMiddleware } from "./middleware/dm-only.js";
import { allowlistMiddleware } from "./middleware/allowlist.js";
import { makeMessageHandler } from "./handlers/message.js";
import type { StreamingStateManager } from "../opencode/streaming-state.js";
import type { SessionRegistry } from "../session/registry.js";

export function createBot(registry: SessionRegistry, manager: StreamingStateManager): Bot {
  const bot = new Bot(config.botToken);

  // Middleware order: DM gate → allowlist → feature handlers (per D-04)
  bot.use(dmOnlyMiddleware);
  bot.use(allowlistMiddleware(config.allowedUserIds));

  // Phase 2: real message handler (replaces Phase 1 echo)
  bot.on("message:text", makeMessageHandler(registry, manager, config.openCodeUrl));

  bot.catch((err) => {
    logger.error({ err }, "Unhandled bot error");
  });

  return bot;
}
