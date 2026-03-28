import "dotenv/config";
import { config } from "./config/env.js";
import { logger } from "./logger.js";
import { checkHealth } from "./opencode/health.js";
import { startSseLoop } from "./opencode/sse.js";
import { bot } from "./bot/index.js";

async function main(): Promise<void> {
  logger.info("Starting OpenCode Telegram bot...");

  // Step 1: Health check — fails fast if OpenCode unreachable (per D-05)
  await checkHealth(config.openCodeUrl);

  // Step 2: Start SSE loop in background (D-01: single shared connection)
  const ac = new AbortController();
  const sseTask = startSseLoop({
    baseUrl: config.openCodeUrl,
    signal: ac.signal,
    onEvent: (event) => {
      // Phase 1: log all events; Phase 2+ will route by sessionID
      const props = "properties" in event ? event.properties : undefined;
      logger.debug({ eventType: event.type, sessionID: (props as { sessionID?: string } | undefined)?.sessionID }, "OpenCode event");
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

  // Step 3: Start bot (long polling — blocks until stopped)
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
