---
phase: 03-rendering-pipeline
plan: 01
subsystem: rendering
tags: [markdown, html, telegram, rendering, tdd]
dependency_graph:
  requires: []
  provides: [renderFinalMessage]
  affects: [streaming-state, bot-message-sending]
tech_stack:
  added: [marked, sanitize-html]
  patterns: [pure-function, tdd-red-green, post-conversion-split]
key_files:
  created:
    - src/rendering/markdown.ts
    - src/rendering/markdown.test.ts
  modified: []
decisions:
  - "marked + sanitize-html pipeline: convert markdown→HTML then sanitize to Telegram-allowed tags"
  - "Tag normalization: strong→b, em→i, ins→u, del→s post-sanitization (Telegram only supports b/i/u/s)"
  - "Post-conversion split: splitting applied to final HTML string after full conversion"
  - "Newline-aware splitting: walk back 200 chars to find nearest newline before hard split at 4096"
metrics:
  duration: "~3 minutes"
  completed: "2026-03-28T15:27:38Z"
  tasks_completed: 2
  files_created: 2
  files_modified: 0
---

# Phase 03 Plan 01: renderFinalMessage Rendering Module Summary

**One-liner:** Pure TDD-built rendering pipeline converting markdown to Telegram-safe HTML with newline-aware 4096-char chunking using marked + sanitize-html.

## What Was Built

`src/rendering/markdown.ts` exports `renderFinalMessage(markdown: string): string[]` — a pure function that:

1. Converts markdown to HTML via `marked`
2. Sanitizes to Telegram-allowed tags only (`b`, `i`, `u`, `s`, `code`, `pre`, `a`, `tg-spoiler`) via `sanitize-html`
3. Normalizes `strong→b`, `em→i`, `ins→u`, `del→s` (Telegram's HTML parse mode requires short tags)
4. Splits the HTML string into chunks ≤ 4096 chars, preferring newline boundaries within a 200-char lookback window
5. Returns `["(empty response)"]` for blank input

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| RED | Write 10 failing tests for renderFinalMessage | 06a8ef2 | src/rendering/markdown.test.ts |
| GREEN | Implement renderFinalMessage, all 10 tests pass | 455b3d2 | src/rendering/markdown.ts |

## Test Coverage

All 10 test cases pass:
1. `**bold**` → `<b>bold</b>`
2. `_italic_` → `<i>italic</i>`
3. `` `code` `` → `<code>code</code>`
4. Fenced code block → `<pre><code>`
5. `[link](url)` → `<a href="url">`
6. 5000-char input splits into ≥2 chunks, each ≤4096
7. `<div>` tags stripped
8. `<span>` tags stripped
9. Empty string → `["(empty response)"]`
10. Split respects newline boundary (4000 a's + newline + 200 b's)

## Deviations from Plan

None — plan executed exactly as written. Dependencies (`marked`, `sanitize-html`) were already present in `package.json` from Phase 01 decisions.

## Known Stubs

None — `renderFinalMessage` is fully implemented and wired to real dependencies. No placeholder data.

## Self-Check

- [x] `src/rendering/markdown.ts` exists
- [x] `src/rendering/markdown.test.ts` exists
- [x] `npx vitest run src/rendering/markdown.test.ts` exits 0 (10/10 pass)
- [x] `npm run typecheck` exits 0
- [x] All acceptance criteria grep checks pass
- [x] Commits 06a8ef2 (test) and 455b3d2 (feat) exist

## Self-Check: PASSED
