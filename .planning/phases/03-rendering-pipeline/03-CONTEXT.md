# Phase 3: Rendering Pipeline - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Convert OpenCode markdown output to Telegram-safe HTML before sending the final message, and handle responses exceeding 4096 characters by splitting into multiple messages. No silent truncation. No "can't parse entities" Telegram API errors.

Requirements in scope: MSG-05, MSG-06

</domain>

<decisions>
## Implementation Decisions

### Markdown → HTML Library
- **D-01:** Use `marked` + `sanitize-html` for markdown→HTML conversion. `marked` parses markdown to HTML; `sanitize-html` strips tags Telegram doesn't support (e.g. `<div>`, `<span>`, `<img>`). This pair was chosen during project init — lock it in.
- **D-02:** Conversion is applied **only to the final message** (on `session.idle`). The streaming interim messages remain plain text throughout.

### Streaming Interim Safety
- **D-03:** Interim edits (the throttled `⏳ Thinking...` updates) are sent as plain text — no markdown conversion, no HTML parse mode. Escape `<`, `>`, `&` to prevent accidental HTML injection. This is the natural extension of the Phase 2 pattern ("stream plain text, format on final").
- **D-04:** The `⏳ Thinking...\n\n{buffer}` interim format continues as-is from Phase 2. No changes to streaming behavior.

### Message Splitting
- **D-05:** Split on the **raw markdown buffer** before HTML conversion (pre-conversion split). Each chunk is converted independently. This eliminates any risk of splitting mid-HTML-tag.
- **D-06:** Split boundary: walk backwards from char 4096 to find the nearest `\n`. If no newline is found within a reasonable lookback window (e.g. 200 chars), split at the hard limit as a last resort.
- **D-07:** All split chunks are sent as separate Telegram messages in sequence. The first chunk replaces the interim message (`editMessageText`); subsequent chunks are sent as new messages (`sendMessage`).

### Failure Mode
- **D-08:** If `editMessageText` with `parse_mode: "HTML"` fails (Telegram rejects the HTML), retry once with the plain text buffer — HTML-escaped, no parse mode. Silent recovery: user gets the content unformatted rather than an error message. Log the failure and the raw HTML for debugging.

### Claude's Discretion
- Exact `sanitize-html` allowedTags list (should include at minimum: `b`, `i`, `u`, `s`, `code`, `pre`, `a`).
- Whether to extract the markdown→HTML logic into a dedicated `src/rendering/` module or keep it inline in the streaming state handler.
- Whether to add `marked` renderer overrides for Telegram-specific behavior (e.g. fenced code blocks → `<pre><code>`).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Telegram HTML Support
- Telegram Bot API HTML parse mode supports: `<b>`, `<i>`, `<u>`, `<s>`, `<code>`, `<pre>`, `<a href>`, `<tg-spoiler>`. All other tags must be stripped.
- Reference: https://core.telegram.org/bots/api#html-style (researcher should verify current tag list)

### OpenCode API
- `.planning/research/ARCHITECTURE.md` — SSE event types, `message.part.delta`, `session.idle` shapes
- `.planning/research/SUMMARY.md` — Synthesized architecture insights

### Project Requirements
- `.planning/REQUIREMENTS.md` — MSG-05, MSG-06 acceptance criteria
- `.planning/PROJECT.md` — HTML parse mode decision, stream→clean pattern, key decisions table

### Phase 1 & 2 Context (patterns to follow)
- `.planning/phases/01-foundation/01-CONTEXT.md` — ESM/NodeNext import conventions (.js extensions)
- `.planning/phases/02-minimal-telegram-loop/02-CONTEXT.md` — Streaming state architecture, `⏳ Thinking...` pattern, `endTurn`/`editMessageText` flow

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/opencode/streaming-state.ts` — `StreamingStateManager.handleEvent()` is where HTML conversion and splitting must be wired in. The `session.idle` branch currently calls `editMessageText(chatId, messageId, finalText)` with raw plain text — this is the exact insertion point for MSG-05/MSG-06.
- `src/logger.ts` — Shared pino logger available for logging conversion failures (D-08).

### Established Patterns
- ESM project: all imports use `.js` extensions even for TypeScript source files.
- Plain text during streaming, formatted output only on final — Phase 2 established this; Phase 3 implements the "formatted" half.
- `endTurn` called before `editMessageText` on `session.idle` to prevent race with throttled edits (must preserve this order).

### Integration Points
- `src/opencode/streaming-state.ts` `handleEvent()` `session.idle` branch: swap `finalText` (raw buffer) for `renderFinalMessage(buffer)` which handles conversion + splitting.
- `src/opencode/streaming-state.ts` `handleEvent()` `message.part.delta` branch: add HTML-escaping (`<`, `>`, `&`) to the interim buffer display (D-03).
- New module needed: `src/rendering/markdown.ts` (or equivalent) — exports `renderFinalMessage(markdown: string): string[]` returning an array of Telegram-safe HTML chunks.

</code_context>

<specifics>
## Specific Ideas

- Pre-conversion split (markdown → chunks → each chunk converted) was explicitly chosen over post-conversion split to avoid mid-HTML-tag boundary issues.
- Silent fallback on HTML failure (D-08) was chosen over surfacing an error — content availability over formatting fidelity.
- `marked` + `sanitize-html` confirmed as the library pair (not `telegramify-markdown` or custom converter).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 03-rendering-pipeline*
*Context gathered: 2026-03-28*
