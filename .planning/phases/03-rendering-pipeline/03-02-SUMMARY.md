---
phase: 03-rendering-pipeline
plan: 02
subsystem: streaming-state
tags: [rendering, html, streaming, telegram]
dependency_graph:
  requires: [03-01]
  provides: [MSG-05, MSG-06]
  affects: [src/opencode/streaming-state.ts]
tech_stack:
  added: []
  patterns: [HTML-escape interim edits, renderFinalMessage on session.idle, multi-chunk sendMessage, D-08 HTML fallback]
key_files:
  modified:
    - src/opencode/streaming-state.ts
    - src/opencode/streaming-state.test.ts
decisions:
  - handleEvent changed from void to async (Promise<void>) to support await on session.idle sends
  - escapeHtml applied to interim buffer only — no parse_mode on interim edits (safety without HTML rendering)
  - endTurn called before async render to prevent race with throttled edits (pattern from plan 01 decision preserved)
metrics:
  duration: ~5 minutes
  completed: "2026-03-28T15:30:30Z"
  tasks: 1
  files: 2
---

# Phase 03 Plan 02: Rendering Pipeline Wiring Summary

**One-liner:** Wired `renderFinalMessage` into streaming state machine — HTML interim escaping, multi-chunk final delivery with parse_mode HTML, and plain-text fallback on Telegram rejection.

## What Was Built

Connected the rendering module from plan 01 into the live message flow:

1. **HTML-escaped interim edits** — `escapeHtml()` helper prevents `<`, `>`, `&` from being interpreted as HTML during streaming display. No `parse_mode` on interim edits (plain text, just safely escaped).

2. **Final message via `renderFinalMessage`** — On `session.idle`, the raw buffer is passed through the full markdown→HTML pipeline. First chunk edits the interim message with `{ parse_mode: "HTML" }`.

3. **Multi-chunk support** — If `renderFinalMessage` returns multiple chunks (buffer > 4096 chars), subsequent chunks are sent as new messages via `bot.sendMessage` with `{ parse_mode: "HTML" }`.

4. **D-08 fallback** — If Telegram rejects the HTML edit (e.g., malformed entities), the implementation retries with plain escaped text (no `parse_mode`), preventing crashes or error messages to the user.

5. **`handleEvent` made async** — Required to `await` the sequential sends in `session.idle` branch.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Update streaming-state.ts — HTML-escaped interim + renderFinalMessage on idle | 3f59edb | src/opencode/streaming-state.ts, src/opencode/streaming-state.test.ts |

## Test Coverage

14 tests passing (9 existing + 5 updated/new):
- HTML-escapes `<`, `>`, `&` in interim buffer display
- Final message uses `parse_mode: "HTML"`
- Empty buffer still returns `(empty response)` with HTML mode
- Multi-chunk: `sendMessage` called for chunks 2+
- HTML fallback: second `editMessageText` call has no `parse_mode`

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all data wired end-to-end.

## Self-Check: PASSED

- `src/opencode/streaming-state.ts` — FOUND
- `src/opencode/streaming-state.test.ts` — FOUND
- Commit `3f59edb` — FOUND
- `npx vitest run` — 55/55 tests pass
- `npm run typecheck` — 0 errors
