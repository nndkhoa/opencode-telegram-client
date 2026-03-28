# Phase 2: Minimal Telegram Loop - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-28
**Phase:** 02-minimal-telegram-loop
**Areas discussed:** Session Bootstrap, Turn-end Detection, Streaming UX, Error Handling, Concurrency Guard

---

## Session Bootstrap

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-create on first message | `POST /session` on first message per chat, store `Map<chatId, sessionId>` in memory, reuse on subsequent messages | ✓ |
| Always create fresh session | `POST /session` on every message — no memory | |
| Hardcode single global session | One session ID for all chats | |

**User's choice:** Option 1 — auto-create on first message
**Notes:** Forward-compatible with Phase 4 session registry taking over the same map.

---

## Turn-end Detection

| Option | Description | Selected |
|--------|-------------|----------|
| `session.idle` | Wait for `session.idle` SSE event — explicit semantic signal from OpenCode | ✓ |
| `message.updated` | Use `message.updated` as completion signal — less explicit | |
| Timeout-based fallback | No delta for N seconds → assume done — fragile | |
| `session.idle` + timeout fallback | Primary: `session.idle`; fallback: timeout | |

**User's choice:** Option 1 — `session.idle` only
**Notes:** Clean semantic signal; no timeout fallback needed.

---

## Streaming UX

| Option | Description | Selected |
|--------|-------------|----------|
| Raw plain text | Accumulating text only, no decoration | |
| Trailing cursor | Append `▍` while streaming | |
| Prefixed status line | `⏳ Thinking...` header above text while streaming, removed on final | ✓ |
| Claude's discretion | Pick whatever looks cleanest | |

**User's choice:** Option 3 — prefixed status line
**Notes:** `⏳ Thinking...` prefix removed entirely when final message replaces interim.

---

## Error Handling

| Scenario | Option | Description | Selected |
|----------|--------|-------------|----------|
| A: Unreachable at send | Reply with new message | Send new error message | |
| A: Unreachable at send | Edit interim message | Edit "thinking" message to show error | ✓ |
| B: Mid-stream error | Edit interim to show error | Replace content with error, discard partial | ✓ |
| B: Mid-stream error | Leave partial + append error | Keep partial text, add error note below | |

**User's choice:** A → edit interim; B → edit interim (discard partial)
**Notes:** Consistent approach — the interim message always becomes the final output, whether success or failure.

---

## Concurrency Guard

| Option | Description | Selected |
|--------|-------------|----------|
| Reject with message | Reply "still working" immediately, don't forward to OpenCode | ✓ |
| Queue it | Hold message, send after current turn completes | |
| Let it through | Forward regardless — unpredictable on same session | |
| Claude's discretion | Pick reasonable approach | |

**User's choice:** Option 1 — reject with message
**Notes:** Message text: `⏳ Still working on your last message. Please wait.`

---

## Claude's Discretion

- Exact in-memory data structure for chat→session map and streaming state
- Whether `typing` action is sent once or periodically
- File/module organization for new handler code

## Deferred Ideas

None.
