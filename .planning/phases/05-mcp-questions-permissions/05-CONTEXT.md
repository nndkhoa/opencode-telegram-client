# Phase 5: MCP Questions & Permissions - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

When OpenCode emits **`question.asked`** or **`permission.asked`** on the shared SSE stream, the bot surfaces them in Telegram: inline keyboards when selectable options exist, a free-text capture path when questions are open-ended, and **Allow / Deny** for permissions. User responses are relayed to **`POST /question/{requestID}/reply`** and **`POST /permission/{requestID}/reply`**. Pending interactive state is cleared on **`/cancel`**, session switch, or **`question.replied`** / **`question.rejected`** (and aligned clear rules below).

Requirements in scope: **MCP-01** through **MCP-06**.

</domain>

<decisions>
## Implementation Decisions

### Permission: two buttons vs OpenCode reply shape
- **D-01:** **Allow** maps to `POST /permission/{requestID}/reply` with **`reply: "once"`** (approve for this request only).
- **D-02:** **Deny** maps to the same endpoint with **`reply: "reject"`**.
- **D-03:** Exposing **`always`** is **out of scope for Phase 5** — only two chrome buttons per roadmap; if product later needs “always allow,” that is a new UX/API discussion (backlog), not this phase.

### Inline keyboards: many options & multi-select
- **D-04:** **Single-choice** questions: one inline button per option; use multiple rows as needed for readability (exact layout is implementation detail).
- **D-05:** If **`multiple: true`**: maintain **selected option indices in bot-side pending-question state**; show a **Submit** / **Done** (or equivalent) button that sends **`answers` in question order** per OpenCode (`QuestionAnswer[]` / ordered strings as required by API). Tapping an option toggles membership in the selection set (Telegram has no native checkbox — use stateful toggles + explicit submit).
- **D-06:** If the option set is **too large for one keyboard** (Telegram limits + UX): **paginate** — e.g. **Next** / **Prev** callbacks on the **same** Telegram message (edit in place), keeping **`requestID`** and pagination offset only in memory (not in callback_data if size is tight). If pagination is impractical for a pathological payload, **fall back to a numbered plain-text reply** for that question only (still satisfies “interactive” for the common case).

### Open-ended questions vs commands
- **D-07:** When **`question.asked`** has **no** (usable) inline options and the bot enters **“awaiting free-text answer”** mode: **registered bot commands still take precedence** — **`/cancel`**, **`/switch`**, **`/sessions`**, **`/status`**, **`/model`**, **`/help`**, **`/new`**, etc. run their normal handlers. Any behavior that **changes session, aborts work, or explicitly cancels** must **clear pending question state** per **MCP-06** and roadmap success criteria.
- **D-08:** **Non-command text** while in awaiting mode is treated as the **answer** and submitted via **`POST /question/{requestID}/reply`** (subject to API shape for open-ended/custom flows).

### Overlapping prompts & session targeting
- **D-09:** If a **new** `question.asked` or `permission.asked` arrives while another prompt is **still pending** for the same Telegram chat: **replace** — clear the previous pending state; the **latest** prompt is authoritative. Optionally edit or delete the older Telegram message to reduce confusion (**Claude’s discretion** on whether to leave stale messages vs mark superseded — prefer minimal spam).
- **D-10:** Handle **only** prompts whose **`sessionID`** (from SSE `properties`) matches the **active OpenCode session** for that Telegram chat (`SessionRegistry`). Ignore (with debug log) questions/permissions for **non-active** sessions so named-session switching does not mix flows.

### Claude's Discretion
- Exact **callback_data** encoding strategy (short IDs vs hashing) to stay under Telegram limits
- Pagination thresholds (when to paginate vs fall back to text)
- Whether to delete or edit superseded prompt messages
- Final **copy/emoji** for permission and question prompt messages (within existing project tone)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### OpenCode API & events
- `.planning/research/ARCHITECTURE.md` — `question.asked`, `permission.asked`, `POST /question/{requestID}/reply`, `POST /permission/{requestID}/reply`, `QuestionRequest` / `QuestionInfo` / permission reply enum
- `GET /doc` on the local OpenCode server (OpenAPI 3.1) — verify payload shapes for the installed version

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — **MCP-01** through **MCP-06**
- `.planning/ROADMAP.md` — Phase 5 goal and success criteria (inline keyboard, open-ended path, Allow/Deny, clear rules)
- `.planning/PROJECT.md` — Core value, Telegram HTML constraints for assistant output (question prompts may stay plain or use safe HTML — align with existing sanitization patterns)

### Prior phase patterns
- `.planning/phases/04-session-commands/04-CONTEXT.md` — `SessionRegistry`, command ordering, `/cancel` behavior
- `.planning/phases/02-minimal-telegram-loop/02-CONTEXT.md` — SSE event shapes, `StreamingStateManager` lifecycle

No third-party ADRs beyond project docs.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/opencode/sse.ts` + `src/opencode/streaming-state.ts` — SSE event dispatch; extend parsing beyond `message.part.delta` / `session.idle` for question/permission types
- `src/opencode/events.ts` — Currently loose `OpenCodeEvent` union; add discriminated types for `question.*` / `permission.*` as shapes are validated
- `src/bot/index.ts` — Register callback query handlers for inline keyboards; reuse allowlist patterns from Phase 1
- `src/session/` (registry) — Active session lookup for **D-10**

### Established Patterns
- Single shared **`GET /event`** connection with filtering by `sessionID`
- Commands registered before catch-all text handlers (**D-07** aligns with Phase 4 routing discipline)
- Emoji conventions for status/error messages (`❌`, `⏳`, `✅`, `ℹ️`)

### Integration Points
- SSE handler path: detect question/permission events → Telegram send/edit → HTTP reply to OpenCode
- Pending state: new module or extension of `StreamingStateManager` / parallel **PendingInteractiveState** map keyed by `chatId` (and possibly `requestID`)

</code_context>

<specifics>
## Specific Ideas

- User chose to discuss **all** listed gray areas in one pass; decisions above lock defaults compatible with **Allow/Deny** and **MCP-06** without expanding scope to **`always`** permission grants.

</specifics>

<deferred>
## Deferred Ideas

- **Permission `always`** — needs a third UX affordance or settings flow; not in Phase 5
- **Queueing** multiple pending questions — replaced by **latest wins** (**D-09**); revisit only if OpenCode guarantees ordering that requires a queue

</deferred>

---

*Phase: 05-mcp-questions-permissions*
*Context gathered: 2026-03-29*
