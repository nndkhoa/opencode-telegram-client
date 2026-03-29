# Requirements: OpenCode Telegram Client

**Defined:** 2026-03-28
**Core Value:** A Telegram user can start an OpenCode session, send messages, and receive properly formatted streaming responses — as if they were using OpenCode directly.

## v1 Requirements

### Access Control

- [x] **ACC-01**: Bot rejects messages from users not in the allowlist (checked by numeric Telegram user ID)
- [x] **ACC-02**: Bot rejects callback queries (inline keyboard interactions) from users not in the allowlist
- [x] **ACC-03**: Allowlist is configured via environment variable (comma-separated user IDs)

### Messaging

- [x] **MSG-01**: User can send a text message and receive a response from OpenCode via the active session
- [x] **MSG-02**: Bot sends a `typing` chat action while waiting for OpenCode to respond
- [x] **MSG-03**: Response streams live — bot edits the Telegram message as tokens arrive (throttled, max ~1 edit/500ms)
- [x] **MSG-04**: After streaming completes, the interim message is replaced with a clean final message rendered as Telegram-safe HTML
- [x] **MSG-05**: OpenCode markdown output is converted to Telegram-compatible HTML using `marked` + `sanitize-html` before the final send
- [x] **MSG-06**: Messages exceeding 4096 characters are split across multiple messages (no silent truncation)
- [x] **MSG-07**: Bot sends a clear, actionable error message if OpenCode is unreachable or returns an error

### Sessions

- [x] **SESS-01**: Each Telegram chat has a default session — auto-created on first message if none exists
- [x] **SESS-02**: User can create a named session with `/new <name>`
- [x] **SESS-03**: User can switch to an existing named session with `/switch <name>`
- [x] **SESS-04**: User can list all sessions (default + named) with `/sessions`
- [x] **SESS-05**: Active session pointer persists in memory per chat (survives message-level context, not process restarts)
- [x] **SESS-06**: `/status` shows current session ID, OpenCode server health, and active/idle state

### MCP Questions & Permissions

- [x] **MCP-01**: When OpenCode emits a `question.asked` event with selectable options, bot sends an inline keyboard with the options
- [x] **MCP-02**: When OpenCode emits a `question.asked` event with no options (open-ended), bot sends a plain text prompt and awaits the user's next message as the answer
- [x] **MCP-03**: User's answer (button press or text reply) is sent to OpenCode via `POST /question/{requestID}/reply`
- [x] **MCP-04**: When OpenCode emits a `permission.asked` event, bot surfaces it as an inline keyboard (Allow / Deny)
- [x] **MCP-05**: Permission answer is sent via `POST /permission/{requestID}/reply`
- [x] **MCP-06**: Pending question state is cleared on `/cancel`, on `question.replied`/`question.rejected` events, or on session switch

### Commands

- [x] **CMD-01**: `/help` — lists all available commands with descriptions
- [ ] **CMD-02**: `/new <name>` — creates and switches to a named OpenCode session
- [ ] **CMD-03**: `/switch <name>` — switches active session to the named session
- [ ] **CMD-04**: `/sessions` — lists all sessions for the current chat
- [x] **CMD-05**: `/status` — shows active session and OpenCode server health
- [x] **CMD-06**: `/cancel` — aborts the current in-progress OpenCode request (`POST /session/:id/abort`)
- [x] **CMD-07**: BotFather command menu is set with all commands and descriptions

### Files & Context

- [x] **FILE-01**: User can send a **photo** to the bot and it is forwarded as context to the active OpenCode session (documents deferred per D-01)
- [x] **FILE-02**: User can switch the active model via `/model <name>` (calls OpenCode config API)
- [ ] **FILE-03**: User can clear the current session context via `/clear`

### Logging

- [x] **LOG-01**: All incoming Telegram messages are logged (user ID, chat ID, message type, timestamp)
- [x] **LOG-02**: All outgoing requests to OpenCode are logged (endpoint, session ID, timestamp)
- [x] **LOG-03**: All responses/events from OpenCode are logged (event type, session ID, summary, timestamp)
- [x] **LOG-04**: Errors from Telegram API and OpenCode API are logged with context
- [x] **LOG-05**: Logs are structured JSON (pino) with human-readable console output in dev mode

### Infrastructure

- [x] **INFRA-01**: Project is TypeScript with strict mode enabled
- [x] **INFRA-02**: Configuration (bot token, allowlist, OpenCode URL) is loaded from environment variables / `.env` file
- [ ] **INFRA-03**: `README.md` documents setup, configuration, and how to run
- [x] **INFRA-04**: Bot connects to OpenCode via a single shared SSE connection (`GET /event`) and routes events by session ID

## v2 Requirements

### Persistence

- **PERS-01**: Named session bindings persist across process restarts (file or SQLite storage)
- **PERS-02**: Log history queryable by session or chat

### Advanced Features

- **ADV-01**: Webhook mode as an alternative to long polling
- **ADV-02**: Support for multiple OpenCode workspaces (directory routing)
- **ADV-03**: Queue incoming messages while a response is streaming (instead of rejecting)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Docker / containerized deployment | Local-only per user decision |
| Public access (no allowlist) | Security boundary for a local dev tool proxy |
| Web dashboard / admin UI | Out of scope for a CLI-first tool |
| Multi-workspace routing in v1 | Adds complexity; single workspace is sufficient for v1 |
| Persistent log storage / querying | Console/file logging only for v1 |
| Local Bot API server | Not needed unless file uploads exceed default limits |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ACC-01 | Phase 1 | Complete |
| ACC-02 | Phase 1 | Complete |
| ACC-03 | Phase 1 | Complete |
| INFRA-01 | Phase 1 | Complete |
| INFRA-02 | Phase 1 | Complete |
| INFRA-04 | Phase 1 | Complete |
| MSG-01 | Phase 2 | Complete |
| MSG-02 | Phase 2 | Complete |
| MSG-03 | Phase 2 | Complete |
| MSG-04 | Phase 2 | Complete |
| MSG-07 | Phase 2 | Complete |
| MSG-05 | Phase 3 | Complete |
| MSG-06 | Phase 3 | Complete |
| SESS-01 | Phase 4 | Complete |
| SESS-02 | Phase 4 | Complete |
| SESS-03 | Phase 4 | Complete |
| SESS-04 | Phase 4 | Complete |
| SESS-05 | Phase 4 | Complete |
| SESS-06 | Phase 4 | Complete |
| CMD-01 | Phase 4 | Complete |
| CMD-02 | Phase 4 | Pending |
| CMD-03 | Phase 4 | Pending |
| CMD-04 | Phase 4 | Pending |
| CMD-05 | Phase 4 | Complete |
| CMD-06 | Phase 4 | Complete |
| CMD-07 | Phase 4 | Complete |
| MCP-01 | Phase 5 | Complete |
| MCP-02 | Phase 5 | Complete |
| MCP-03 | Phase 5 | Complete |
| MCP-04 | Phase 5 | Complete |
| MCP-05 | Phase 5 | Complete |
| MCP-06 | Phase 5 | Complete |
| FILE-01 | Phase 6 | Complete |
| FILE-02 | Phase 6 | Complete |
| FILE-03 | Phase 6 | Pending |
| LOG-01 | Phase 6 | Complete |
| LOG-02 | Phase 6 | Complete |
| LOG-03 | Phase 6 | Complete |
| LOG-04 | Phase 6 | Complete |
| LOG-05 | Phase 6 | Complete |
| INFRA-03 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 38 total
- Mapped to phases: 38
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-28*
*Last updated: 2026-03-28 after initial definition*
