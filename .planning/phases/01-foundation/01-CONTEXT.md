# Phase 1: Foundation - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

TypeScript project scaffolding, OpenCode REST/SSE client library, shared SSE event connection, and allowlist middleware. This phase delivers the invisible foundation — no Telegram user-facing behavior, but everything else depends on it.

Requirements in scope: INFRA-01, INFRA-02, INFRA-04, ACC-01, ACC-02, ACC-03

</domain>

<decisions>
## Implementation Decisions

### SSE Architecture
- **D-01:** Single shared `GET /event` SSE connection for the entire process — events are filtered in-memory by sessionID. No per-session connections.
- **D-02:** Auto-reconnect with exponential backoff on disconnect. Log the disconnect. No user notification needed at this phase.

### Allowlist Wiring
- **D-03:** Non-allowlisted users receive a rejection message ("You don't have access to this bot") — not a silent drop.
- **D-04:** DMs only — group chats and channel messages are rejected at the middleware level before any allowlist check.

### Env Config Shape
- **D-05:** Fail fast — all required env vars are validated at startup. Log a clear error and exit if any are missing.
- **D-06:** OpenCode base URL is configurable via `OPENCODE_URL` env var, defaulting to `http://localhost:4096`.
- **D-07:** Allowlist stored as comma-separated user IDs in `ALLOWED_USER_IDS` env var (e.g., `ALLOWED_USER_IDS=123456,789012`).

### Claude's Discretion
- Project folder structure (e.g., `src/bot/`, `src/opencode/`, `src/session/`) — Claude decides based on what serves the architecture best.
- SSE reconnection backoff parameters (initial delay, max delay, jitter) — Claude picks reasonable defaults.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### OpenCode API
- `.planning/research/ARCHITECTURE.md` — OpenCode endpoint table, SSE event types, `question.asked`/`permission.asked` shapes, `prompt_async` flow
- `.planning/research/SUMMARY.md` — Synthesized stack choices and architecture insights

### Project Requirements
- `.planning/REQUIREMENTS.md` — INFRA-01, INFRA-02, INFRA-04, ACC-01, ACC-02, ACC-03 acceptance criteria
- `.planning/PROJECT.md` — Core value, constraints, key decisions

### Stack
- `.planning/research/STACK.md` — Specific library versions: grammY `^1.41.1`, TypeScript strict mode, tsx for dev, pino for logging

No external specs or ADRs referenced during discussion — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project, no existing code.

### Established Patterns
- None yet — this phase establishes the patterns all subsequent phases follow.

### Integration Points
- This phase creates the foundation modules that Phase 2 (Telegram loop) will import:
  - OpenCode client (REST + SSE)
  - Allowlist middleware
  - Config loader (env vars)

</code_context>

<specifics>
## Specific Ideas

- No specific references or "I want it like X" moments — open to standard TypeScript/Node.js project conventions.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-03-28*
