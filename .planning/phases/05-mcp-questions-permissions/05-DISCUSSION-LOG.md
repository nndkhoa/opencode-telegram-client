# Phase 5: MCP Questions & Permissions - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-29
**Phase:** 5-MCP Questions & Permissions
**Areas discussed:** Permission mapping, keyboards (many options / multi-select), open-ended vs commands, overlapping prompts + session targeting

---

## Permission: two buttons vs API (`once` / `always` / `reject`)

| Option | Description | Selected |
|--------|-------------|----------|
| Allow → `once`, Deny → `reject` only | Matches roadmap Allow/Deny; `always` not exposed | ✓ |
| Three buttons (Allow once / Always / Deny) | Maps all API values; contradicts roadmap two-button UX |  |
| Allow → `always` | Stronger default than `once`; changes security posture |  |

**User's choice:** Allow → **`once`**, Deny → **`reject`**; defer **`always`** to backlog.
**Notes:** Roadmap explicitly specifies Allow/Deny inline keyboard only.

---

## Many options & multi-select

| Option | Description | Selected |
|--------|-------------|----------|
| Paginate + toggles + Submit | Scales for many options; multi-select via state + submit | ✓ |
| Text-only fallback for huge sets | Pragmatic escape hatch | ✓ (as fallback per CONTEXT D-06) |
| Multi-select via text reply only | Simpler but weaker MCP-01 UX |  |

**User's choice:** Stateful toggles with **Submit** for `multiple: true`; **pagination** when the keyboard is too large; numbered text fallback only if needed.

---

## Open-ended question mode vs commands

| Option | Description | Selected |
|--------|-------------|----------|
| Commands win; non-command text is answer | Consistent with grammY command-first routing | ✓ |
| Block commands until answer | Would violate MCP-06 / roadmap clear rules |  |

**User's choice:** **Commands take precedence**; pending await mode applies only to plain text that is not a command; session-changing and cancel paths clear pending state.

---

## Overlapping prompts & session targeting

| Option | Description | Selected |
|--------|-------------|----------|
| Latest prompt replaces pending | Single authoritative prompt per chat flow | ✓ |
| Queue prompts | More complex; not required by requirements |  |
| Active session filter | Prevents cross-session bleed | ✓ |

**User's choice:** **Replace** on overlap; handle events only for the **active** session for that chat.

---

## Claude's Discretion

- Callback encoding, pagination thresholds, superseded-message cleanup, prompt copy — left to implementation (see CONTEXT.md).

## Deferred Ideas

- **`always`** permission grant as first-class Telegram UX — out of scope Phase 5.
