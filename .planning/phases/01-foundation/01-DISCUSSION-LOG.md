# Phase 1: Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-28
**Phase:** 01-foundation
**Areas discussed:** SSE architecture, Allowlist wiring, Env config shape

---

## SSE Architecture

| Option | Description | Selected |
|--------|-------------|----------|
| Single shared connection | One `GET /event` SSE stream for the whole process, filter events by sessionID in-memory | ✓ |
| Per-session connection | Each active OpenCode session gets its own `GET /event` connection | |

**User's choice:** Single shared connection
**Notes:** Matches research findings, simpler, fewer connections.

---

## SSE Reconnection

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-reconnect with backoff | Retry with exponential backoff, log the disconnect | ✓ |
| Reconnect + notify active chats | Same as above, but also send a message to any chat with an active streaming session | |
| Fail loudly | Log error and exit process, rely on process manager to restart | |

**User's choice:** Auto-reconnect with backoff
**Notes:** No user notification needed at this phase.

---

## Allowlist Wiring — Rejection Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Silent drop | Ignore the message completely, no response sent | |
| Silent drop + log | Ignore but log the attempt with user ID | |
| Send rejection message | Reply with "You don't have access to this bot" | ✓ |

**User's choice:** Send rejection message

---

## Allowlist Wiring — Group Chats

| Option | Description | Selected |
|--------|-------------|----------|
| DMs only | Reject all group/channel messages at the allowlist middleware level | ✓ |
| DMs + groups | Allow group chats where the sender is allowlisted | |
| You decide | Whatever makes sense architecturally | |

**User's choice:** DMs only

---

## Env Config — Startup Validation

| Option | Description | Selected |
|--------|-------------|----------|
| Fail fast | Check all required env vars on startup, log clear error and exit if missing | ✓ |
| Lazy validation | Only validate when a feature is actually used | |
| You decide | Claude picks the approach | |

**User's choice:** Fail fast

---

## Env Config — OpenCode URL

| Option | Description | Selected |
|--------|-------------|----------|
| Configurable via env var | `OPENCODE_URL=http://localhost:4096` with that as default | ✓ |
| Hardcoded | Always `http://localhost:4096`, no config needed | |

**User's choice:** Configurable via env var (`OPENCODE_URL`)

---

## Env Config — Allowlist Storage

| Option | Description | Selected |
|--------|-------------|----------|
| Comma-separated in `ALLOWED_USER_IDS` | `ALLOWED_USER_IDS=123456,789012` — single env var | ✓ |
| Separate `.allowlist` file | Text file with one ID per line, path set via env var | |
| Both supported | Env var takes priority, fallback to file | |

**User's choice:** Comma-separated in `ALLOWED_USER_IDS`

---

## Claude's Discretion

- Project folder structure
- SSE reconnection backoff parameters

## Deferred Ideas

None.
