import "dotenv/config";
import { createServer } from "node:http";
import { config } from "./config/env.js";
import { logger } from "./logger.js";
import { checkHealth } from "./opencode/health.js";
import { startSseLoop } from "./opencode/sse.js";
import { createBot } from "./bot/index.js";
import { StreamingStateManager } from "./opencode/streaming-state.js";
import { SessionRegistry } from "./session/registry.js";
import { PendingInteractiveState } from "./opencode/interactive-pending.js";
import { dispatchInteractiveOpenCodeEvent } from "./opencode/interactive-dispatch.js";

async function main(): Promise<void> {
  logger.info("Starting OpenCode Telegram bot...");

  // Step 1: Health check — fails fast if OpenCode unreachable
  await checkHealth(config.openCodeUrl);

  // Step 2: Create shared session registry + streaming state manager
  const registry = new SessionRegistry();
  const manager = new StreamingStateManager(registry, config.openCodeUrl);
  const pendingInteractive = new PendingInteractiveState();

  // Step 3: Create bot with registry and manager injected
  const bot = createBot(registry, manager, pendingInteractive, config.openCodeUrl);

  // CMD-07: Register BotFather command menu
  await bot.api.setMyCommands([
    { command: "help", description: "Show all commands" },
    { command: "new", description: "Create and switch to a named session" },
    { command: "model", description: "Switch active AI model or list available models" },
    { command: "status", description: "Show active session and OpenCode health" },
    { command: "cancel", description: "Abort the current in-progress request" },
    { command: "sessions", description: "List all sessions for this chat" },
    { command: "switch", description: "Switch to an existing named session" },
  ]);
  logger.info("BotFather command menu registered");

  // Step 4: Start SSE loop in background — routes events to manager
  const ac = new AbortController();
  const sseTask = startSseLoop({
    baseUrl: config.openCodeUrl,
    signal: ac.signal,
    onEvent: async (event) => {
      // Route event to streaming state manager — drives live Telegram message edits
      await manager.handleEvent(event, bot.api);
      // question.asked / permission.asked / lifecycle — MCP interactive UI (D-10, D-11)
      await dispatchInteractiveOpenCodeEvent(event, bot.api, {
        registry,
        pending: pendingInteractive,
      });
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

  // Step 5: Start bot — long polling (dev) or webhook server (pro)
  if (config.botMode === "pro") {
    // Fix 3: Init bot (getMe) eagerly so first webhook request never pays cold-start RTT.
    await bot.init();
    logger.info({ username: bot.botInfo.username }, "Bot initialized");

    // Fix 1: Respond 200 OK to Telegram immediately, process update async.
    // This eliminates head-of-line blocking — Telegram won't queue the next
    // update waiting for handler completion, and there's no 10s timeout risk.
    const server = createServer((req, res) => {
      if (req.method !== "POST") {
        res.writeHead(405).end();
        return;
      }
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        // Acknowledge immediately — Telegram gets 200 OK before handler runs
        res.writeHead(200, { "Content-Type": "application/json" }).end("{}");
        try {
          const update = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          bot.handleUpdate(update).catch((err: unknown) => {
            logger.error({ err }, "Unhandled error in bot.handleUpdate");
          });
        } catch (err) {
          logger.error({ err }, "Failed to parse webhook payload");
        }
      });
      req.on("error", (err) => {
        logger.error({ err }, "Webhook request stream error");
      });
    });

    const shutdown = (signal: string) => {
      logger.info({ signal }, "Shutting down...");
      ac.abort();
      server.close(() => logger.info("HTTP server closed"));
    };
    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));

    // Start HTTP server BEFORE registering webhook with Telegram.
    // If setWebhook is called first, Telegram immediately starts sending updates
    // to a port that isn't listening yet → connection refused → Telegram retries
    // with exponential backoff (5s, 10s, 20s, 40s…) causing ~50s cold-start delay.
    await new Promise<void>((resolve, reject) => {
      server.listen(config.webhookPort, () => {
        logger.info({ port: config.webhookPort }, "Webhook server listening");
        resolve();
      });
      server.on("error", reject);
    });

    // Pro mode: register webhook AFTER server is ready to accept connections.
    await bot.api.setWebhook(config.webhookUrl!, {
      allowed_updates: ["message", "callback_query"],
    });
    logger.info({ url: config.webhookUrl }, "Webhook registered with Telegram");

    // In pro mode we don't call bot.start() — keep process alive waiting for server close
    await new Promise<void>((resolve) => server.on("close", resolve));
  } else {
    // Dev mode: long polling (original behaviour)
    logger.info("Bot starting (long polling)...");

    const shutdown = (signal: string) => {
      logger.info({ signal }, "Shutting down...");
      ac.abort();
      bot.stop();
    };
    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));

    await bot.start({
      onStart: (info) => {
        logger.info({ username: info.username }, "Bot started successfully");
      },
    });
  }

  // Wait for SSE task to finish after abort
  await sseTask.catch(() => {});
}

main().catch((err) => {
  logger.fatal({ err }, "Fatal startup error");
  process.exit(1);
});
