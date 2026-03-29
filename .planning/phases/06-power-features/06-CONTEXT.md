# Phase 6: Power Features - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Ship **file uploads** into the active OpenCode session, implement **`/clear`** for session context reset, **complete structured logging** (incoming Telegram, outgoing OpenCode requests, SSE/event summaries, errors) per requirements, and a **README** for setup and run. **`/model`** is already implemented in Phases 4.1/4.2; this phase **verifies** alignment with `/status` and documents behavior rather than re-building model switching.

Requirements in scope: **FILE-01**, **FILE-03**, **LOG-01**–**LOG-05**, **INFRA-03**; **FILE-02** verification/docs only.

</domain>

<decisions>
## Implementation Decisions

### File uploads (Telegram → OpenCode)
- **D-01:** Support **`document`** messages and **`photo`** messages. Download the file from Telegram (best photo size for `photo` arrays), forward into the active session’s next **`prompt_async`** using **file parts** (exact wire shape and any upload helper endpoints — **researcher** confirms against OpenCode `GET /doc` / SDK types).
- **D-02:** Include **caption** text when present as accompanying **text** in the same prompt (same user turn as the file).
- **D-03:** **Other media** (voice, video, stickers, etc.) — reply with a short **not supported in v1** message (no silent drop).
- **D-04:** Enforce the same **allowlist** and **session resolution** as text messages (`SessionRegistry.getOrCreateDefault` / active session).

### `/clear`
- **D-05:** **`/clear`** means **discard conversation context** for the **current active OpenCode session** for this chat. **Implementation strategy (locked intent):** use the **smallest official OpenCode operation** that achieves an empty or fresh thread for that session; if no dedicated “clear messages” route exists, **delete the OpenCode session and create a new one**, then **rebind** the chat’s active session ID in **`SessionRegistry`** (same high-level outcome as a fresh thread without requiring a new Telegram-side “named session”).
- **D-06:** **`/clear`** clears **pending MCP interactive state** for the chat (same family of rules as session switch / **MCP-06**).
- **D-07:** **`/clear`** **aborts** an in-flight streamed turn (**`POST .../abort`**) before applying reset, consistent with not leaving dangling streams.
- **D-08:** **No** extra confirmation step (fast local-dev UX); **`/help`** text should state that **`/clear` is destructive** to the current session’s conversation.

### Logging (pino)
- **D-09:** **LOG-01:** Log every incoming Telegram update relevant to the bot: at minimum **user id**, **chat id**, **update type** / message kind, **timestamp**, and **message id** where applicable.
- **D-10:** **LOG-02 / LOG-03:** Log outgoing OpenCode HTTP calls and **non-delta** responses at **info**: **method**, **path**, **session id** when applicable; **truncate or omit** large bodies at **info** (full bodies only at **debug** if needed for development).
- **D-11:** **LOG-04:** Log Telegram API errors and OpenCode errors with **enough context** to debug (endpoint, session id, error message / code); avoid logging secrets.
- **D-12:** **LOG-05:** **Structured JSON** in production; **human-readable** (`pino-pretty`) in non-production — extend existing `src/logger.ts` rather than introducing a second logger.
- **D-13:** **Never** log **`TELEGRAM_BOT_TOKEN`** or other secrets; **never** log full **SSE `message.part.delta` streams** at **info** (aggregate or **debug**-only sampling).

### README (INFRA-03)
- **D-14:** **README.md** includes: **what the project is**, **prerequisites** (Node version, local OpenCode), **required env vars** (table), **install**, **how to run**, **OpenCode base URL** assumption (`localhost:4096`), and a **short troubleshooting** section (**connection refused** to OpenCode, **allowlist** misconfiguration).

### Model switching (FILE-02 — verification)
- **D-15:** No behavioral rewrite of **`/model`** unless Phase 6 testing finds a **bug** or **REQ gap**; **`/status`** and **`/model`** should remain **consistent** with existing shared resolution (Phases 4.1/4.2).

### Concurrency & MCP overlap (files)
- **D-16:** If the chat is **busy** with an in-flight stream (same guard as text): **do not** process a new file — reply with the existing **⏳** pattern.
- **D-17:** If the chat is **awaiting an MCP free-text answer**: **do not** treat a file as the answer — reply that **text** is required (or user may **`/cancel`**). Same idea if a **keyboard** prompt is pending: **file does not satisfy** the prompt.

### Claude's Discretion
- Exact **OpenCode** request bodies for **file parts** and the precise **clear** sequence once `GET /doc` is consulted
- Telegram **download** helpers (grammY `getFile` flow), **mime** handling, and **size** limits messaging
- Exact **pino** child loggers / field names and **truncate** lengths for bodies
- README **tone** and exact subsection titles

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/ROADMAP.md` — Phase 6 goal and success criteria
- `.planning/REQUIREMENTS.md` — FILE-01, FILE-03, LOG-01–LOG-05, INFRA-03; FILE-02 cross-check
- `.planning/PROJECT.md` — Core value, constraints, out-of-scope logging storage

### OpenCode API & architecture
- `.planning/research/ARCHITECTURE.md` — Sessions, `prompt_async` **parts**, `DELETE /session/:id`, message listing, config, logging boundary notes
- `.planning/research/SUMMARY.md` — Synthesized stack and phase ordering notes
- **`GET /doc`** on the local OpenCode server (OpenAPI) — **mandatory** for file-part shapes and any **clear/reset** routes available in the installed version

### Prior phase patterns
- `.planning/phases/05-mcp-questions-permissions/05-CONTEXT.md` — Pending interactive state, **MCP-06** clear hooks
- `.planning/phases/04-session-commands/04-CONTEXT.md` — `SessionRegistry`, command ordering, **`/cancel`**
- `.planning/phases/04.1-model-switching-context-clear/04.1-CONTEXT.md` — **`/model`** / config API decisions (superseded for **`/clear`** by this phase’s **D-05**–**D-08**)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/logger.ts` — pino baseline; extend for component loggers and redaction helpers
- `src/bot/handlers/message.ts` — text path and busy/MCP guards; **new** handler(s) for `message:document` / `message:photo` should reuse the same guards (**D-16**, **D-17**)
- `src/opencode/session.ts` — `prompt_async` client; extend for multipart / parts payloads per OpenCode spec
- `src/session/registry.ts` — active session per chat; **rebind** after session delete+recreate for **`/clear`**
- `src/bot/handlers/cmd-cancel.ts` (or equivalent) — **abort** pattern for **D-07**

### Established Patterns
- Commands registered **before** catch-all handlers; **`/clear`** as a **bot.command** handler
- Emoji/status copy for errors and waits (**⏳**, **❌**, **✅**)
- Single shared **SSE** connection; logging should not duplicate full delta traffic (**D-13**)

### Integration Points
- `src/bot/index.ts` — register document/photo handlers; register **`/clear`**
- `src/main.ts` — optional **`setMyCommands`** update to include **`/clear`**
- OpenCode HTTP layer — any new **file upload** URL if required by API, else inline **parts** on **`prompt_async`**

</code_context>

<specifics>
## Specific Ideas

- **2026-03-29:** User asked to discuss **all** listed gray areas; decisions above use **recommended defaults** for file types, **`/clear`** semantics, logging policy, README depth, and file-vs-MCP overlap.

</specifics>

<deferred>
## Deferred Ideas

- **Queueing** user messages while streaming (**v2 ADV-03**) — remains out of scope; **D-16** keeps **reject while busy**
- **Persistent log database / querying** — **PROJECT.md** out of scope; console/file only

</deferred>

---

*Phase: 06-power-features*
*Context gathered: 2026-03-29*
