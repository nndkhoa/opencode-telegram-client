# Phase 3: Rendering Pipeline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-28
**Phase:** 03-rendering-pipeline
**Areas discussed:** Streaming Interim Safety, Message Splitting, Edge Cases & Failure Modes

---

## Streaming Interim Safety

| Option | Description | Selected |
|--------|-------------|----------|
| Plain text only | Send interim as raw unformatted text. Escape `<`, `>`, `&`. Final message gets full HTML treatment. | ✓ |
| Strip markdown from interim | Run a lightweight strip pass to remove `*`, `` ` ``, `#` before each edit. | |
| Best-effort HTML on interim | Attempt conversion on each throttled edit, catch errors, fall back to plain text. | |

**User's choice:** Plain text only
**Notes:** Aligns with Phase 2's established pattern of "stream plain text, format on final".

---

## Message Splitting

| Option | Description | Selected |
|--------|-------------|----------|
| Nearest newline before limit | Walk backwards from char 4096 to find last `\n`. Clean splits, minimal mid-sentence cuts. | ✓ |
| Paragraph boundary | Split only at double-newlines (`\n\n`). Cleaner but a long paragraph could still overflow. | |
| Hard character limit | Split exactly at 4096. Guaranteed but may cut mid-word or mid-HTML-tag. | |

**Pre vs post-conversion split:**
User selected option 1 (nearest newline). Inferred: pre-conversion split (split markdown buffer, convert each chunk independently) — safer, eliminates mid-HTML-tag risk.

**User's choice:** Nearest newline before limit, pre-conversion split
**Notes:** First chunk replaces interim message via `editMessageText`; subsequent chunks sent as new messages.

---

## Edge Cases & Failure Modes

| Option | Description | Selected |
|--------|-------------|----------|
| Fallback to escaped plain text | If HTML send fails, retry once with plain text (HTML-escaped). Silent recovery. | ✓ |
| Log and surface an error | Edit message to `❌ Response couldn't be formatted.` | |
| Retry with plain text + log | Same as option 1 but also log the raw HTML that failed. | |

**User's choice:** Fallback to escaped plain text
**Notes:** Content availability prioritized over formatting fidelity. Failure logged for debugging.

---

## Markdown → HTML Library (not formally discussed — confirmed)

User confirmed `marked` + `sanitize-html` as the library pair (noted in STATE.md from project init).

---

## Claude's Discretion

- Exact `sanitize-html` allowedTags list
- Whether to extract rendering logic into `src/rendering/` module or keep inline
- `marked` renderer overrides for Telegram-specific behavior

## Deferred Ideas

None.
