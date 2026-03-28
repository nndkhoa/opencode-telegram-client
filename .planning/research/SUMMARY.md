# Research Summary — OpenCode Telegram Client

**Researched:** 2026-03-28  
**Sources:** `.planning/research/STACK.md`, `FEATURES.md`, `ARCHITECTURE.md`, `.planning/PROJECT.md`  
**Note:** `.planning/research/PITFALLS.md` was not present in the repo; critical pitfalls below are synthesized from the three research files (anti-features, “what not to use,” and architecture streaming guidance).

---

## Recommended Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| **Runtime** | Node.js ≥ 20 LTS | Native `fetch` (Undici), stable long polling + HTTP to local OpenCode. |
| **Telegram** | **grammY** `^1.41.1` | TypeScript-first, active maintenance, middleware fits allowlist, sessions, routing; better fit than stale Telegraf cadence or NTBA for a structured client. |
| **Markdown → HTML** | **marked** `^17.x` + **sanitize-html** `^2.x` | OpenCode returns Markdown; `PROJECT.md` requires **HTML** `parse_mode`. GFM-capable parse → whitelist tags/attrs per [Telegram HTML rules](https://core.telegram.org/bots/api#formatting-options); never ship unsanitized model HTML. |
| **SSE / streaming** | **@microsoft/fetch-event-source** `^2.x` (+ optional **eventsource-parser** `^3.x`) | OpenCode may use POST/custom headers; browser `EventSource` is GET-only. Use raw `fetch` + parser if holding `Response.body` directly. |
| **HTTP** | **Native `fetch`** | No extra dependency for localhost JSON/SSE; add **undici** explicitly only for `ProxyAgent`, pooling, or advanced dispatcher needs. |
| **Logging** | **pino** `^10.x` (+ **pino-pretty** dev-only) | Structured JSON, fast, child loggers per chat/session; matches request/response visibility requirements. |
| **TypeScript / dev** | **typescript** `^6.x`, **tsx** `^4.x` | Strict mode; fast local runs without a separate build step. |
| **Build (optional)** | **esbuild** `^0.27.x` or `tsc` | Fast `dist/` if shipping compiled JS. |

**Pin versions in lockfile at install time**; caret ranges in STACK research reflect npm at research date.

---

## Table Stakes Features

Features users expect from any competent AI Telegram bot; aligned with `PROJECT.md` active requirements:

- **Discoverability:** `/help` and BotFather menu; commands cover session management, cancel, status — not only “chat with AI.”
- **Responsiveness:** `sendChatAction` (`typing` / `upload_document` when sending files); refresh ~every 4–5s during long work (actions expire quickly).
- **Long output:** Respect **4096** character limit per message; split, attach as document, or explicit continuation — never silent truncation.
- **Valid formatting:** HTML/Markdown must be valid at send time; streaming strategies must not ship half-formed entities.
- **Control:** `/cancel` and clear error messages; map OpenCode/network failures to short, actionable text (`/status`, retry, check OpenCode).
- **Sessions:** Default session per Telegram chat; named sessions (`/new`, `/switch`, `/sessions`) per project.
- **Access control:** Allowlisted user IDs only; no secrets in session objects — env/config for tokens and allowlist.
- **Observability:** Request/response logging (console/file per scope); `/status` for localhost OpenCode health.

Differentiators already in scope include MCP/question UX (inline keyboard vs free text), file uploads, model switching, context commands, and stream-then-clean-final rendering.

---

## Key Architecture Insights

**OpenCode API (authoritative: server docs + SDK `types.gen.ts`):**

- Discovery: `GET /doc` (OpenAPI 3.1); default `127.0.0.1:4096`; optional HTTP Basic auth via env.
- **Workspace scoping:** Many routes accept `directory` / `workspace` — bot must pass the same values as the intended OpenCode project.
- **Sessions:** `GET/POST /session`, `GET/PATCH/DELETE /session/:id`, `POST /session/:id/abort` (maps to cancel), `GET/POST .../message`, **`POST .../prompt_async`** (204 — pair with SSE for streaming).
- **SSE:** `GET /event` (project-scoped; first event `server.connected`) and `GET /global/event`. Relevant event types include `message.part.delta` (token stream), `message.updated` / `message.part.updated`, `session.status` / `session.idle`, **`question.asked` / `question.replied` / `question.rejected`**, **`permission.asked` / `permission.replied`**.
- **Questions (product “MCP question”):** No literal `mcp_question` event — use **`question.asked`** on SSE and **`GET /question`**, **`POST /question/{requestID}/reply`** with ordered `answers`. `QuestionRequest` may include `tool: { messageID, callID }`.
- **Permissions:** `GET /permission`, `POST /permission/{requestID}/reply`; session-level permission routes per spec.
- **Health / config:** `GET /global/health`, `GET/PATCH /config`, providers — for `/status` and model switching.

**Component boundaries:**

- **Telegram transport** — long-polling or webhook; send/edit, keyboards, callbacks.
- **Access control** — allowlist before any OpenCode call.
- **Chat ↔ session registry** — `chat_id` → default/named/active OpenCode `sessionID` (in-memory first; optional JSON/SQLite if restarts must preserve bindings).
- **OpenCode REST client** — sessions, `prompt_async`, abort, messages, questions, permissions, files, config.
- **SSE client** — typically **one shared** `/event` connection per process; filter by `sessionID`; reconnect with backoff.
- **Stream aggregator** — coalesce `message.part.delta` into running text for throttled Telegram updates.
- **Render pipeline** — Markdown → Telegram-safe HTML; length limits; final commit vs draft stream.
- **Question & permission UI** — correlate `requestID` with chat/message; `answerCallbackQuery` for callbacks.

**Data flow (happy path):** User message → allowlist → resolve/create `sessionID` → `POST .../prompt_async` → parallel SSE deltas → throttled `editMessageText` (plain or safe partials) → on idle/completion, **final** validated HTML message → on `question.asked`, show UI → `POST /question/.../reply`. Cancel → `POST .../abort` + abort SSE readers + clear pending question state.

**Build order suggested by research:** OpenCode client + health → SSE consumer → minimal Telegram slice (`prompt_async` + streaming) → Markdown/HTML + final message → session commands → questions → permissions → files, model switching, logging, cancel polish.

---

## Critical Pitfalls to Avoid

1. **Rich formatting on incomplete streamed text** — Half-open HTML/Markdown causes `can't parse entities` and flicker. **Mitigation:** Stream plain text during the run, or buffer until safe boundaries; apply `marked` + `sanitize-html` on the **final** message (matches “stream live, then clean final”).
2. **Skipping sanitization** — Raw model HTML risks XSS and API rejection. **Mitigation:** Always pass through **Telegram-aware** `sanitize-html` whitelist, not library defaults alone.
3. **Wrong markdown toolchain** — e.g. **telegramify-markdown** targets Telegram Markdown strings, not HTML `parse_mode`. **Mitigation:** Stick to marked (or markdown-it) + sanitize-html per `PROJECT.md`.
4. **Excessive `editMessageText`** — Rate limits and bad UX. **Mitigation:** Throttle (e.g. 300–800 ms), coalesce deltas; consider **`sendMessageDraft`** (Bot API 9.3+) where supported; cap edits per second.
5. **Typing indicator leaks** — Loop must stop when the turn completes or errors. **Mitigation:** Tie `sendChatAction` refresh to active request lifecycle.
6. **MCP/question routing bugs** — Concurrent chats or overlapping questions need **correlation** (`requestID`, pending state per chat/session). **Mitigation:** Exclusive “awaiting answer” state; clear on `/cancel`, reply, timeout, or `question.replied` / reject.
7. **Multiple HTTP stacks** — **Mitigation:** Prefer **one** story (`fetch` first); avoid axios + fetch + node-fetch without cause.

---

## Open Questions

- **PITFALLS.md missing:** Add a dedicated pitfalls research file or merge findings into this summary for traceability.
- **OpenCode streaming contract details:** Exact headers/body for stream endpoints if not plain `GET /event` — confirm against running server and `/doc`.
- **`sendMessageDraft` vs `editMessageText`:** Client coverage, rate limits, and grammY behavior — verify for chosen Bot API version.
- **Question schema edge cases:** Full shape of `QuestionInfo` / options / `custom` for complex UIs — validate against live `question.asked` payloads.
- **Queue vs interrupt:** New user message while streaming — auto-cancel, queue, or reject? Product decision (`/cancel` implies interrupt expectation).
- **Large file uploads:** Whether local Bot API server is needed beyond default upload limits — only if attachments exceed Telegram defaults.
- **Persistence:** Accept in-memory session map loss on restart for v1, or ship file/DB persistence earlier — tradeoff for named sessions.

---

## Roadmap Implications

Research supports a **vertical-slice-first** roadmap: prove OpenCode connectivity and SSE before investing in full session UX and MCP modals.

1. **Foundation — OpenCode client + SSE**  
   Health (`/global/health`), config discovery, `POST /session`, `GET /session/:id/message`, shared `GET /event` consumer filtering `sessionID` and `message.part.delta`. *Avoid:* synchronous-only path if streaming is the goal — use `prompt_async` + SSE.

2. **Telegram minimal loop**  
   Allowlist, text in → `prompt_async`, stream to one throttled message, plain-text safe path. *Delivers:* proof of streaming. *Pulls in:* table stakes feedback (`typing`, errors).

3. **Rendering pipeline**  
   marked + sanitize-html, 4096 handling, final “clean” message after `session.idle` / end of deltas. *Avoid:* formatting pitfalls above.

4. **Session commands & registry**  
   `/new`, `/switch`, `/sessions`, `/status`; chat → session map; optional persistence spike if needed. *Depends on:* stable session IDs from OpenCode.

5. **Questions & permissions**  
   `question.asked` → inline keyboard + `POST /question/.../reply`; `permission.asked` → reply endpoints. *Needs:* correlation IDs and FSM for pending answers; integrates with cancel/abort.

6. **Power features**  
   File parts/uploads, model/context commands via config and prompt bodies, `/cancel` → `POST .../abort`, structured **pino** logging. *Research flag:* file API details and attachment limits.

**Phases likely to need deeper implementation research:** question/permission event shapes with real payloads; optional **sendMessageDraft** adoption; large-file path. **Phases with stronger patterns:** grammY middleware, fetch-based HTTP, HTML sanitization (well-documented constraints).

---

*Aggregated for roadmap and requirements; see STACK.md, FEATURES.md, and ARCHITECTURE.md for full detail.*
