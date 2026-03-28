import "dotenv/config";
import { config } from "./config/env.js";
import { logger } from "./logger.js";
import { checkHealth } from "./opencode/health.js";
import { startSseLoop } from "./opencode/sse.js";
import { createBot } from "./bot/index.js";
import { StreamingStateManager } from "./opencode/streaming-state.js";

async function main(): Promise<void> {
  logger.info("Starting OpenCode Telegram bot...");

  // Step 1: Health check — fails fast if OpenCode unreachable
  await checkHealth(config.openCodeUrl);

  // Step 2: Create shared streaming state manager (session registry + turn tracker)
  const manager = new StreamingStateManager();

  // Step 3: Create bot with manager injected
  const bot = createBot(manager);

  // Step 4: Start SSE loop in background — routes events to manager
  const ac = new AbortController();
  const sseTask = startSseLoop({
    baseUrl: config.openCodeUrl,
    signal: ac.signal,
    onEvent: (event) => {
      const props = "properties" in event ? event.properties : undefined;
      logger.debug(
        { eventType: event.type, sessionID: (props as { sessionID?: string } | undefined)?.sessionID },
        "OpenCode event"
      );
      // Route event to streaming state manager — drives live Telegram message edits
      manager.handleEvent(event, bot.api);
    },
    // D-07: SSE disconnect after streaming started — end the active turn with an error message
    onError: async (err) => {
      logger.error({ err }, "SSE connection error — ending active turns with error message");
      await manager.endAllTurnsWithError(
        bot.api,
        "❌ Something went wrong mid-response. Please try again."
      );
    },
  });

  // Graceful shutdown
  const shutdown = (signal: string) => {
    logger.info({ signal }, "Shutting down...");
    ac.abort();
    bot.stop();
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));

  // Step 5: Start bot (long polling — blocks until stopped)
  logger.info("Bot starting (long polling)...");
  await bot.start({
    onStart: (info) => {
      logger.info({ username: info.username }, "Bot started successfully");
    },
  });

  // Wait for SSE task to finish after abort
  await sseTask.catch(() => {});
}

main().catch((err) => {
  logger.fatal({ err }, "Fatal startup error");
  process.exit(1);
});
