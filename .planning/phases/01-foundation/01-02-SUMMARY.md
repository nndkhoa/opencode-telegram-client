---
phase: 01-foundation
plan: 02
subsystem: infra
tags: [fetch-event-source, sse, opencode, vitest, typescript]

# Dependency graph
requires:
  - phase: 01-01
    provides: src/logger.ts logger export and src/config/env.ts Config type
provides:
  - checkHealth(baseUrl) function in src/opencode/health.ts
  - startSseLoop({ baseUrl, signal, onEvent }) in src/opencode/sse.ts
  - OpenCodeEvent discriminated union + parseEvent() in src/opencode/events.ts
affects: [02-bot, 03-sessions, 04-streaming, 05-mcp]

# Tech tracking
tech-stack:
  added: ["@microsoft/fetch-event-source (SSE transport)"]
  patterns:
    - "baseUrl passed as parameter (not imported from config) for testability"
    - "Outer while loop with exponential backoff wrapping fetchEventSource"
    - "AbortController signal threading through SSE options for clean shutdown"
    - "vi.mock + signal-aware mock implementations for async SSE tests"

key-files:
  created:
    - src/opencode/events.ts
    - src/opencode/health.ts
    - src/opencode/health.test.ts
    - src/opencode/sse.ts
    - src/opencode/sse.test.ts
  modified: []

key-decisions:
  - "baseUrl passed as parameter to checkHealth() and startSseLoop() — not imported from config singleton — for test isolation"
  - "openWhenHidden: true in fetchEventSource prevents visibility API pauses in Node.js environment"
  - "backoffDelay uses 1s base, 60s max, ±20% jitter to spread reconnects"
  - "Test mocks resolve on signal abort (via opts.signal listener) to prevent infinite hangs in Vitest"

patterns-established:
  - "SSE Pattern: outer while(!signal.aborted) loop + fetchEventSource onerror throws to break internal retry"
  - "URL construction: new URL('/path', baseUrl) avoids trailing-slash concatenation bugs"
  - "TDD: write failing test first, implement minimal code, verify all pass"

requirements-completed: [INFRA-04]

# Metrics
duration: 8min
completed: 2026-03-28
---

# Phase 01 Plan 02: OpenCode HTTP Transport Summary

**SSE event loop with exponential backoff reconnect and health check using @microsoft/fetch-event-source, tested with signal-aware Vitest mocks**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-28T13:28:00Z
- **Completed:** 2026-03-28T13:29:53Z
- **Tasks:** 2
- **Files modified:** 5 (all created)

## Accomplishments

- `checkHealth(baseUrl)` GETs `/global/health` using `new URL()` (avoids trailing-slash bugs), throws on non-2xx with status code in message
- `startSseLoop({ baseUrl, signal, onEvent })` — single shared SSE connection to `/event` with `openWhenHidden: true`, outer while-loop with exponential backoff (1s base, 60s max, ±20% jitter), clean abort via AbortController
- `OpenCodeEvent` discriminated union covering `session.created`, `session.deleted`, `part.delta`, `part.updated`, plus catch-all; `parseEvent()` returns null on invalid JSON
- 5 unit tests pass: 2 health (200 returns body, 503 throws with status), 3 SSE (reconnects after error, delivers parsed events, stops on abort)

## Task Commits

Each task was committed atomically:

1. **Task 1: OpenCode event types + health check** - `dab9122` (feat)
2. **Task 2: SSE loop with exponential backoff reconnect + unit tests** - `739e982` (feat)

## Files Created/Modified

- `src/opencode/events.ts` - OpenCodeEvent discriminated union + parseEvent()
- `src/opencode/health.ts` - checkHealth(baseUrl) with new URL + logger
- `src/opencode/health.test.ts` - 2 unit tests with vi.stubGlobal fetch mocks
- `src/opencode/sse.ts` - startSseLoop() with fetchEventSource, backoff loop, abort handling
- `src/opencode/sse.test.ts` - 3 unit tests with signal-aware vi.mock for fetchEventSource

## Decisions Made

- **baseUrl as parameter (not config import):** Both `checkHealth` and `startSseLoop` take `baseUrl` as a parameter rather than importing from the config singleton. This keeps modules testable without triggering `process.exit(1)` from the config module.
- **openWhenHidden: true:** Required in Node.js — without it, the browser Page Visibility API default causes SSE to pause since Node has no "visible tab".
- **Signal-aware test mocks:** Vitest SSE tests needed `opts.signal.addEventListener("abort", resolve)` in mock implementations to prevent infinite hangs when the test aborts. Discovered during RED→GREEN cycle and fixed inline.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Vitest SSE test mocks caused infinite hangs on abort**
- **Found during:** Task 2 (SSE loop unit tests)
- **Issue:** Plan's test code used `return new Promise(() => {})` for "hanging" fetchEventSource mocks, but when the AbortController was signaled, the mock promise never resolved, causing `loopPromise` to hang indefinitely and tests to timeout at 5s
- **Fix:** Updated mocks to listen on `opts.signal` and resolve when aborted: `opts.signal?.addEventListener("abort", () => resolve(), { once: true })`. Also added `timeout: 10000` to the reconnect test (backoff delay is ~1000ms base)
- **Files modified:** src/opencode/sse.test.ts
- **Verification:** All 3 SSE tests pass; test suite completes in ~1.5s
- **Committed in:** `739e982` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug in test implementation)
**Impact on plan:** Fix was necessary for tests to actually complete. The implementation (sse.ts) required no changes — only the test mock strategy.

## Issues Encountered

- Vitest default `testTimeout` is 5000ms which was too short for the reconnect test (waits 1200ms for backoff + reconnect). Fixed with explicit `timeout: 10000` per-test override.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `checkHealth` and `startSseLoop` are ready to be wired into `src/main.ts` (Phase 1 Plan 03)
- `OpenCodeEvent` type provides the discriminated union for session routing in Phase 2+
- All unit tests green; tsc clean; ready for bot middleware plan

---
*Phase: 01-foundation*
*Completed: 2026-03-28*
