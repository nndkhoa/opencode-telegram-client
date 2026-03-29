# Phase 6: Power Features - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver **photo-only** ingestion into the active OpenCode session (with guards below), **structured logging** (Telegram incoming, OpenCode requests, SSE summaries, errors) with **daily-rotating files under `logs/`** plus stdout, a **minimal README** (install, env table, run — no external links, no logging section per user), and **verify** existing **`/model`** vs **`/status`** (**FILE-02**). **Do not implement `/clear`** — users start fresh context with **`/new <name>`** (and existing session commands) instead of a dedicated clear command (**FILE-03** satisfied by **`/new`**, not **`/clear`**).

**Requirements alignment note:** **FILE-01** currently mentions **document**; this phase implements **photos only** per user decision — update **REQUIREMENTS.md** / traceability during planning if needed.

</domain>

<decisions>
## Implementation Decisions

### Photo uploads (Telegram → OpenCode)
- **D-01:** **Photos only** in v1 — handle **`message:photo`** (download best/largest size appropriate for the model). **Do not** handle **`document`** in this phase unless scope is explicitly expanded later.
- **D-02:** **Ignore caption** — do **not** send caption text to OpenCode (**3b**).
- **D-03:** Any **non-photo** media (documents, voice, video, stickers, etc.): reply with a **short “not supported yet”** message (**2a**), not silent ignore.
- **D-04:** Same **allowlist** and **session resolution** as text (`SessionRegistry` / active session).

### `/clear` — not in scope
- **D-05:** **No `/clear` command.** Fresh context is achieved via **`/new`** (and related session behavior), consistent with Phase 4.1 direction. Do not add **`/clear`** to BotFather menu or handlers for this phase.

### Logging (pino)
- **D-06:** **LOG-01 (incoming Telegram)** at **info**: **user id**, **chat id**, **update type**, **message id**, **timestamp**.
- **D-07:** **LOG-02 / LOG-03 (OpenCode HTTP)** at **info**: **method**, **path**, **session id** — **no** full bodies at info.
- **D-08:** **SSE / streaming** at **info**: **event type** + **session id** only — **no** per-token delta logging at info.
- **D-09:** **LOG-04:** Errors from Telegram and OpenCode with actionable context; **never** log secrets (e.g. bot token).
- **D-10:** **LOG-05:** Structured **JSON**; extend **`src/logger.ts`**. **Output:** **stdout** and a **log file** with **daily rotation** under project **`logs/`** (create directory as needed; exact transport — **Claude’s discretion**, e.g. rotating file sink compatible with pino).
- **D-11:** **README does not** document **`logs/`**, rotation, or logging setup (**2c** for Area 4).

### README (INFRA-03)
- **D-12:** **Minimal only:** what the project is, **install**, **env vars table**, **how to run** (**1a**). No troubleshooting section required by this context.
- **D-13:** **No external links** to OpenCode docs, Telegram BotFather, etc. (**3** — “nothing”).

### Model switching (FILE-02)
- **D-14:** **Regression / consistency check** only — **`/model`** and **`/status`** stay aligned with Phases 4.1/4.2; no redesign unless a bug is found.

### Overlap — photos vs busy & MCP
- **D-15:** If chat is **busy** (streaming in progress): **same behavior as text** — **⏳** wait reply; **do not** start a new **`prompt_async`** for the photo (**1a**).
- **D-16:** If **awaiting MCP free-text** answer: **photo is not** a valid answer — short message to **reply with text** or **`/cancel`** (**2a**).
- **D-17:** If **MCP inline keyboard** prompt is active: **photo does not** satisfy the prompt — same guidance as **D-16** (**3a**).

### Claude's Discretion
- OpenCode **file/image part** wire format from **`GET /doc`**
- **`logs/`** naming pattern, retention, and rotating file implementation details
- Exact copy for “not supported” and MCP conflict messages

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/ROADMAP.md` — Phase 6 goal (reconcile **`/clear`** / **FILE-03** with **D-05** if roadmap still says **`/clear`**)
- `.planning/REQUIREMENTS.md` — LOG-01–LOG-05, INFRA-03, FILE-01 (**photo vs document**), FILE-02, FILE-03
- `.planning/PROJECT.md` — Constraints, out-of-scope log DB

### OpenCode API & architecture
- `.planning/research/ARCHITECTURE.md` — `prompt_async` **parts**, sessions
- **`GET /doc`** on the local OpenCode server — image/file part shapes for the installed version

### Prior phase patterns
- `.planning/phases/05-mcp-questions-permissions/05-CONTEXT.md` — Pending interactive, **MCP-06**
- `.planning/phases/04-session-commands/04-CONTEXT.md` — **`/new`**, **`SessionRegistry`**
- `.planning/phases/04.1-model-switching-context-clear/04.1-CONTEXT.md` — **`/model`**, **`/clear`** dropped in 4.1 (**superseded here** by **D-05**)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/logger.ts` — extend for dual output + rotation
- `src/bot/handlers/message.ts` — text guards; add **`message:photo`** path reusing busy/MCP checks (**D-15**–**D-17**)
- `src/opencode/session.ts` — `prompt_async`; extend for image parts per OpenCode spec
- `src/session/registry.ts` — active session binding

### Established Patterns
- Busy guard and MCP await behavior mirror text (**D-15**–**D-17**)
- Commands before catch-all; **no** new **`clear`** command

### Integration Points
- `src/bot/index.ts` — register photo handler
- `src/main.ts` — **no** `setMyCommands` entry for **`clear`**

</code_context>

<specifics>
## Specific Ideas

- User decisions captured **2026-03-29** across Areas 1–5 (photo-only, no **`/clear`**, logging + daily **`logs/`**, minimal README without links or logging docs, overlap rules).

</specifics>

<deferred>
## Deferred Ideas

- **Document uploads** — not in v1 scope per **D-01**
- **README** troubleshooting + logging docs — deferred by **D-12** / **D-11**
- **External doc links** in README — deferred by **D-13**

</deferred>

---

*Phase: 06-power-features*
*Context gathered: 2026-03-29*
