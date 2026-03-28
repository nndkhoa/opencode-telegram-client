---
phase: 02-minimal-telegram-loop
plan: "01"
subsystem: opencode-events
tags: [events, sse, tdd, test-scaffolds, type-fix]
dependency_graph:
  requires: []
  provides: [correct-event-types, wave2-test-contracts]
  affects: [src/opencode/sse.ts, src/main.ts]
tech_stack:
  added: []
  patterns: [properties-nested-sse-events, tdd-red-state]
key_files:
  created:
    - src/opencode/session.test.ts
    - src/opencode/streaming-state.test.ts
    - src/bot/handlers/message.test.ts
  modified:
    - src/opencode/events.ts
    - src/opencode/sse.ts
    - src/main.ts
decisions:
  - "Live OpenCode 1.3.3 SSE events use properties-nested shape: { type, properties: { sessionID, ... } } — not top-level sessionID"
  - "Catch-all union variant uses properties?: Record<string, unknown> to avoid TypeScript index signature conflicts"
metrics:
  duration: 8m
  completed_date: "2026-03-28"
requirements:
  - MSG-01
  - MSG-02
  - MSG-03
  - MSG-04
  - MSG-07
---

# Phase 02 Plan 01: Fix SSE Event Types + Test Scaffolds Summary

**One-liner:** Corrected live OpenCode 1.3.3 SSE event shape (`properties`-nested sessionID) and created three RED test scaffold files establishing behavioral contracts for Wave 2.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Fix events.ts — correct live SSE event shapes | `5d451a7` | events.ts, sse.ts, main.ts |
| 2 | Create test scaffolds (RED state) for Wave 2 | `72891cf` | session.test.ts, streaming-state.test.ts, message.test.ts |

## What Was Built

### Task 1: Corrected events.ts

Replaced the wrong `OpenCodeEvent` type (which had `sessionID` at top level) with the live-verified shape:

- `MessagePartDeltaEvent`: `{ type: "message.part.delta", properties: { sessionID, messageID, partID, field, delta } }`
- `SessionIdleEvent`: `{ type: "session.idle", properties: { sessionID } }`
- Updated `sse.ts` and `main.ts` to use `event.properties?.sessionID` pattern

### Task 2: Test Scaffolds (RED State)

Three test files created with failing tests — implementations do not exist yet (Wave 2):

1. **`src/opencode/session.test.ts`**: Tests `createSession` (POST /session) and `sendPromptAsync` (POST /session/:id/prompt_async)
2. **`src/opencode/streaming-state.test.ts`**: Tests `StreamingStateManager` — session management, busy state, delta buffering, 500ms throttle, session.idle final message
3. **`src/bot/handlers/message.test.ts`**: Tests `makeMessageHandler` — typing action, concurrency guard, session auto-creation, error handling

## Verification

- `npx tsc --noEmit` exits 0 (no type errors)
- `npm test` exits non-zero: 3 test files fail (module not found — expected RED), 18 existing tests pass
- No regressions in Phase 1 test suite
- `grep -r "event.sessionID" src/` returns no matches (all usages updated)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `src/opencode/events.ts` — FOUND (exports MessagePartDeltaEvent, SessionIdleEvent, OpenCodeEvent, parseEvent)
- `src/opencode/session.test.ts` — FOUND
- `src/opencode/streaming-state.test.ts` — FOUND
- `src/bot/handlers/message.test.ts` — FOUND
- Commit `5d451a7` — FOUND
- Commit `72891cf` — FOUND
- TypeScript compilation — PASSED
- 18 original tests — PASSING
- 3 new test files — FAILING (RED state confirmed)
