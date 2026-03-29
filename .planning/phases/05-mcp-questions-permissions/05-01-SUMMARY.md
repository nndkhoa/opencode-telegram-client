---
phase: 05-mcp-questions-permissions
plan: 01
subsystem: api
tags: [opencode, sse, mcp, vitest, fetch]

requires:
  - phase: 04-session-commands
    provides: SessionRegistry active session per chat
provides:
  - Discriminated OpenCodeEvent types for question.* and permission.* SSE payloads
  - PendingInteractiveState (D-10/D-11, MCP-06 clear hooks)
  - postQuestionReply / postPermissionReply HTTP clients
affects:
  - 05-02-PLAN (SSE dispatch and Telegram UI)
  - 05-03-PLAN (free-text path and integration)

tech-stack:
  added: []
  patterns:
    - "SDK-aligned event unions + type guards for SSE narrowing"
    - "Per-chat pending map with callback token registry for Telegram 64-byte limit"

key-files:
  created:
    - src/opencode/interactive-pending.ts
    - src/opencode/interactive-pending.test.ts
    - src/opencode/replies.ts
    - src/opencode/replies.test.ts
    - src/opencode/events.test.ts
  modified:
    - src/opencode/events.ts

key-decisions:
  - "Interactive SSE shapes follow anomalyco/opencode SDK Event types (QuestionRequest, PermissionRequest, reply events)"
  - "Question reply body uses answers as string[][] (QuestionAnswer[] per OpenAPI)"
  - "Permission reply body uses reply once|always|reject with optional message per D-01–D-04"

patterns-established:
  - "Type guards isQuestionAsked / isPermissionAsked / isQuestionReplied / isQuestionRejected / isPermissionReplied"
  - "shouldHandleForChat(chatId, eventSessionId, registry) for D-11 active-session gate"

requirements-completed: [MCP-03, MCP-05, MCP-06]

duration: 3min
completed: 2026-03-29
---

# Phase 5 Plan 1: MCP SSE types, pending state, reply clients Summary

**Typed question/permission SSE unions (OpenCode SDK–aligned), per-chat PendingInteractiveState with latest-wins and active-session gate, and fetch-based POST clients for `/question/{id}/reply` and `/permission/{id}/reply`.**

## Performance

- **Duration:** 3 min (executor wall time)
- **Started:** 2026-03-29T10:41:50Z
- **Completed:** 2026-03-29T10:44:30Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Extended `OpenCodeEvent` with `question.asked`, `permission.asked`, `question.replied`, `question.rejected`, `permission.replied` and exported type guards.
- Implemented `PendingInteractiveState` with D-10 replacement, D-11 `shouldHandleForChat`, `clear` / question lifecycle clears, multi-select toggles, pagination offset, and short callback tokens.
- Added `postQuestionReply` and `postPermissionReply` mirroring `session.ts` fetch patterns (JSON, no Telegram imports).

## Task Commits

1. **Task 1: Discriminated SSE types** — `cef2777` (feat)
2. **Task 2: PendingInteractiveState** — `73d58b9` (feat)
3. **Fix: events.test strict narrowing for `tsc`** — `176e23c` (fix)
4. **Task 3: Reply HTTP clients** — `d6313a2` (feat)

**Plan metadata:** `9ce7c4c` (docs: complete plan)

_Note: Extra fix commit after Task 1 tests so `npm run build` passes strict TypeScript._

## Files Created/Modified

- `src/opencode/events.ts` — Interactive event types, guards, `getSessionIdFromAsked` helper
- `src/opencode/events.test.ts` — JSON fixtures for interactive events
- `src/opencode/interactive-pending.ts` — Pending state machine and callback registry
- `src/opencode/interactive-pending.test.ts` — D-10, D-11, clear, toggle, token tests
- `src/opencode/replies.ts` — `postQuestionReply`, `postPermissionReply`
- `src/opencode/replies.test.ts` — Mocked fetch URL/body assertions

## Decisions Made

- Matched OpenCode SDK `Event` shapes from `types.gen.ts` for `question.asked` / `permission.asked` payloads (including `PermissionRequest` fields used in tests).
- Kept a final `OpenCodeEvent` catch-all `{ type: string; ... }` for unknown future event types.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Strict TypeScript in `events.test.ts` after Task 1**
- **Found during:** Task 1 verification (`npm run build`)
- **Issue:** `parseEvent` return type and `OpenCodeEvent` union prevented narrowing inside tests; `tsc` failed.
- **Fix:** Use `if (!ev) return` after null check and rely on type guards without casts.
- **Files modified:** `src/opencode/events.test.ts`
- **Verification:** `npm run build` passes
- **Commit:** `176e23c`

---

**Total deviations:** 1 auto-fixed (blocking)
**Impact on plan:** Test-only fix; no API change.

## Issues Encountered

None beyond strict `tsc` on tests (resolved in fix commit).

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Ready for **05-02**: wire SSE dispatch and Telegram keyboards to these types and clients.
- Live `question.asked` / `permission.asked` payloads should still be validated against `GET /doc` on the installed OpenCode (noted in STATE blockers).

## Self-Check: PASSED

- `src/opencode/events.ts`, `events.test.ts`, `interactive-pending.ts`, `interactive-pending.test.ts`, `replies.ts`, `replies.test.ts` exist on disk.
- Commits `cef2777`, `73d58b9`, `176e23c`, `d6313a2` present in history.

---
*Phase: 05-mcp-questions-permissions*
*Completed: 2026-03-29*
