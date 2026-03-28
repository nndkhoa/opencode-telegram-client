# OpenCode Telegram Client

## What This Is

A Telegram bot that acts as a full-featured client for an OpenCode server running at `http://localhost:4096`. It lets allowlisted users interact with OpenCode sessions directly from Telegram — sending messages, managing named sessions, receiving streamed responses rendered as clean HTML, and handling MCP clarification questions interactively.

## Core Value

A Telegram user can start an OpenCode session, send messages, and receive properly formatted streaming responses — as if they were using OpenCode directly.

## Requirements

### Validated

- [x] Only allowlisted Telegram user IDs can interact with the bot — Validated in Phase 01: Foundation
- [x] TypeScript project compiles with strict mode, env validation with Zod — Validated in Phase 01: Foundation
- [x] OpenCode HTTP transport: health check + SSE event loop with backoff — Validated in Phase 01: Foundation

### Validated

- [x] Users can send messages to OpenCode and receive live-streaming responses — Validated in Phase 02: Minimal Telegram Loop
- [x] Responses stream live (editing message as tokens arrive ~500ms), then replaced with clean final output — Validated in Phase 02: Minimal Telegram Loop

### Validated

- [x] OpenCode markdown responses are converted to Telegram-compatible HTML using marked + sanitize-html — Validated in Phase 03: rendering-pipeline

### Validated

- [x] Each Telegram chat has a default session (auto-created on first message) — Validated in Phase 04: Session Commands
- [x] Users can create and switch named sessions (`/new <name>`, `/switch <name>`) — Validated in Phase 04: Session Commands
- [x] Session list visible via `/sessions` — Validated in Phase 04: Session Commands
- [x] Bot commands: `/new`, `/sessions`, `/switch`, `/status`, `/cancel`, `/help` — Validated in Phase 04: Session Commands

### Active
- [ ] MCP questions from OpenCode are surfaced in Telegram — as inline keyboard buttons when options are present, free-text reply when open-ended
- [ ] MCP question answers are relayed back to OpenCode
- [ ] File uploads supported (send file context to OpenCode)
- [ ] Model switching supported
- [ ] Context management commands
- [ ] Request/response logging — what came in from Telegram and what went to/from OpenCode
- [ ] Runs locally (same machine as OpenCode), started with `node` or `npx`

### Out of Scope

- Docker/containerized deployment — local-only for now
- Public access — allowlist only, no open bot
- Persistent log storage / log querying — console/file logging only, no log DB

## Context

- OpenCode server exposes an HTTP API at `localhost:4096` — API shape needs to be researched during planning (user is unfamiliar with it)
- OpenCode likely uses SSE (Server-Sent Events) for streaming responses
- OpenCode has an `mcp_question` event type that requires user input mid-session
- Telegram Bot API supports HTML parse mode — markdown must be converted to HTML (not raw markdown)
- TypeScript/Node.js stack chosen for strong typing and ecosystem fit

## Constraints

- **Tech Stack**: TypeScript + Node.js — user's preference
- **Runtime**: Local only — same machine as OpenCode server
- **API target**: OpenCode at `http://localhost:4096` — no auth assumed (local)
- **Telegram parse mode**: HTML — all OpenCode output must be converted before sending

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| TypeScript/Node.js | User preference, strong Telegram lib ecosystem | Confirmed |
| HTML parse mode for Telegram | OpenCode returns markdown; Telegram HTML is safer and more predictable than MarkdownV2 | Confirmed |
| Allowlist access control | Security — bot is a proxy to a local dev tool | Confirmed |
| Stream → clean final message | Best UX: shows progress, ends with readable output | Confirmed — working live |
| Per-chat default session + named sessions | Covers both casual use and multi-project workflows | Confirmed — SessionRegistry with getOrCreateDefault, createNamed, switchTo |
| Commands before catch-all message handler | grammY routes in registration order; bot.command() must precede bot.on("message:text") | Confirmed — fixed in Phase 04 UAT |
| Native Node fetch for SSE | @microsoft/fetch-event-source is browser-only (references window) — replaced with built-in fetch + ReadableStream | Confirmed |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-28 — Phase 04 (Session Commands) complete*
