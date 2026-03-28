---
phase: 04-session-commands
plan: 02
subsystem: session-management
tags: [refactor, session-registry, streaming-state, tdd]
dependency_graph:
  requires: [04-01]
  provides: [04-03, 04-04]
  affects: [src/opencode/streaming-state.ts, src/opencode/session.ts, src/bot/handlers/message.ts, src/bot/index.ts, src/main.ts]
tech_stack:
  added: []
  patterns: [constructor-injection, registry-pattern, tdd]
key_files:
  created: []
  modified:
    - src/opencode/streaming-state.ts
    - src/opencode/streaming-state.test.ts
    - src/opencode/session.ts
    - src/opencode/session.test.ts
    - src/bot/handlers/message.ts
    - src/bot/handlers/message.test.ts
    - src/bot/index.ts
    - src/main.ts
decisions:
  - "StreamingStateManager.sessions Map removed — SessionRegistry owns all chat→session mapping"
  - "makeMessageHandler signature changed to (registry, manager, openCodeUrl) — registry first for clarity"
  - "abortSession resolves on 404 (session already gone is not an error)"
metrics:
  duration: ~12 minutes
  completed: 2026-03-28
  tasks: 2
  files: 8
---

# Phase 04 Plan 02: Registry Wiring + abortSession Summary

**One-liner:** Wired SessionRegistry into StreamingStateManager and message handler; added abortSession() and getTurn() for cancel command support.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add abortSession() + getTurn()/TurnState export | 13f9e43 | session.ts, session.test.ts, streaming-state.ts, streaming-state.test.ts |
| 2 | Refactor StreamingStateManager + message handler to use SessionRegistry | 6c9df82 | streaming-state.ts, streaming-state.test.ts, message.ts, message.test.ts, index.ts, main.ts |

## What Was Built

- **`abortSession(baseUrl, sessionId)`** — POSTs to `/session/:id/abort`, resolves on 200/404, throws on other errors. Ready for use by `/cancel` command handler (Plan 04).
- **`getTurn(sessionId)`** — Public method on `StreamingStateManager` returns `TurnState | undefined`. Exposes turn state for cancel handler to find the Telegram message to edit.
- **`export type TurnState`** — Type exported so command handlers can type-check turn state without internal access.
- **`StreamingStateManager(registry)`** — Constructor now accepts `SessionRegistry`. Internal `sessions` Map and `getSession()`/`setSession()` methods removed. All session lookups now delegate to registry.
- **`makeMessageHandler(registry, manager, openCodeUrl)`** — Replaced `manager.getSession/setSession` + `createSession` calls with single `registry.getOrCreateDefault(chatId, openCodeUrl)`. Cleaner error handling path.
- **`createBot(registry, manager)`** — Updated signature to accept registry as first arg.
- **`main.ts`** — Creates `SessionRegistry` before `StreamingStateManager`, passes to both.

## Verification

```
npx vitest run         → 81 tests passing (9 test files)
npx tsc --noEmit       → exit 0 (no type errors)
grep getSession/setSession streaming-state.ts → (none — removed)
grep getOrCreateDefault message.ts → line 29 (1 match)
grep abortSession session.ts → line 30 (function definition)
grep getTurn streaming-state.ts → line 51 (public method)
```

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all connections are live (registry wired to session creation, message handler uses real registry path).

## Self-Check: PASSED

- `src/opencode/session.ts` contains `export async function abortSession(` ✓
- `src/opencode/streaming-state.ts` contains `export type TurnState` and `getTurn(sessionId: string)` ✓
- `src/bot/handlers/message.ts` contains `getOrCreateDefault` ✓
- `src/bot/index.ts` signature contains `registry: SessionRegistry` ✓
- `src/main.ts` contains `new SessionRegistry()` ✓
- Commits 13f9e43 and 6c9df82 exist ✓
