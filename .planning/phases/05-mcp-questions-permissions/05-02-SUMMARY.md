---
phase: 05-mcp-questions-permissions
plan: 02
subsystem: api
tags: [grammY, SSE, MCP, Telegram, OpenCode]

requires:
  - phase: 05-mcp-questions-permissions
    provides: "05-01 PendingInteractiveState, reply HTTP clients, SSE types"
provides:
  - "SSE fan-out to interactive-dispatch for question/permission + lifecycle events"
  - "Telegram inline keyboards (permission 3-way, single/multi question + pagination)"
  - "callback_query handlers posting to OpenCode reply endpoints with allowlist order"
affects:
  - "05-03 (free-text question submit, command clears)"

tech-stack:
  added: []
  patterns:
    - "Session→chat map on PendingInteractiveState + message handler rememberSessionChat"
    - "Async SSE onEvent awaited so dispatch runs after StreamingStateManager"

key-files:
  created:
    - src/opencode/interactive-dispatch.ts
    - src/opencode/interactive-dispatch.test.ts
    - src/bot/handlers/callback-interactive.ts
    - src/bot/handlers/callback-interactive.test.ts
  modified:
    - src/main.ts
    - src/bot/index.ts
    - src/bot/handlers/message.ts
    - src/opencode/interactive-pending.ts
    - src/opencode/sse.ts

key-decisions:
  - "QUESTION_OPTIONS_PAGE_SIZE=8 for D-07 pagination before Next/Prev"
  - "Multi sub-question with options uses plain-text numbered fallback + awaitingFreeText until 05-03"
  - "SSE readSseLoop awaits onEvent so interactive Telegram send runs after stream manager"

requirements-completed: [MCP-01, MCP-02, MCP-04]

duration: 18min
completed: 2026-03-29
---

# Phase 05 Plan 02: MCP interactive Telegram UI Summary

**SSE-driven inline keyboards for permission (Once/Always/Reject) and structured questions (single/multi-select, 8-option pages), with callback_query handlers posting to OpenCode reply routes and session-scoped pending state.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-03-29T10:44:00Z
- **Completed:** 2026-03-29T10:47:00Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments

- `dispatchInteractiveOpenCodeEvent` gates on active session (D-11), replaces prior prompt message (D-10), and sends keyboards or free-text placeholders for open-ended / multi-question fallback.
- `makeCallbackInteractiveHandler` maps short callback tokens to `postPermissionReply` / `postQuestionReply`, with one `answerCallbackQuery` in `finally`.
- `rememberSessionChat` on first registry session resolution so SSE can resolve `chatId` before interactive events.

## Task Commits

1. **Task 1: Interactive dispatch from SSE** — `496c23c` (feat)
2. **Task 2: callback_query handlers + HTTP reply wiring** — `5bfcbe1` (feat)

**Plan metadata:** `4f46268` (docs: complete plan)

## Files Created/Modified

- `src/opencode/interactive-dispatch.ts` — SSE→Telegram for asked/replied/rejected; permission + question keyboards; `shouldDispatchForSession` / `getActiveSessionId` (D-11).
- `src/opencode/interactive-dispatch.test.ts` — D-11 helper tests, permission keyboard labels, lifecycle clear, pagination presence.
- `src/bot/handlers/callback-interactive.ts` — Permission + question callbacks; session active check; pagination/toggle edits.
- `src/bot/handlers/callback-interactive.test.ts` — Permission once, question pick, session mismatch.
- `src/main.ts` — `PendingInteractiveState`, `await` manager + dispatch on SSE event.
- `src/bot/index.ts` — `createBot(..., pending, openCodeUrl)`, `callback_query` registration.
- `src/bot/handlers/message.ts` — `rememberSessionChat` after `getOrCreateDefault`.
- `src/opencode/interactive-pending.ts` — `sessionToChat`, `awaitingFreeText` / `questionInfos`, `clearOnPermissionReplied`.
- `src/opencode/sse.ts` — `onEvent` may return `Promise<void>` and is awaited in the reader loop.

## Decisions Made

- Pagination threshold documented as **8 options per page** (`QUESTION_OPTIONS_PAGE_SIZE`).
- Only **one** `QuestionInfo` with non-empty options uses full inline keyboard; multiple sub-questions use numbered plain-text fallback and `awaitingFreeText` for 05-03.
- Callback tokens accumulate on rebuild (pagination/toggle); acceptable for local bot scope.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Await async SSE `onEvent` in `readSseStream`**

- **Found during:** Task 1 (ordering vs `StreamingStateManager`)
- **Issue:** Fire-and-forget async `onEvent` could reorder relative to `handleEvent`.
- **Fix:** `SseOptions.onEvent` typed as `void | Promise<void>`; `await Promise.resolve(onEvent?.(event))` per SSE line.
- **Files modified:** `src/opencode/sse.ts`
- **Verification:** `npx vitest run` (full suite)
- **Committed in:** `496c23c`

---

**Total deviations:** 1 auto-fixed (blocking)

**Impact on plan:** Required for deterministic dispatch ordering; no product scope change.

## Issues Encountered

None.

## User Setup Required

None — no new env or services.

## Next Phase Readiness

- **05-03:** Wire non-command text to `postQuestionReply` when `awaitingFreeText`; clear pending on `/cancel` / session switch per MCP-06 (partially from 05-01).
- **Gap:** If OpenCode emits `question.asked` before any user message established `session→chat`, dispatch skips (logged); 05-03 may add mapping from concurrent paths if needed.

## Known Stubs

- **`awaitingFreeText`:** Plain-text prompts are sent with note that free-text submit arrives in 05-03 (`interactive-dispatch.ts` message copy). Intentional until 05-03.

---

## Self-Check: PASSED

- `.planning/phases/05-mcp-questions-permissions/05-02-SUMMARY.md` exists.
- Commits `496c23c`, `5bfcbe1` present on branch.

---
*Phase: 05-mcp-questions-permissions*

*Completed: 2026-03-29*
