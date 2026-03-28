# Roadmap: OpenCode Telegram Client

## Overview

Six phases deliver a fully functional Telegram bot that proxies OpenCode sessions. The build follows a vertical-slice-first approach: prove OpenCode connectivity and SSE streaming in early phases, then layer on rendering quality, session management, MCP interaction, and power features — each phase leaving the bot more capable and user-ready than the last.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - TypeScript project + OpenCode client + shared SSE connection (completed 2026-03-28)
- [x] **Phase 2: Minimal Telegram Loop** - Allowlist + text in → prompt_async → live streaming message (completed 2026-03-28)
- [x] **Phase 3: Rendering Pipeline** - Markdown→HTML, message splitting, clean final message (completed 2026-03-28)
- [x] **Phase 4: Session Commands** - Full session registry + all bot commands (/new, /switch, /sessions, /status, /cancel, /help) (completed 2026-03-28)
- [ ] **Phase 5: MCP Questions & Permissions** - Inline keyboards for question.asked and permission.asked events
- [ ] **Phase 6: Power Features** - File uploads, model switching, context clear, structured pino logging, README

## Phase Details

### Phase 1: Foundation
**Goal**: The project compiles, connects to OpenCode, and streams events from a shared SSE connection
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-04, ACC-01, ACC-02, ACC-03
**Success Criteria** (what must be TRUE):
  1. `npm run dev` (or `npx`) starts without errors and connects to OpenCode at localhost:4096
  2. A health check against `GET /global/health` returns a valid response (logged to console)
  3. The shared SSE connection to `GET /event` establishes and incoming events are visible in logs
  4. A message from a non-allowlisted Telegram user ID is silently rejected before any OpenCode call
  5. A message from an allowlisted user ID is accepted and reaches the next handler
**Plans**: 3 plans

Plans:
- [x] 01-01-PLAN.md — Project scaffold: package.json, tsconfig, vitest, env config module
- [x] 01-02-PLAN.md — OpenCode client: health check + shared SSE loop with exponential backoff
- [x] 01-03-PLAN.md — grammY bot: DM-only gate + allowlist middleware + main.ts bootstrap

### Phase 2: Minimal Telegram Loop
**Goal**: An allowlisted user can send a text message and see a live-streaming response in Telegram
**Depends on**: Phase 1
**Requirements**: MSG-01, MSG-02, MSG-03, MSG-04, MSG-07
**Success Criteria** (what must be TRUE):
  1. Sending a text message to the bot triggers a `typing` chat action visible in Telegram
  2. A streaming message appears in Telegram and its text updates as tokens arrive (throttled ~500ms)
  3. When streaming ends, a final message replaces the interim draft
  4. If OpenCode is unreachable, the bot replies with a clear, actionable error message (not a crash)
**Plans**: 3 plans

Plans:
- [x] 02-01-PLAN.md — Fix SSE event types (events.ts) + create test scaffolds (RED state)
- [x] 02-02-PLAN.md — OpenCode session client + StreamingStateManager implementation
- [x] 02-03-PLAN.md — Message handler + bot/index.ts + main.ts wiring

### Phase 3: Rendering Pipeline
**Goal**: All bot output is properly formatted Telegram-safe HTML with no silent truncation
**Depends on**: Phase 2
**Requirements**: MSG-05, MSG-06
**Success Criteria** (what must be TRUE):
  1. OpenCode markdown output (code blocks, bold, italics, links) renders correctly in Telegram using HTML parse_mode
  2. A response exceeding 4096 characters is automatically split into multiple messages (none truncated)
  3. Partially received streamed text never causes a "can't parse entities" Telegram API error
**Plans**: 2 plans

Plans:
- [x] 03-01-PLAN.md — TDD: renderFinalMessage module (markdown→HTML, split ≤4096, sanitize tags)
- [x] 03-02-PLAN.md — Wire rendering into streaming-state.ts (HTML interim escaping, multi-chunk send, D-08 fallback)

### Phase 4: Session Commands
**Goal**: Users can manage named sessions and control the bot via the full command set
**Depends on**: Phase 3
**Requirements**: SESS-01, SESS-02, SESS-03, SESS-04, SESS-05, SESS-06, CMD-01, CMD-02, CMD-03, CMD-04, CMD-05, CMD-06, CMD-07
**Success Criteria** (what must be TRUE):
  1. A new chat automatically gets a default session on first message (no manual setup needed)
  2. `/new <name>` creates and switches to a named session; `/switch <name>` changes the active session
  3. `/sessions` lists all sessions for the current chat (default + named)
  4. `/status` shows the current session ID, OpenCode server health, and active/idle state
  5. `/cancel` aborts an in-progress OpenCode request; `/help` lists all commands with descriptions
  6. BotFather command menu is registered with all commands visible in Telegram's command picker
**Plans**: 4 plans

Plans:
- [x] 04-01-PLAN.md — TDD: SessionRegistry class (default + named sessions per chat)
- [x] 04-02-PLAN.md — Refactor StreamingStateManager + message handler to use SessionRegistry; add abortSession()
- [x] 04-03-PLAN.md — Command handlers: /new, /switch, /sessions
- [x] 04-04-PLAN.md — Command handlers: /status, /cancel, /help + bot wiring + setMyCommands

### Phase 04.1: model switching (INSERTED)

**Goal:** Users can switch the active AI model globally via `/model <name>` and list available models with `/model`
**Requirements**: FILE-02
**Depends on:** Phase 4
**Plans:** 1/1 plans complete

Plans:
- [x] 04.1-01-PLAN.md — OpenCode config API client + /model command handler + bot wiring

### Phase 5: MCP Questions & Permissions
**Goal**: OpenCode MCP questions and permission prompts are surfaced interactively in Telegram
**Depends on**: Phase 4
**Requirements**: MCP-01, MCP-02, MCP-03, MCP-04, MCP-05, MCP-06
**Success Criteria** (what must be TRUE):
  1. When OpenCode emits `question.asked` with options, the bot sends an inline keyboard; tapping a button submits the answer
  2. When OpenCode emits `question.asked` with no options, the bot sends a text prompt and the user's next message is used as the answer
  3. When OpenCode emits `permission.asked`, the bot shows an Allow / Deny inline keyboard and relays the choice
  4. `/cancel`, session switch, or a `question.replied`/`question.rejected` event clears pending question state
**Plans**: TBD

### Phase 6: Power Features
**Goal**: Users can send files, switch models, clear context, and all activity is structured-logged
**Depends on**: Phase 5
**Requirements**: FILE-01, FILE-02, FILE-03, LOG-01, LOG-02, LOG-03, LOG-04, LOG-05, INFRA-03
**Success Criteria** (what must be TRUE):
  1. Sending a document to the bot forwards it as context to the active OpenCode session
  2. `/model <name>` switches the active model via the OpenCode config API (confirmed in /status output)
  3. `/clear` clears the current session context
  4. All incoming messages, outgoing OpenCode requests, and responses are logged as structured JSON (pino)
  5. Running in dev mode shows human-readable log output; production emits JSON
  6. `README.md` documents setup, required env vars, and how to run the bot
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 3/3 | Complete   | 2026-03-28 |
| 2. Minimal Telegram Loop | 3/3 | Complete   | 2026-03-28 |
| 3. Rendering Pipeline | 2/2 | Complete   | 2026-03-28 |
| 4. Session Commands | 4/4 | Complete   | 2026-03-28 |
| 5. MCP Questions & Permissions | 0/TBD | Not started | - |
| 6. Power Features | 0/TBD | Not started | - |
