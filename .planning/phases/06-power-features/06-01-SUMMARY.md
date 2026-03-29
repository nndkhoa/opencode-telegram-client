---
phase: 06-power-features
plan: 01
subsystem: observability
tags: [pino, rotating-file-stream, grammy, logging, sse]

requires:
  - phase: 05-mcp-questions-permissions
    provides: bot handlers, SSE loop, OpenCode clients
provides:
  - Dual-sink pino (stdout + daily JSON logs under logs/)
  - Telegram update metadata middleware (LOG-01)
  - OpenCode HTTP + SSE + Telegram API error logging (LOG-02–LOG-05)
affects:
  - 06-02-PLAN.md
  - 06-03-PLAN.md

tech-stack:
  added: [rotating-file-stream]
  patterns:
    - "pino multistream: pretty stdout in dev via createRequire(pino-pretty); JSON file via rotating-file-stream"
    - "Shared http-log helpers for OpenCode path/method/sessionId without bodies at info"

key-files:
  created:
    - src/opencode/http-log.ts
    - src/bot/middleware/telegram-log.ts
    - src/bot/middleware/telegram-log.test.ts
  modified:
    - src/logger.ts
    - package.json
    - .gitignore
    - src/bot/index.ts
    - src/opencode/session.ts
    - src/opencode/config.ts
    - src/opencode/replies.ts
    - src/opencode/health.ts
    - src/opencode/sse.ts
    - src/main.ts
    - src/rendering/markdown.ts
    - src/bot/handlers/cmd-model.test.ts

key-decisions:
  - "pino-pretty loaded only in non-production via createRequire so production installs can omit devDependencies"
  - "SSE: info log eventType + sessionID per event; delta fields stay at debug; OPENCODE_SSE_VERBOSE unchanged for deep opt-in"
  - "bot.catch distinguishes GrammyError (method, telegramErrorCode, chatId) and HttpError"

patterns-established:
  - "telegramLogMiddleware after allowlist — only allowlisted traffic is logged at info"
  - "OpenCode success: method + pathname + optional sessionId; errors: same plus err, no secrets"

requirements-completed: [LOG-01, LOG-02, LOG-03, LOG-04, LOG-05]

duration: 18min
completed: 2026-03-29
---

# Phase 06 Plan 01: Structured logging (pino + OpenCode + Telegram) Summary

**Pino multistream to stdout and daily-rotating JSON under `logs/`, Telegram LOG-01 middleware after allowlist, OpenCode HTTP/SSE/Telegram API error lines at info without bodies or tokens.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-03-29T09:40:00Z (approx.)
- **Completed:** 2026-03-29T09:58:00Z (approx.)
- **Tasks:** 3
- **Files modified:** 14

## Accomplishments

- Production-grade logger: JSON file rotation + human console in dev (LOG-05 / D-10).
- Incoming Telegram updates logged with userId, chatId, updateType, messageId, timestamp (LOG-01).
- OpenCode `fetch` paths instrumented; SSE emits eventType + sessionID per event at info; Grammy errors surface method and chatId (LOG-02–LOG-04).

## Task Commits

1. **Task 1: Pino dual output + daily rotation under logs/** — `0f71c20` (feat)
2. **Task 2: LOG-01 middleware** — `8c59afe` (feat)
3. **Task 3: LOG-02/03/04 OpenCode HTTP + SSE info** — `3d93b7a` (feat)

**Plan metadata:** Same commit as `docs(06-01): complete structured logging plan` on `main`


## Files Created/Modified

- `src/logger.ts` — multistream, `rotating-file-stream`, dev-only pino-pretty
- `src/opencode/http-log.ts` — `openCodePathname`, `logOpenCodeHttpOk`, `logOpenCodeHttpError`
- `src/bot/middleware/telegram-log.ts` — LOG-01 fields
- `src/bot/middleware/telegram-log.test.ts` — Vitest for message + callback_query
- `src/bot/index.ts` — middleware order; enhanced `bot.catch`
- `src/opencode/session.ts`, `config.ts`, `replies.ts`, `health.ts` — HTTP logging
- `src/opencode/sse.ts` — per-event info + HTTP error on failed SSE open
- `src/main.ts` — removed duplicate SSE debug line
- `.gitignore` — `logs/`
- `src/rendering/markdown.ts` — Table token type assertion (strict typecheck)
- `src/bot/handlers/cmd-model.test.ts` — fetch stub + `makeRegistry(undefined)` for unset catalog test

## Decisions Made

- Avoid top-level `import` of `pino-pretty` in production so `npm ci --omit=dev` does not require it; use `createRequire` in dev only.
- Centralize OpenCode error/success field shape in `http-log.ts`; `session.ts` uses `logger.info` inline for prompt/abort/create paths for clear grep/audit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] TypeScript: Table token in walkTokens callback**

- **Found during:** Task 1 (typecheck)
- **Issue:** `token` in `markdownTablesToFencedCode` not narrowed to `Tokens.Table`
- **Fix:** Cast `token as Tokens.Table` after `token.type === "table"`
- **Files modified:** `src/rendering/markdown.ts`
- **Committed in:** `0f71c20`

**2. [Rule 3 - Blocking] cmd-model test: unset catalog path hung**

- **Found during:** Task 3 (`npm test`)
- **Issue:** `resolveDisplayModel` could hit real `GET /config` / session message fetch when the mocked `getConfig` binding did not apply as expected in isolation, or TCP to localhost stalled; test also needed `makeRegistry(undefined)` to avoid session message fetch.
- **Fix:** `makeRegistry(undefined)`; `vi.stubGlobal("fetch", ...)` in that test with `try/finally` `unstub`
- **Files modified:** `src/bot/handlers/cmd-model.test.ts`
- **Committed in:** `3d93b7a`

**3. [Plan alignment] `logger.info` in `session.ts`**

- **Found during:** Post-commit verification
- **Issue:** Plan acceptance grep expects `logger.info` in `session.ts` (not only `http-log.ts`)
- **Fix:** Inline `logger.info` with `openCodePathname` for POST success paths
- **Files modified:** `src/opencode/session.ts`
- **Committed in:** `3d93b7a` (amend)

---

**Total deviations:** 3 auto-fixed (blocking / alignment)
**Impact on plan:** No scope creep; tests and typecheck required for merge.

## Issues Encountered

None beyond the test timeout above, resolved with fetch stub and registry fix.

## User Setup Required

None — no new env vars for default logging.

## Next Phase Readiness

- Observability baseline in place for photo handler and remaining power-features plans.
- Ready for `06-02-PLAN.md` / `06-03-PLAN.md` execution.

## Self-Check: PASSED

- `06-01-SUMMARY.md` present at `.planning/phases/06-power-features/06-01-SUMMARY.md`
- Task commits on `main`: `0f71c20`, `8c59afe`, `3d93b7a`; planning docs commit follows on `main`

---
*Phase: 06-power-features*
*Completed: 2026-03-29*
