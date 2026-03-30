---
phase: quick
plan: 260330-hej
subsystem: config, startup
tags: [bot-mode, webhook, long-polling, env-config, tdd]
dependency_graph:
  requires: []
  provides: [BOT_MODE env config, webhook startup mode, dev long-polling mode]
  affects: [src/config/parse-env.ts, src/main.ts, .env.example]
tech_stack:
  added: []
  patterns: [cross-field env validation, mode-branching startup, TDD red-green]
key_files:
  created: []
  modified:
    - src/config/parse-env.ts
    - src/config/env.test.ts
    - src/main.ts
    - .env.example
decisions:
  - Cross-field WEBHOOK_URL validation done in parseEnv after schema parse (not in Zod superRefine) — keeps error messages simple and explicit
  - Each mode branch (dev/pro) owns its own shutdown handler — avoids shared state issues between the two startup paths
  - pro mode awaits server close via Promise — keeps process alive indefinitely without busy-waiting
metrics:
  duration: ~4 minutes
  completed_date: "2026-03-30"
  tasks_completed: 2
  files_modified: 4
---

# Quick Task 260330-hej: Add dev/pro bot mode with long polling vs webhook startup

**One-liner:** BOT_MODE env var selects long-polling (dev) or grammY webhookCallback HTTP server (pro) at startup, with WEBHOOK_URL cross-field validation.

## Summary

Added `BOT_MODE` environment variable support to switch the bot between two connection modes:

- **`dev` (default):** Long polling via `bot.start()` — existing behavior, no breaking changes
- **`pro`:** Registers `WEBHOOK_URL` with Telegram via `setWebhook`, starts a Node.js HTTP server on `WEBHOOK_PORT` (default 3000) using grammY's `webhookCallback`

The implementation follows TDD: tests written first (RED), then `parse-env.ts` extended (GREEN).

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Extend parse-env.ts with BOT_MODE, WEBHOOK_URL, WEBHOOK_PORT (TDD) | `2431365` (RED), `1778950` (GREEN) | `src/config/parse-env.ts`, `src/config/env.test.ts` |
| 2 | Branch main.ts for dev vs pro startup mode | `5bd4834` | `src/main.ts`, `.env.example` |

## Changes Made

### `src/config/parse-env.ts`
- Added `BOT_MODE: z.enum(["dev", "pro"]).default("dev")` to `EnvSchema`
- Added `WEBHOOK_URL: z.string().url().optional()` to `EnvSchema`
- Added `WEBHOOK_PORT: z.coerce.number().int().positive().default(3000)` to `EnvSchema`
- Extended `Config` type with `botMode`, `webhookUrl`, `webhookPort` fields
- Added cross-field validation: throws `"WEBHOOK_URL is required when BOT_MODE=pro"` when mode is pro but URL is absent
- Returns new fields from `parseEnv()`

### `src/config/env.test.ts`
- Added 8 new tests in `describe("parseEnv — BOT_MODE / WEBHOOK fields")` block
- Existing 6 tests unchanged and still passing

### `src/main.ts`
- Added `import { createServer } from "node:http"` and `import { webhookCallback } from "grammy"`
- Replaced monolithic shutdown block + `bot.start()` with a `config.botMode === "pro"` branch
- Pro branch: `setWebhook`, `webhookCallback`, `createServer`, `server.listen`, await server close
- Dev branch: original `bot.start()` with `onStart` logger — behavior preserved exactly
- Both branches register their own `SIGINT`/`SIGTERM` shutdown handlers

### `.env.example`
- Added documentation for `BOT_MODE`, `WEBHOOK_URL`, `WEBHOOK_PORT` (all commented out as optional)

## Verification

- `npm run typecheck` — ✅ clean (0 errors)
- `npm test` — ✅ 242/242 tests pass (8 new + 234 existing)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — no stubs introduced. The pro-mode webhook path calls real Telegram API (`setWebhook`) and real grammY `webhookCallback`.

## Self-Check: PASSED

- `src/config/parse-env.ts` — FOUND
- `src/config/env.test.ts` — FOUND (8 new tests all passing)
- `src/main.ts` — FOUND (dev/pro branch present)
- `.env.example` — FOUND (BOT_MODE docs added)
- Commits: `2431365`, `1778950`, `5bd4834` — all present in git log
