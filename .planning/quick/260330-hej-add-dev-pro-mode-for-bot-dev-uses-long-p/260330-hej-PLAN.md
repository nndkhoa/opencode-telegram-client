---
phase: quick
plan: 260330-hej
type: execute
wave: 1
depends_on: []
files_modified:
  - src/config/parse-env.ts
  - src/config/env.test.ts
  - src/main.ts
  - .env.example
autonomous: true
requirements: [BOT-MODE-01]

must_haves:
  truths:
    - "BOT_MODE=dev starts bot with long polling (existing behaviour)"
    - "BOT_MODE=pro starts bot with webhook server on WEBHOOK_PORT and registers WEBHOOK_URL with Telegram"
    - "Missing WEBHOOK_URL when BOT_MODE=pro causes a clear startup error"
    - "BOT_MODE defaults to dev when not set"
  artifacts:
    - path: "src/config/parse-env.ts"
      provides: "botMode and webhookUrl fields on Config"
    - path: "src/main.ts"
      provides: "Branching startup: long polling vs webhook"
  key_links:
    - from: "src/config/parse-env.ts"
      to: "src/main.ts"
      via: "config.botMode / config.webhookUrl"
      pattern: "config\\.botMode"
---

<objective>
Add a `BOT_MODE` env var (`dev` | `pro`) that controls how the bot connects to Telegram.

- **dev** — long polling (current behaviour, no changes needed)
- **pro** — webhook: registers `WEBHOOK_URL` with Telegram via `setWebhook`, starts a Node.js HTTP server on `WEBHOOK_PORT` (default 3000) to receive updates via `webhookCallback(bot, 'http')`

Purpose: Allows production deployments to use webhooks (lower latency, no polling) while keeping the simple long-polling mode for local dev.
Output: `parse-env.ts` extended with two new optional fields; `main.ts` branched for the two modes; `.env.example` updated.
</objective>

<execution_context>
@/Users/admin/repos/opencode-telegram-client/.opencode/get-shit-done/workflows/execute-plan.md
@/Users/admin/repos/opencode-telegram-client/.opencode/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

<!-- Key contracts the executor needs -->
<interfaces>
From src/config/parse-env.ts:
```typescript
export type Config = {
  botToken: string;
  openCodeUrl: string;
  allowedUserIds: Set<number>;
  // NEW fields to add:
  // botMode: "dev" | "pro";
  // webhookUrl: string | undefined;   // required when botMode === "pro"
  // webhookPort: number;              // default 3000
};
export function parseEnv(raw: NodeJS.ProcessEnv): Config;
```

From src/main.ts (grammY webhook usage):
```typescript
import { webhookCallback } from "grammy";
import { createServer } from "node:http";

// Pro mode webhook startup:
await bot.api.setWebhook(config.webhookUrl!);
const cb = webhookCallback(bot, "http");
const server = createServer(async (req, res) => { await cb(req, res); });
server.listen(config.webhookPort, () => {
  logger.info({ port: config.webhookPort, url: config.webhookUrl }, "Webhook server listening");
});
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extend parse-env.ts with BOT_MODE, WEBHOOK_URL, WEBHOOK_PORT</name>
  <files>src/config/parse-env.ts, src/config/env.test.ts</files>
  <behavior>
    - BOT_MODE defaults to "dev" when missing; accepts only "dev" | "pro" (invalid value throws)
    - WEBHOOK_URL is required (non-empty URL) when BOT_MODE=pro; when BOT_MODE=dev it may be absent (stored as undefined)
    - WEBHOOK_PORT defaults to 3000; must be a positive integer
    - parseEnv({ BOT_TOKEN, ALLOWED_USER_IDS }) → botMode "dev", webhookUrl undefined, webhookPort 3000
    - parseEnv({ ..., BOT_MODE: "pro", WEBHOOK_URL: "https://ex.com/bot", WEBHOOK_PORT: "8080" }) → botMode "pro", webhookUrl "https://ex.com/bot", webhookPort 8080
    - parseEnv({ ..., BOT_MODE: "pro" }) without WEBHOOK_URL → throws (WEBHOOK_URL required in pro mode)
    - parseEnv({ ..., BOT_MODE: "bad" }) → throws
  </behavior>
  <action>
In `src/config/parse-env.ts`:

1. Extend `EnvSchema` with three new optional fields:
   ```typescript
   BOT_MODE: z.enum(["dev", "pro"]).default("dev"),
   WEBHOOK_URL: z.string().url().optional(),
   WEBHOOK_PORT: z.coerce.number().int().positive().default(3000),
   ```

2. Add `botMode`, `webhookUrl`, `webhookPort` to the `Config` type:
   ```typescript
   export type Config = {
     botToken: string;
     openCodeUrl: string;
     allowedUserIds: Set<number>;
     botMode: "dev" | "pro";
     webhookUrl: string | undefined;
     webhookPort: number;
   };
   ```

3. In `parseEnv`, after schema parse, add cross-field validation:
   ```typescript
   if (d.BOT_MODE === "pro" && !d.WEBHOOK_URL) {
     throw new Error("WEBHOOK_URL is required when BOT_MODE=pro");
   }
   ```

4. Return the new fields from `parseEnv`:
   ```typescript
   return {
     ...existingFields,
     botMode: d.BOT_MODE,
     webhookUrl: d.WEBHOOK_URL,
     webhookPort: d.WEBHOOK_PORT,
   };
   ```

In `src/config/env.test.ts`, add test cases covering the behaviors listed above (new `describe` block or extend existing one — no existing tests need to change).
  </action>
  <verify>
    <automated>npm test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|parse-env|BOT_MODE|WEBHOOK)"</automated>
  </verify>
  <done>All new tests pass; existing tests still pass; `Config` type has `botMode`, `webhookUrl`, `webhookPort`.</done>
</task>

<task type="auto">
  <name>Task 2: Branch main.ts for dev (long polling) vs pro (webhook)</name>
  <files>src/main.ts, .env.example</files>
  <action>
In `src/main.ts`:

1. Add import at top:
   ```typescript
   import { createServer } from "node:http";
   import { webhookCallback } from "grammy";
   ```

2. Replace the current Step 5 block (long-polling `bot.start()`) with a mode branch:

   ```typescript
   if (config.botMode === "pro") {
     // Pro mode: register webhook, start HTTP server
     await bot.api.setWebhook(config.webhookUrl!, {
       allowed_updates: ["message", "callback_query"],
     });
     logger.info({ url: config.webhookUrl }, "Webhook registered with Telegram");

     const cb = webhookCallback(bot, "http");
     const server = createServer(async (req, res) => {
       await cb(req, res);
     });

     const shutdown = (signal: string) => {
       logger.info({ signal }, "Shutting down...");
       ac.abort();
       server.close(() => logger.info("HTTP server closed"));
     };
     process.once("SIGINT", () => shutdown("SIGINT"));
     process.once("SIGTERM", () => shutdown("SIGTERM"));

     await new Promise<void>((resolve, reject) => {
       server.listen(config.webhookPort, () => {
         logger.info({ port: config.webhookPort }, "Webhook server listening");
         resolve();
       });
       server.on("error", reject);
     });

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
   ```

   NOTE: Remove the original `shutdown` / `process.once` block that's currently outside the branch — both modes now define their own shutdown handlers inside the conditional. Also remove the old `bot.start()` call.

3. Keep the existing SSE loop (`sseTask`) and `await sseTask.catch(() => {})` as-is — they run in both modes.

In `.env.example`:

Add below existing entries:
```
# Optional — bot mode: "dev" uses long polling (default), "pro" uses webhook
# BOT_MODE=dev

# Required when BOT_MODE=pro — public HTTPS URL Telegram will POST updates to
# WEBHOOK_URL=https://yourdomain.com/bot

# Optional — port for webhook HTTP server (default: 3000, only used when BOT_MODE=pro)
# WEBHOOK_PORT=3000
```
  </action>
  <verify>
    <automated>npm run typecheck 2>&1</automated>
  </verify>
  <done>TypeScript compiles without errors; main.ts has the dev/pro branch; .env.example documents the new vars.</done>
</task>

</tasks>

<verification>
1. `npm run typecheck` — no errors
2. `npm test` — all tests pass (including new BOT_MODE/WEBHOOK env tests)
3. Manual smoke: `BOT_MODE=dev npm run dev` connects via long polling (existing behaviour unchanged)
</verification>

<success_criteria>
- `BOT_MODE=dev` (or unset) → long polling, existing behaviour preserved
- `BOT_MODE=pro` without `WEBHOOK_URL` → process exits with clear error at startup
- `BOT_MODE=pro` with `WEBHOOK_URL` and `WEBHOOK_PORT` → HTTP server starts, webhook registered with Telegram
- All existing tests continue to pass
- TypeScript clean
</success_criteria>

<output>
After completion, create `.planning/quick/260330-hej-add-dev-pro-mode-for-bot-dev-uses-long-p/260330-hej-SUMMARY.md`
</output>
