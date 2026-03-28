# Phase 4: Session Commands - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-28
**Phase:** 04-session-commands
**Areas discussed:** Session registry design, Session naming & collision handling, `/sessions` list format, `/status` output, `/cancel` behavior

---

## Session Registry Design

| Option | Description | Selected |
|--------|-------------|----------|
| Separate `SessionRegistry` class | Clean separation of concerns; independently testable | ✓ |
| Expand `StreamingStateManager` | Keep everything in one class, simpler wiring | |
| Claude's Discretion | Claude picks the approach | |

**User's choice:** Separate `SessionRegistry` class
**Notes:** None

---

### Per-chat session shape

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit shape | `{ default: string, named: Map<string, string>, active: string }` | ✓ |
| Flat map | `Map<string, string>` with reserved `"default"` key | |
| Claude's Discretion | Claude picks the shape | |

**User's choice:** Explicit shape with distinct `default`, `named`, and `active` fields
**Notes:** None

---

## Session Naming & Collision Handling

### Name collision on `/new <name>`

| Option | Description | Selected |
|--------|-------------|----------|
| Reject with error | `❌ Session "name" already exists. Use /switch <name> to switch to it.` | ✓ |
| Overwrite silently | Create new OpenCode session, replace old one | |
| Overwrite with warning | Create new session, warn user old one replaced | |

**User's choice:** Reject with helpful error pointing to `/switch`

---

### Name format

| Option | Description | Selected |
|--------|-------------|----------|
| Alphanumeric + hyphens/underscores | e.g. `my-project`, `work_2` | ✓ |
| Any single word (no spaces) | Broader but no spaces | |
| Free text including spaces | Whole remainder of command | |
| Claude's Discretion | Claude picks validation | |

**User's choice:** Alphanumeric + hyphens/underscores only

---

### Case sensitivity

| Option | Description | Selected |
|--------|-------------|----------|
| Case-insensitive | Normalize to lowercase | ✓ |
| Case-sensitive | `MyProject` and `myproject` are distinct | |
| Claude's Discretion | | |

**User's choice:** Case-insensitive, normalized to lowercase

---

### Bare `/new` (no argument)

| Option | Description | Selected |
|--------|-------------|----------|
| Error with usage hint | `❌ Usage: /new <name>` — name required | |
| Auto-named session | Generate a name automatically and switch to it | ✓ |
| Claude's Discretion | | |

**User's choice:** Auto-create a named session

---

### Auto-name pattern

| Option | Description | Selected |
|--------|-------------|----------|
| `session-N` counter | Increments per chat | |
| `session-<timestamp>` | Unix timestamp suffix | ✓ |
| Short random adjective-noun | e.g. `brave-fox` | |
| Claude's Discretion | | |

**User's choice:** `session-<unix-timestamp>`

---

## `/sessions` List Format

| Option | Description | Selected |
|--------|-------------|----------|
| Plain text list with active marker | Bullet list, `(active)` suffix | ✓ |
| Include session IDs | Show OpenCode session ID alongside name | |
| Claude's Discretion | | |

**User's choice:** Plain text list with active marker, no IDs

---

### Empty state (default session only)

| Option | Description | Selected |
|--------|-------------|----------|
| Show default session alone | Always shows something | |
| Show default + usage hint | Append `Use /new <name> to create a named session.` | ✓ |
| Claude's Discretion | | |

**User's choice:** Show hint to encourage discoverability

---

## `/status` Output

| Option | Description | Selected |
|--------|-------------|----------|
| Compact block | Multi-line with bullets | |
| Single line summary | `Session: x \| OpenCode: ✅ \| State: idle` | ✓ (with model added) |
| Claude's Discretion | | |

**User's choice:** Single-line summary format, with model information added
**Notes:** User explicitly requested model info in the status output

---

### Model info source

| Option | Description | Selected |
|--------|-------------|----------|
| Fetch from OpenCode | Call config/session API live | ✓ |
| Track locally | Store last-set model name | |
| Claude's Discretion | | |

**User's choice:** Fetch from OpenCode

---

### `/status` when OpenCode unreachable

| Option | Description | Selected |
|--------|-------------|----------|
| Show degraded status inline | `OpenCode: ❌ unreachable \| Model: unknown` | ✓ |
| Error message | `❌ OpenCode is unreachable...` | |
| Claude's Discretion | | |

**User's choice:** Degraded inline status

---

## `/cancel` Behavior

### Nothing in progress

| Option | Description | Selected |
|--------|-------------|----------|
| Informative message | `ℹ️ Nothing in progress to cancel.` | ✓ |
| Silent | No response | |
| Claude's Discretion | | |

**User's choice:** Informative message

---

### Successful cancellation

| Option | Description | Selected |
|--------|-------------|----------|
| Confirm + edit streaming message | Edit to `🚫 Cancelled.` AND send `✅ Cancelled.` reply | ✓ |
| Just edit streaming message | Replace `⏳ Thinking...` with `🚫 Cancelled.`, no separate reply | |
| Claude's Discretion | | |

**User's choice:** Both — edit streaming message to `🚫 Cancelled.` and send separate `✅ Cancelled.` reply

---

## Claude's Discretion

- Module/file layout for `SessionRegistry`
- Command handler registration approach in `bot/index.ts`
- BotFather command menu registration
- `/help` text formatting
- OpenCode API endpoint for fetching model info (researcher to confirm)
- Name validation regex details

## Deferred Ideas

None
