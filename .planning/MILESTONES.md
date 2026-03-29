# Milestones

## v1.0 MVP (Shipped: 2026-03-29)

**Phases completed:** 8 phases, 21 plans, 32 tasks

**Key accomplishments:**

- TypeScript/ESM project scaffold with Zod-validated env config (BOT_TOKEN, ALLOWED_USER_IDS as Set<number>, OPENCODE_URL with default), pino logger, and Vitest unit tests covering validation paths
- SSE event loop with exponential backoff reconnect and health check using @microsoft/fetch-event-source, tested with signal-aware Vitest mocks
- grammY bot with DM-only gate and Set-based allowlist middleware, wired into full bootstrap entrypoint that runs config → health check → SSE loop + long-polling bot concurrently
- Three grammY command handler factories implementing named session creation, switching, and listing with session-registry compliance
- Six-command Telegram bot surface with health-aware `/status`, race-safe `/cancel`, static `/help`, and BotFather menu registration via `setMyCommands()`
- Typed question/permission SSE unions (OpenCode SDK–aligned), per-chat `PendingInteractiveState` with latest-wins and active-session gate, and fetch-based POST clients for `/question/{id}/reply` and `/permission/{id}/reply`
- SSE-driven inline keyboards for permission (Once/Always/Reject) and structured questions (single/multi-select, 8-option pages), with callback handlers posting to OpenCode reply routes and session-scoped pending state
- Open-ended question replies post to OpenCode before the busy guard; `/cancel`, `/switch`, and `/new` clear pending interactive state and refresh session→chat mapping for SSE
- Pino multistream to stdout and daily-rotating JSON under `logs/`, Telegram LOG-01 middleware after allowlist, OpenCode HTTP/SSE/Telegram API error lines at info without bodies or tokens
- Telegram `message:photo` downloads to a buffer and sends `POST .../prompt_async` with a single OpenAPI `file` part (data URL); non-photo media get a fixed “not supported” reply; busy and MCP-pending guards match text behavior
- Minimal README without external URLs; planning docs aligned with photo-only and `/new` (not `/clear`); FILE-02 locked with shared `/model`–`/status` model ref tests

---
