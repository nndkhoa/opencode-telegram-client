---
phase: 01-foundation
verified: 2026-03-28T20:36:30Z
status: passed
score: 12/12 must-haves verified
re_verification: false
---

# Phase 01: Foundation Verification Report

**Phase Goal:** Bootstrap TypeScript project foundation with strict config validation, OpenCode HTTP transport, and grammY bot with access control middleware.
**Verified:** 2026-03-28T20:36:30Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | `npx tsc --noEmit` exits with code 0 (strict TypeScript compiles) | ✓ VERIFIED | `tsc --noEmit` ran with exit 0; `tsconfig.json` contains `"strict": true`, `"module": "NodeNext"` |
| 2  | Starting with missing BOT_TOKEN prints an error and exits non-zero | ✓ VERIFIED | `parseEnv()` throws on missing `BOT_TOKEN`; `env.ts` catches and calls `process.exit(1)` with `logger.fatal` (line 12-13) |
| 3  | `ALLOWED_USER_IDS=123,456` is parsed to `Set` containing 123 and 456 | ✓ VERIFIED | `parseEnv` test "parses comma-separated user IDs into Set" passes; `new Set(d.ALLOWED_USER_IDS)` in `parse-env.ts` line 38 |
| 4  | `OPENCODE_URL` defaults to `http://localhost:4096` when absent | ✓ VERIFIED | Zod schema: `.default("http://localhost:4096")`; test "defaults OPENCODE_URL" passes |
| 5  | `GET /global/health` is called at startup and response is logged | ✓ VERIFIED | `checkHealth()` in `health.ts` GETs `/global/health`, logs result; called in `main.ts` line 12 |
| 6  | SSE loop connects to `GET /event` and logs each incoming event | ✓ VERIFIED | `startSseLoop` uses `new URL("/event", baseUrl)` + `fetchEventSource`; `onmessage` logs via `logger.debug` |
| 7  | SSE reconnects with exponential backoff when connection drops | ✓ VERIFIED | `backoffDelay()` with `BACKOFF_BASE_MS * 2^attempt`; outer `while (!signal.aborted)` loop; test "reconnects after stream error" passes |
| 8  | AbortController signal stops SSE loop cleanly | ✓ VERIFIED | `while (!signal.aborted)` + `if (signal.aborted) break`; test "stops the loop when signal is aborted" passes |
| 9  | Non-private chat message is rejected before allowlist runs | ✓ VERIFIED | `dmOnlyMiddleware` checks `chatType !== "private"` and returns early; registered before allowlist in `bot/index.ts` (line 10 before line 11) |
| 10 | Message from unlisted user receives "You don't have access to this bot" | ✓ VERIFIED | `allowlist.ts` `REJECTION_MESSAGE` constant; test "replies with rejection message" passes |
| 11 | Message from allowlisted user reaches next middleware handler | ✓ VERIFIED | `allowed.has(uid)` guard; test "calls next() for allowlisted user" passes |
| 12 | Callback query from unlisted user is answered and blocked | ✓ VERIFIED | `ctx.answerCallbackQuery({ text: REJECTION_MESSAGE, show_alert: true })` called; test "answers callback query and blocks" passes |

**Score:** 12/12 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `package.json` | Dependencies + npm scripts | ✓ VERIFIED | `grammy@^1.41.1`, `zod@^4.3.6`, `@microsoft/fetch-event-source@^2.0.1`, `pino@^10.3.1`; scripts: `dev`, `build`, `test`, `typecheck` all present |
| `tsconfig.json` | TypeScript strict mode config | ✓ VERIFIED | `"strict": true`, `"module": "NodeNext"`, `"moduleResolution": "NodeNext"`, `"target": "ES2022"` |
| `src/config/env.ts` | Zod-validated config exported as typed object | ✓ VERIFIED | Exports `config` singleton, `parseEnv`, `Config` type (delegates to `parse-env.ts`) |
| `src/config/parse-env.ts` | Core parsing logic (refactored from plan) | ✓ VERIFIED | `parseEnv(raw)` with full Zod schema, `Config` type, `Set<number>` for allowedUserIds |
| `src/config/env.test.ts` | Unit tests for INFRA-02 and ACC-03 | ✓ VERIFIED | 6 tests, all passing; imports `parseEnv` directly to avoid `process.exit` in tests |
| `src/logger.ts` | pino logger singleton | ✓ VERIFIED | `pino` with `pino-pretty` transport in non-production |
| `src/opencode/events.ts` | OpenCode Event type definitions | ✓ VERIFIED | `OpenCodeEvent` discriminated union, `parseEvent(raw)` exported |
| `src/opencode/health.ts` | `checkHealth()` function | ✓ VERIFIED | Uses `new URL("/global/health", baseUrl)`, throws on non-ok HTTP; exports `checkHealth` |
| `src/opencode/health.test.ts` | Unit tests for health check | ✓ VERIFIED | 2 tests (200 OK + 503 error), all passing, uses `vi.stubGlobal("fetch", ...)` |
| `src/opencode/sse.ts` | `startSseLoop(signal)` with reconnect | ✓ VERIFIED | `fetchEventSource` with `openWhenHidden: true`, outer while-loop backoff, `AbortController` shutdown |
| `src/opencode/sse.test.ts` | Unit tests for SSE reconnect logic | ✓ VERIFIED | 3 tests (reconnect, event dispatch, abort stop), all passing |
| `src/bot/middleware/dm-only.ts` | Middleware rejecting non-private chats | ✓ VERIFIED | Checks `chatType !== "private"`, exports `dmOnlyMiddleware` |
| `src/bot/middleware/allowlist.ts` | Middleware rejecting unlisted users | ✓ VERIFIED | `allowlistMiddleware(allowed: Set<number>)` factory, handles callbacks, exports correctly |
| `src/bot/middleware/allowlist.test.ts` | Unit tests for both middlewares | ✓ VERIFIED | 7 tests (3 dm-only + 4 allowlist), all passing |
| `src/bot/index.ts` | Bot instance with middleware chain | ✓ VERIFIED | `dmOnlyMiddleware` registered line 10, `allowlistMiddleware` line 11 (correct order); exports `bot` |
| `src/main.ts` | Bootstrap: config → health → SSE + bot | ✓ VERIFIED | Health check, SSE loop started, bot.start() awaited; graceful SIGINT/SIGTERM shutdown |
| `.env.example` | Documents all env vars | ✓ VERIFIED | Documents `BOT_TOKEN`, `ALLOWED_USER_IDS`, `OPENCODE_URL` with comments |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/bot/middleware/allowlist.ts` | `config.allowedUserIds` | `Set<number>.has(ctx.from?.id)` | ✓ WIRED | `allowed.has(uid)` on line 10; `config.allowedUserIds` passed at `bot/index.ts:11` |
| `src/main.ts` | `startSseLoop + bot.start()` | concurrent void calls | ✓ WIRED | `startSseLoop(...)` line 16 (background), `await bot.start(...)` line 36 |
| `src/opencode/sse.ts` | `GET /event` | `fetchEventSource` with `openWhenHidden: true` | ✓ WIRED | `fetchEventSource(url, { signal, openWhenHidden: true, ... })` lines 29-31 |
| `src/opencode/sse.ts` | exponential backoff | outer while loop with delay | ✓ WIRED | `backoffDelay(attempt)` + `setTimeout` in catch block; `attempt++` increments correctly |
| `src/config/env.ts` | `src/config/parse-env.ts` | re-export pattern | ✓ WIRED | `env.ts` re-exports `parseEnv` and `Config` from `parse-env.ts`; tests import from `parse-env.js` directly |

---

### Data-Flow Trace (Level 4)

Not applicable — this phase creates infrastructure modules (config loader, HTTP transport, middleware), not data-rendering UI components. The data flows are validated by unit tests directly.

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| TypeScript strict compilation | `npx tsc --noEmit` | Exit 0, no errors | ✓ PASS |
| All 18 unit tests pass | `npx vitest run` | 18/18 passed (4 test files) | ✓ PASS |
| Module exports `parseEnv` | grep check | Found in `parse-env.ts` line 29 | ✓ PASS |
| Module exports `config` singleton | grep check | Found in `env.ts` line 15 | ✓ PASS |
| `process.exit(1)` on bad config | grep check | Found in `env.ts` line 13 | ✓ PASS |
| `openWhenHidden: true` in SSE | grep check | Found in `sse.ts` line 31 | ✓ PASS |
| `dmOnlyMiddleware` before `allowlistMiddleware` | grep -n line numbers | Lines 10 and 11 of `bot/index.ts` | ✓ PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| INFRA-01 | 01-01, 01-03 | TypeScript with strict mode | ✓ SATISFIED | `tsconfig.json` has `"strict": true`; `tsc --noEmit` exits 0 |
| INFRA-02 | 01-01 | Config from env vars / `.env` file | ✓ SATISFIED | `dotenv/config` loaded in `env.ts` and `main.ts`; Zod validates all required vars |
| INFRA-04 | 01-02 | Bot connects to OpenCode via single shared SSE connection | ✓ SATISFIED | `startSseLoop` in `sse.ts` with single `AbortController`; wired in `main.ts` as shared connection |
| ACC-01 | 01-03 | Bot rejects messages from users not in allowlist | ✓ SATISFIED | `allowlistMiddleware` rejects with "You don't have access to this bot"; 4 unit tests confirm |
| ACC-02 | 01-03 | Bot rejects callback queries from users not in allowlist | ✓ SATISFIED | `ctx.answerCallbackQuery({ text: REJECTION_MESSAGE })` prevents stuck spinner; unit test confirms |
| ACC-03 | 01-01 | Allowlist configured via env var (comma-separated user IDs) | ✓ SATISFIED | `ALLOWED_USER_IDS` parsed by Zod, split on comma, converted to `Set<number>`; 2 unit tests confirm |

**All 6 required requirements satisfied.**

**Orphaned requirements check:** INFRA-03 (`README.md` documents setup) is listed in REQUIREMENTS.md for the infrastructure group but was NOT claimed by any plan in Phase 01. This is expected — INFRA-03 is not marked as Phase 1 work in REQUIREMENTS.md (it remains unchecked).

---

### Anti-Patterns Found

No blockers or warnings found.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/bot/index.ts` | 13-19 | Phase 1 echo handler (`Echo (Phase 1): ...`) | ℹ️ Info | Intentional placeholder per plan; comment states "removed in Phase 2" — not a stub, expected behavior |

**Note on structural deviation:** The PLAN specified `parseEnv` in `src/config/env.ts`, but the implementation split it into `src/config/parse-env.ts` (logic) and `src/config/env.ts` (re-exporter + singleton). This is a valid refactoring that improves testability (tests import from `parse-env.js` without triggering `process.exit`). All exports remain correct from the consumer perspective.

---

### Human Verification Required

#### 1. Bot rejects group/channel messages at runtime

**Test:** Add the bot to a group and send a message.
**Expected:** No response (silent drop by `dmOnlyMiddleware`).
**Why human:** Can't test Telegram API interactions without a live bot token.

#### 2. Allowlist blocks real Telegram users end-to-end

**Test:** Send a DM from a user ID NOT in `ALLOWED_USER_IDS`.
**Expected:** Bot replies "You don't have access to this bot".
**Why human:** Requires live Telegram bot token and two user accounts.

#### 3. `npm run dev` connects to Telegram long polling

**Test:** Set a valid `BOT_TOKEN` and `ALLOWED_USER_IDS`, run `npm run dev` with OpenCode running.
**Expected:** Bot starts, logs "Bot started successfully", begins receiving updates.
**Why human:** Requires live credentials and running OpenCode server.

---

### Gaps Summary

No gaps found. All 12 observable truths verified, all 6 requirements satisfied, all 17 artifacts exist and are substantive and wired correctly. The full test suite (18 tests across 4 files) passes with exit 0. TypeScript strict compilation passes with no errors.

---

_Verified: 2026-03-28T20:36:30Z_
_Verifier: Claude (gsd-verifier)_
