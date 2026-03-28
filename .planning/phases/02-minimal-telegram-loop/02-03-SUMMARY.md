---
phase: 02-minimal-telegram-loop
plan: 03
subsystem: bot-integration
tags: [message-handler, streaming, integration, grammy, opencode]
dependency_graph:
  requires: [02-01, 02-02]
  provides: [complete-telegram-loop, message-handler, bot-wiring]
  affects: [src/bot/handlers/message.ts, src/bot/index.ts, src/main.ts, src/opencode/streaming-state.ts, src/opencode/sse.ts]
tech_stack:
  added: []
  patterns: [factory-function, dependency-injection, concurrency-guard]
key_files:
  created:
    - src/bot/handlers/message.ts
  modified:
    - src/bot/index.ts
    - src/main.ts
    - src/opencode/streaming-state.ts
    - src/opencode/sse.ts
    - vitest.config.ts
decisions:
  - "createBot(manager) factory pattern used in bot/index.ts for dependency injection"
  - "endAllTurnsWithError added to StreamingStateManager for D-07 SSE disconnect handling"
  - "onError callback added to SseOptions to propagate SSE errors to manager"
  - "clearMocks: true added to vitest config — test file relied on fresh mock call counts per test"
metrics:
  duration: ~10min
  completed: 2026-03-28
  tasks: 2
  files: 6
---

# Phase 02 Plan 03: Integration Wiring Summary

**One-liner:** Complete minimal Telegram loop via makeMessageHandler factory + StreamingStateManager + SSE onError wiring.

## What Was Built

The integration layer connecting all Phase 2 components into a working end-to-end flow:

1. **`src/bot/handlers/message.ts`** — `makeMessageHandler(manager, openCodeUrl)` factory. Implements concurrency guard (D-08: busy check before typing action), auto-session creation (D-01), ⏳ Thinking... initial message, and error handling for both session creation and prompt failures.

2. **`src/bot/index.ts`** — Replaced Phase 1 echo handler with `createBot(manager)` factory. Bot now accepts `StreamingStateManager` via dependency injection; `makeMessageHandler` is wired to `message:text` events.

3. **`src/main.ts`** — Instantiates `StreamingStateManager`, passes it to `createBot()`, routes SSE events via `manager.handleEvent(event, bot.api)`. Wires D-07 SSE disconnect error path: `onError` callback calls `manager.endAllTurnsWithError(bot.api, errorText)`.

4. **`src/opencode/streaming-state.ts`** — Added `endAllTurnsWithError(api, errorText)` method that edits all active turn messages to the error text and clears busy state.

5. **`src/opencode/sse.ts`** — Added optional `onError` callback to `SseOptions` type; invoked in the catch block when SSE disconnects.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Mock call history not cleared between tests**
- **Found during:** Task 1 TDD RED → GREEN transition
- **Issue:** `message.test.ts` "reuses existing session" test checked `expect(createSession).not.toHaveBeenCalled()` but vitest doesn't auto-clear mock call counts between tests by default. The `beforeEach` only set `mockResolvedValue` without clearing counts, so the call from the previous test leaked into the assertion.
- **Fix:** Added `clearMocks: true` to `vitest.config.ts` — ensures mock call history is cleared before each test globally.
- **Files modified:** `vitest.config.ts`
- **Commit:** 67df4d3

## Known Stubs

None — all data flows are wired.

## Self-Check

- [x] `src/bot/handlers/message.ts` exists and exports `makeMessageHandler`
- [x] `src/bot/index.ts` exports `createBot`, no echo handler
- [x] `src/main.ts` contains `manager.handleEvent` and `endAllTurnsWithError`
- [x] `npm test` — 42/42 tests passing
- [x] `npx tsc --noEmit` — exits 0
