---
phase: 01-foundation
plan: 03
subsystem: bot
tags: [grammy, telegram, middleware, allowlist, typescript]

# Dependency graph
requires:
  - phase: 01-foundation plan 01
    provides: config singleton (config.botToken, config.allowedUserIds, config.openCodeUrl), logger
  - phase: 01-foundation plan 02
    provides: checkHealth(), startSseLoop() with AbortSignal support
provides:
  - dmOnlyMiddleware: silently drops non-private chat updates (groups, channels)
  - allowlistMiddleware: rejects unlisted user IDs with exact rejection message, handles callback query spinner
  - bot: grammY Bot instance with dm-only → allowlist middleware chain
  - main.ts: full bootstrap entrypoint — config → health check → SSE + bot concurrently
affects: [02-sessions, 03-streaming, all future phases using bot instance]

# Tech tracking
tech-stack:
  added: [grammy]
  patterns: [middleware chain pattern (dm-only → allowlist → handlers), TDD red-green for middleware, factory function for parameterized middleware, AbortController for concurrent service lifecycle]

key-files:
  created:
    - src/bot/middleware/dm-only.ts
    - src/bot/middleware/allowlist.ts
    - src/bot/middleware/allowlist.test.ts
    - src/bot/index.ts
    - src/main.ts
  modified: []

key-decisions:
  - "dmOnlyMiddleware runs BEFORE allowlistMiddleware — groups can't DoS allowlist check (D-04)"
  - "answerCallbackQuery() called for blocked callback queries — prevents stuck loading spinner (ACC-02)"
  - "allowlistMiddleware is a factory function accepting Set<number> — enables test isolation without config import"
  - "main.ts wires bot.start() as blocking call; SSE runs as void background task with shared AbortController"

patterns-established:
  - "Pattern 1: Middleware order enforcement — always DM gate before allowlist gate"
  - "Pattern 2: Callback query handling — always answerCallbackQuery() before returning on blocked updates"
  - "Pattern 3: Parameterized middleware factory — pass dependencies explicitly, not via config import"

requirements-completed: [ACC-01, ACC-02]

# Metrics
duration: 12min
completed: 2026-03-28
---

# Phase 01 Plan 03: Bot Middleware & Bootstrap Summary

**grammY bot with DM-only gate and Set-based allowlist middleware, wired into full bootstrap entrypoint that runs config → health check → SSE loop + long-polling bot concurrently**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-03-28T20:32:00Z
- **Completed:** 2026-03-28T20:34:00Z
- **Tasks:** 2 (+ TDD RED commit)
- **Files modified:** 5 created

## Accomplishments
- `dmOnlyMiddleware`: silently drops all non-private chat updates before allowlist runs
- `allowlistMiddleware`: blocks unlisted users with exact rejection text; calls `answerCallbackQuery()` for callback queries to prevent stuck spinners (ACC-02)
- `src/bot/index.ts`: grammY Bot instance with correct middleware chain (dm-only → allowlist) and Phase 1 echo handler
- `src/main.ts`: full bootstrap — config validation → health check → SSE background loop + bot long-polling with graceful shutdown via AbortController
- All 18 tests pass (config: 6, health: 2, SSE: 3, bot middleware: 7)

## Task Commits

Each task was committed atomically:

1. **TDD RED: Failing middleware tests** - `017e671` (test)
2. **Task 1: dm-only + allowlist middleware implementation** - `aa7e610` (feat)
3. **Task 2: bot/index.ts + main.ts** - `e56450d` (feat)

## Files Created/Modified
- `src/bot/middleware/dm-only.ts` - Rejects non-private chat updates silently
- `src/bot/middleware/allowlist.ts` - Rejects unlisted user IDs; handles callback spinner via answerCallbackQuery
- `src/bot/middleware/allowlist.test.ts` - 7 unit tests covering all middleware behaviors
- `src/bot/index.ts` - grammY Bot instance with dm-only → allowlist chain, Phase 1 echo handler
- `src/main.ts` - Bootstrap entrypoint: config → health → SSE + bot, graceful SIGINT/SIGTERM shutdown

## Decisions Made
- `allowlistMiddleware` implemented as factory function (`allowlistMiddleware(allowed: Set<number>)`) — enables unit testing without triggering the config singleton import that calls `process.exit(1)`
- Middleware order enforced at code level: `bot.use(dmOnlyMiddleware)` appears before `bot.use(allowlistMiddleware(...))` on adjacent lines
- SSE runs as a `void` background task (`const sseTask = startSseLoop(...)`) — `bot.start()` blocks until bot is stopped, then `sseTask` is awaited for clean SSE shutdown

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required beyond `.env` file (established in Plan 01).

## Next Phase Readiness
- Phase 1 complete: full process runs end-to-end — config validates, health checks OpenCode, SSE loop starts, bot accepts/rejects users
- Phase 2 (sessions) can import `bot` from `src/bot/index.ts` and add session handlers after the existing middleware chain
- Echo handler in `src/bot/index.ts` is a placeholder — Phase 2 will replace it with real session routing

## Self-Check: PASSED

- `src/bot/middleware/dm-only.ts` — FOUND
- `src/bot/middleware/allowlist.ts` — FOUND
- `src/bot/middleware/allowlist.test.ts` — FOUND
- `src/bot/index.ts` — FOUND
- `src/main.ts` — FOUND
- Commit `017e671` (test RED) — FOUND
- Commit `aa7e610` (feat middleware) — FOUND
- Commit `e56450d` (feat bot+main) — FOUND

---
*Phase: 01-foundation*
*Completed: 2026-03-28*
