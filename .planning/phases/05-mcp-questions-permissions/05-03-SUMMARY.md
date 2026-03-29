---
phase: 05-mcp-questions-permissions
plan: 03
subsystem: bot
tags: [grammy, mcp, opencode, vitest, sse]

requires:
  - phase: 05-mcp-questions-permissions
    provides: PendingInteractiveState, SSE interactive dispatch, POST question reply
provides:
  - Free-text MCP question answers via message handler (postQuestionReply) before streaming guard
  - PendingInteractiveState.isAwaitingFreeTextAnswer and buildFreeTextQuestionAnswers for multi-question text
  - cancel/switch/new inject pending: clear on MCP-06 lifecycle; rememberSessionChat on session change
  - Tests for D-08 precedence, busy+awaiting edge, cmd clears, SSE-style pending clear
affects:
  - Phase 5 verification and MCP requirement closure

tech-stack:
  added: []
  patterns:
    - "Awaiting free-text branch runs before manager.isBusy; commands stay on bot.command (D-08)"
    - "Idempotent pending.clear; double-clear safe"

key-files:
  created: []
  modified:
    - src/bot/handlers/message.ts
    - src/opencode/interactive-pending.ts
    - src/bot/handlers/cmd-cancel.ts
    - src/bot/handlers/cmd-switch.ts
    - src/bot/handlers/cmd-new.ts
    - src/bot/index.ts
    - src/bot/handlers/message.test.ts
    - src/bot/handlers/cmd-cancel.test.ts
    - src/bot/handlers/cmd-switch.test.ts
    - src/bot/handlers/cmd-new.test.ts
    - src/opencode/interactive-pending.test.ts

key-decisions:
  - "Awaiting + busy: block with same ⏳ copy as streaming guard (do not submit answer)"
  - "Cancel without streaming turn: clear pending and reply ✅ Cancelled when interactive was pending"
  - "No separate SessionChatMap file: PendingInteractiveState.rememberSessionChat already used; switch/new refresh mapping"

requirements-completed: [MCP-02, MCP-06]

duration: 12min
completed: 2026-03-29
---

# Phase 5 Plan 3: MCP free-text path and session clears Summary

**Open-ended question replies post to OpenCode before the busy guard; /cancel, /switch, and /new clear pending interactive state and refresh session→chat mapping for SSE.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-29T10:48:00Z
- **Completed:** 2026-03-29T10:52:00Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- MCP-02: `makeMessageHandler` submits `postQuestionReply` when `isAwaitingFreeTextAnswer`; no new streaming turn for that message.
- MCP-06: `pending.clear` on cancel (including prompt-only cancel), successful switch, and successful new session; `rememberSessionChat` after switch/new for D-11 SSE routing.
- Integration tests: D-08 describe block, `question.replied`-style clear with session map, full `vitest` green.

## Task Commits

1. **Task 1: session index + message handler awaiting branch** — `19492fe` (feat)
2. **Task 2: Clear pending on cancel, switch, new + tests** — `1b87f48` (feat)
3. **Task 3: Integration tests + full suite** — `76d1a4d` (test)

**Plan metadata:** docs completion commit adds this SUMMARY alongside STATE/ROADMAP updates

## Files Created/Modified

- `src/opencode/interactive-pending.ts` — `isAwaitingFreeTextAnswer`
- `src/bot/handlers/message.ts` — awaiting branch, `buildFreeTextQuestionAnswers`, `postQuestionReply`
- `src/bot/handlers/cmd-cancel.ts` — pending inject; clear on abort and prompt-only dismiss
- `src/bot/handlers/cmd-switch.ts` — `clear` + `rememberSessionChat` on successful switch
- `src/bot/handlers/cmd-new.ts` — `clear` + `rememberSessionChat` after `createNamed`
- `src/bot/index.ts` — wire `pending` into new/switch/cancel
- `*.test.ts` — mocks and assertions for clears, D-08, SSE pending clear

## Decisions Made

- Block free-text submit when `isBusy` (same UX as concurrent prompts) instead of clearing awaiting state.
- Dismiss interactive-only cancel with the same “✅ Cancelled.” copy as streaming cancel for consistency.

## Deviations from Plan

None - plan executed exactly as written. No separate `src/session/session-chat-map.ts`: `PendingInteractiveState` already maintains `sessionID`→`chatId` (`rememberSessionChat` / `getChatForSession`); switch/new now refresh the mapping.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 5 plans 01–03 implemented; remaining roadmap verification/UAT for MCP surface area as needed.

---
*Phase: 05-mcp-questions-permissions*
*Completed: 2026-03-29*

## Self-Check: PASSED

- [x] `.planning/phases/05-mcp-questions-permissions/05-03-SUMMARY.md` exists
- [x] Commits `19492fe`, `1b87f48`, `76d1a4d` (feat/test) + docs completion commit on branch
- [x] `npx vitest run` exit 0 after Task 3
