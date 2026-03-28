---
phase: 02-minimal-telegram-loop
plan: "02"
subsystem: opencode-client
tags: [session, streaming, state-management, throttle, grammy]
dependency_graph:
  requires: [02-01]
  provides: [02-03]
  affects: []
tech_stack:
  added: []
  patterns: [fetch-based-client, throttled-streaming, discriminated-union-narrowing]
key_files:
  created:
    - src/opencode/session.ts
    - src/opencode/streaming-state.ts
  modified: []
decisions:
  - "Cast to specific union member (MessagePartDeltaEvent, SessionIdleEvent) after type check — catch-all { type: string } in OpenCodeEvent union prevents TypeScript discriminated union narrowing"
  - "endTurn called BEFORE editMessageText in session.idle handler to eliminate race with throttled edits"
  - "turns map is non-private (not readonly) to allow test access via type assertion"
metrics:
  duration: "~8 minutes"
  completed: "2026-03-28T14:32:20Z"
  tasks_completed: 2
  files_changed: 2
---

# Phase 02 Plan 02: OpenCode Client Modules Summary

Session creation, prompt submission, and throttled streaming state management — the core business logic layer for the Telegram-OpenCode loop.

## What Was Built

### Task 1: src/opencode/session.ts

HTTP client functions for OpenCode session lifecycle:
- `createSession(baseUrl)` — POSTs to `/session`, returns session ID string
- `sendPromptAsync(baseUrl, sessionId, text)` — POSTs parts payload to `/session/:id/prompt_async`, handles 204 No Content as success

### Task 2: src/opencode/streaming-state.ts

`StreamingStateManager` class with full event handling:
- Per-chatId session registry (`getSession`/`setSession`)
- Per-chatId busy flag (`isBusy`, managed by `startTurn`/`endTurn`)
- Per-sessionId `TurnState` with text buffer and throttle timestamp
- `handleEvent(event, bot)` — routes `message.part.delta` (throttled edits with ⏳ prefix) and `session.idle` (final clean message, `endTurn` first)

## Test Results

All Wave 2 tests turned GREEN:
- `session.test.ts`: 5/5 passed
- `streaming-state.test.ts`: 11/11 passed
- Phase 01 tests: all still passing (no regressions)

Note: `message.test.ts` (Plan 03 scaffold) remains RED — expected, as `message.ts` is Plan 03's deliverable.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript union type narrowing failure in streaming-state.ts**
- **Found during:** Task 2 TypeScript check
- **Issue:** `OpenCodeEvent` union includes catch-all `{ type: string; properties?: Record<string, unknown> }` — TypeScript cannot narrow the discriminated union after `event.type === "message.part.delta"` check because the catch-all subsumes the specific types
- **Fix:** Cast to specific union members after type check: `(event as MessagePartDeltaEvent).properties` and `(event as SessionIdleEvent).properties`; imported `MessagePartDeltaEvent` and `SessionIdleEvent` types explicitly
- **Files modified:** `src/opencode/streaming-state.ts`
- **Commit:** f2442dc

## Self-Check

- [x] `src/opencode/session.ts` exists
- [x] `src/opencode/streaming-state.ts` exists
- [x] All session tests pass (5/5)
- [x] All streaming-state tests pass (11/11)
- [x] TypeScript errors limited to Plan 03 scaffold only
- [x] Commits f9bbc50 and f2442dc exist

## Self-Check: PASSED
