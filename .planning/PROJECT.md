# OpenCode Telegram Client

## What This Is

A Telegram bot that acts as a full-featured client for an OpenCode server running at `http://localhost:4096`. It lets allowlisted users interact with OpenCode sessions directly from Telegram — sending messages and photos, managing named sessions, receiving streamed responses rendered as clean HTML, and handling MCP clarification questions interactively.

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

### Validated

- [x] Users can switch active AI model via `/model <providerID>/<modelID>` and list available models via `/model` — Validated in Phase 04.1: model-switching-context-clear

### Validated

- [x] `/status` and `/model` agree on “current model” via shared resolution (config before session messages); empty session shows global model when set; `/model` supports numbered catalog and `/model <n>` — Validated in Phase 04.2: fix-unknown-model-at-beginning-propose-new-way-to-change-model

### Validated

- [x] MCP questions from OpenCode are surfaced in Telegram — inline keyboards when options are present, free-text reply when open-ended — Validated in Phase 5: MCP Questions & Permissions
- [x] MCP question answers are relayed back to OpenCode — Validated in Phase 5: MCP Questions & Permissions

### Validated

- [x] Photo messages are downloaded and sent to OpenCode as `prompt_async` file parts; other media types get short “not supported” replies — Validated in Phase 6: Power Features
- [x] Fresh context via `/new` and session commands; no `/clear` command — Validated in Phase 6: Power Features (FILE-03)
- [x] Structured pino logging (Telegram updates, OpenCode HTTP/SSE at metadata level, errors) without secrets at default info — Validated in Phase 6: Power Features
- [x] Minimal `README.md`: install, env table aligned with `.env.example`, run instructions; no external URLs — Validated in Phase 6: Power Features (INFRA-03)
- [x] `/model` and `/status` stay aligned on displayed model (FILE-02 regression tests) — Validated in Phase 6: Power Features

### Active

_No open requirements for the v1.0 roadmap; future work starts a new milestone or backlog._

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
*Last updated: 2026-03-29 — Phase 6 (Power Features) complete; v1.0 roadmap closed*
