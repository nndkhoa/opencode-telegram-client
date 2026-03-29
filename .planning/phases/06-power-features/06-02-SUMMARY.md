---
phase: 06-power-features
plan: 02
subsystem: api
tags: [telegram, grammy, opencode, prompt_async, file-part]

requires:
  - phase: 06-power-features
    provides: "06-01 logging/SSE baseline"
provides:
  - "sendPromptAsyncWithPhoto with OpenAPI FilePartInput (data URL)"
  - "message:photo → download → prompt_async; busy/MCP guards"
  - "Unsupported media short replies (document, voice, video, sticker)"
affects:
  - "06-03-plan (remaining power-features)"

tech-stack:
  added: []
  patterns:
    - "OpenCode FilePartInput: type file, mime, url — inline bytes via data:<mime>;base64,..."

key-files:
  created:
    - "src/bot/handlers/photo.ts"
    - "src/bot/handlers/unsupported-media.ts"
    - "src/bot/handlers/photo.test.ts"
  modified:
    - "src/opencode/session.ts"
    - "src/opencode/session.test.ts"
    - "src/bot/index.ts"

key-decisions:
  - "Used OpenCode SDK/OpenAPI FilePartInput (GET /doc) — file parts use required `url`; Telegram bytes encoded as data URLs for prompt_async."

patterns-established:
  - "Photo handler mirrors text guards: busy (D-15) then MCP pending (D-16/D-17), then session + streaming turn."

requirements-completed: [FILE-01]

duration: 12min
completed: 2026-03-29
---

# Phase 06 Plan 02: Photo upload & unsupported media Summary

**Telegram `message:photo` downloads to a buffer and sends `POST .../prompt_async` with a single OpenAPI `file` part (data URL); non-photo media get a fixed “not supported” reply; busy and MCP-pending guards match text behavior.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-29T17:00:00Z
- **Completed:** 2026-03-29T17:02:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Extended OpenCode client with `sendPromptAsyncWithPhoto` reusing persisted/config model resolution; tests assert no text/caption in JSON body (D-02).
- Registered `message:photo` plus document/voice/video/sticker handlers; photo path enforces D-15–D-17 and `upload_photo` before work.

## Task Commits

1. **Task 1: OpenCode prompt_async with photo bytes** — `9ff1afe` (feat)
2. **Task 2: Photo handler + unsupported media + registration** — `632f847` (feat)

**Plan metadata:** _(pending final docs commit)_

## Files Created/Modified

- `src/opencode/session.ts` — `resolveModelForPromptBody`, `sendPromptAsyncWithPhoto` (FilePartInput / data URL)
- `src/opencode/session.test.ts` — photo prompt body assertions
- `src/bot/handlers/photo.ts` — photo pipeline, guards, Telegram file download
- `src/bot/handlers/unsupported-media.ts` — D-03 short rejection string
- `src/bot/handlers/photo.test.ts` — busy, MCP, happy path, error path
- `src/bot/index.ts` — register unsupported handlers and `message:photo` before `message:text`

## Decisions Made

- **Data URL for `FilePartInput.url`:** OpenAPI (see `SessionPromptAsyncData` in generated SDK) requires `url`; local OpenCode was not running here — shape verified against `anomalyco/opencode` `types.gen.ts` `FilePartInput` and documented in code comments.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for **06-03** (remaining Phase 6 plans).
- **FILE-01:** Implemented for **photos** per D-01; **documents** remain out of scope for this plan.

---
*Phase: 06-power-features*
*Completed: 2026-03-29*

## Self-Check: PASSED

- `src/bot/handlers/photo.ts` — FOUND
- `src/bot/handlers/unsupported-media.ts` — FOUND
- Commits `9ff1afe`, `632f847` — verified in `git log`
