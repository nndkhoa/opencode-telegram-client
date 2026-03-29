# Phase 5: MCP Questions & Permissions — Research

**Researched:** 2026-03-29  
**Domain:** OpenCode SSE (`question.*`, `permission.*`) + Telegram inline keyboards / callbacks + REST reply endpoints  
**Confidence:** MEDIUM-HIGH (API shapes from project ARCHITECTURE + OpenCode SDK references; live `question.asked` payloads flagged in STATE.md as validation risk)

## User Constraints

### Phase boundary (from `05-CONTEXT.md`)

When OpenCode emits **`question.asked`** or **`permission.asked`** on the shared SSE stream, the bot surfaces them in Telegram: inline keyboards when selectable options exist, a free-text capture path when questions are open-ended, and a **three-button** permission keyboard mapping to **`once`** / **`always`** / **`reject`** (see **D-01–D-04**). User responses are relayed to **`POST /question/{requestID}/reply`** and **`POST /permission/{requestID}/reply`**. Pending interactive state is cleared on **`/cancel`**, session switch, or **`question.replied`** / **`question.rejected`** (and aligned clear rules below).

Requirements in scope: **MCP-01** through **MCP-06**.

### Implementation decisions (locked)

#### Permission: inline keyboard vs OpenCode reply shape (`once` / `always` / `reject`)

- **D-01:** **`POST /permission/{requestID}/reply`** uses the full enum: show **three** inline buttons whose payloads map to **`reply: "once"`**, **`reply: "always"`**, and **`reply: "reject"`** respectively (exact button labels are **Claude’s discretion**, but semantics must be unambiguous).
- **D-02:** **`once`** — grant for this request only.
- **D-03:** **`always`** — grant persistently per OpenCode semantics for this permission.
- **D-04:** **`reject`** — deny / reject the permission request.

#### Inline keyboards: many options & multi-select

- **D-05:** **Single-choice** questions: one inline button per option; use multiple rows as needed for readability (exact layout is implementation detail).
- **D-06:** If **`multiple: true`**: maintain **selected option indices in bot-side pending-question state**; show a **Submit** / **Done** (or equivalent) button that sends **`answers` in question order** per OpenCode (`QuestionAnswer[]` / ordered strings as required by API). Tapping an option toggles membership in the selection set (Telegram has no native checkbox — use stateful toggles + explicit submit).
- **D-07:** If the option set is **too large for one keyboard** (Telegram limits + UX): **paginate** — e.g. **Next** / **Prev** callbacks on the **same** Telegram message (edit in place), keeping **`requestID`** and pagination offset only in memory (not in callback_data if size is tight). If pagination is impractical for a pathological payload, **fall back to a numbered plain-text reply** for that question only (still satisfies “interactive” for the common case).

#### Open-ended questions vs commands

- **D-08:** When **`question.asked`** has **no** (usable) inline options and the bot enters **“awaiting free-text answer”** mode: **registered bot commands still take precedence** — **`/cancel`**, **`/switch`**, **`/sessions`**, **`/status`**, **`/model`**, **`/help`**, **`/new`**, etc. run their normal handlers. Any behavior that **changes session, aborts work, or explicitly cancels** must **clear pending question state** per **MCP-06** and roadmap success criteria.
- **D-09:** **Non-command text** while in awaiting mode is treated as the **answer** and submitted via **`POST /question/{requestID}/reply`** (subject to API shape for open-ended/custom flows).

#### Overlapping prompts & session targeting

- **D-10:** If a **new** `question.asked` or `permission.asked` arrives while another prompt is **still pending** for the same Telegram chat: **replace** — clear the previous pending state; the **latest** prompt is authoritative. Optionally edit or delete the older Telegram message to reduce confusion (**Claude’s discretion** on whether to leave stale messages vs mark superseded — prefer minimal spam).
- **D-11:** Handle **only** prompts whose **`sessionID`** (from SSE `properties`) matches the **active OpenCode session** for that Telegram chat (`SessionRegistry`). Ignore (with debug log) questions/permissions for **non-active** sessions so named-session switching does not mix flows.

#### Claude's Discretion

- Exact **callback_data** encoding strategy (short IDs vs hashing) to stay under Telegram limits
- Pagination thresholds (when to paginate vs fall back to text)
- Whether to delete or edit superseded prompt messages
- Final **copy/emoji** for permission and question prompt messages (within existing project tone)

### Deferred ideas (OUT OF SCOPE)

- **Queueing** multiple pending questions — replaced by **latest wins** (**D-10**); revisit only if OpenCode guarantees ordering that requires a queue

### Traceability note

`REQUIREMENTS.md` **MCP-04** text still says “Allow / Deny”; **implementation follows this CONTEXT**: three permission outcomes **once** / **always** / **reject**.

## Summary

Phase 5 extends the single shared `GET /event` SSE pipeline so that **`question.asked`** and **`permission.asked`** events produce Telegram UX: inline keyboards for structured choices, free-text capture for open-ended flows, and **three** permission buttons mapped to OpenCode’s **`once` / `always` / `reject`** replies. User actions call **`POST /question/{requestID}/reply`** and **`POST /permission/{requestID}/reply`**. Bot-side state must track **pending interactive context per chat** (request IDs, multi-select sets, pagination offsets), enforce **latest prompt wins** when overlapping SSE events arrive, and **filter by active `SessionRegistry` session** so background sessions do not steal UI. grammY already registers commands before `message:text`; Phase 5 adds **`callback_query`** handlers and a narrow **“awaiting answer”** path on text that must still yield to commands (**D-08**). Telegram **`callback_data`** is capped at **64 bytes**, so payloads either stay tiny or map through in-memory IDs.

**Primary recommendation:** Introduce a dedicated **`PendingInteractiveState`** (or extend the streaming manager with a sibling module) keyed by **`chatId`**, wired from SSE in `main.ts` (or a thin dispatcher) and from new **`bot.on("callback_query")`** handlers; keep **`StreamingStateManager`** focused on streaming turns. Validate and narrow **`OpenCodeEvent`** in `events.ts` for `question.*` / `permission.*`; confirm exact JSON shapes against **`GET /doc`** on the installed OpenCode build before locking Zod schemas.

<phase_requirements>
## Phase Requirements

| ID | Description | Research support |
|----|-------------|-------------------|
| MCP-01 | `question.asked` with selectable options → inline keyboard | D-05, D-06, D-07; Telegram `InlineKeyboardMarkup`; option rows |
| MCP-02 | `question.asked` with no usable inline options → plain prompt + next message as answer | D-08, D-09; `QuestionInfo.options` / `custom` semantics from OpenCode |
| MCP-03 | User answer → `POST /question/{requestID}/reply` | ARCHITECTURE: `{ answers }` in question order |
| MCP-04 | `permission.asked` → inline keyboard | D-01–D-04: **three** buttons (not REQUIREMENTS.md’s legacy “Allow/Deny” wording) |
| MCP-05 | Permission answer → `POST /permission/{requestID}/reply` | Body `{ reply: "once"\|"always"\|"reject", message? }` |
| MCP-06 | Clear pending on `/cancel`, `question.replied`/`question.rejected`, session switch | D-08, D-10, D-11; integrate with cmd-cancel and switch handlers |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why standard |
|---------|---------|---------|--------------|
| **grammY** | 1.41.1 (verify: `npm view grammy version`) | Bot framework, `callback_query`, `InlineKeyboard` | Already in project; TypeScript-first |
| **TypeScript** | ^6.x (project) | Strict typing for event unions | Existing |
| **Vitest** | latest (project) | Unit tests | Existing |
| **zod** | ^4.3.6 | Optional runtime validation of SSE payloads | Already a dependency |

### Supporting

| Mechanism | Purpose | When to use |
|-----------|---------|-------------|
| **`fetch`** (native) | `POST` reply endpoints | Same as existing OpenCode client patterns |
| **In-memory `Map`** | Pending state per `chatId` | Matches SESSION registry pattern; v1 no persistence |

### Alternatives considered

| Instead of | Could use | Tradeoff |
|------------|-----------|----------|
| In-memory pending map | Redis | Overkill for local single-user bot |
| Polling `GET /question` | SSE only | CONTEXT assumes SSE-driven UX; polling optional backfill on reconnect only if needed |

**Installation:** No new packages required for baseline; add nothing unless validation or UX libraries are chosen later.

**Version verification:** `grammy@1.41.1`, `zod@4.3.6` per `package.json` and `npm view` (2026-03-29).

## Architecture Patterns

### Recommended structure

```
src/
├── opencode/
│   ├── events.ts              # EXTEND: discriminated types for question.* / permission.*
│   ├── sse.ts                 # unchanged SSE reader
│   ├── streaming-state.ts     # streaming turns (keep focused)
│   └── interactive-pending.ts  # NEW (suggested): PendingInteractiveState, clear rules
├── bot/
│   ├── index.ts               # register callback_query handlers + inject pending state
│   └── handlers/
│       ├── message.ts         # branch: awaiting answer vs prompt (D-08/D-09)
│       ├── cmd-cancel.ts      # MODIFY: clear pending + existing abort
│       ├── cmd-switch.ts      # MODIFY: clear pending on switch
│       └── ...                # other commands: clear pending when D-08 requires
└── main.ts                    # wire SSE → streaming + interactive dispatcher
```

### Pattern 1: SSE fan-out

**What:** `onEvent` in `main.ts` calls both `StreamingStateManager.handleEvent` and a new handler for interactive events.

**When:** Any `question.*` / `permission.*` for the active session.

**Example (conceptual):**

```typescript
// Pseudocode — dispatch order matters: filter sessionID === registry.getActiveSessionId(chatId?)
// Resolve chatId from in-memory map: sessionID → chatId maintained when prompts are shown
if (event.type === "question.asked" || event.type === "permission.asked") {
  await pendingInteractive.onAsked(event, bot.api);
}
```

**Anti-patterns:**

- **Stuffing interactive logic into `StreamingStateManager`** — mixes concerns; streaming turns and MCP prompts have different lifecycles.
- **Ignoring D-11** — forwarding replies for wrong `sessionID` breaks multi-session UX.

### Pattern 2: Session ↔ chat correlation

**What:** When showing a prompt, record `sessionID → chatId` (and `requestID`, Telegram `message_id`) so SSE events can find the right chat without Telegram IDs in OpenCode.

**When:** First send of keyboard or prompt message.

### Pattern 3: Latest wins (D-10)

**What:** On new `question.asked` / `permission.asked`, replace pending state; optionally `editMessageText` or delete prior prompt message.

**When:** Always for same chat when a prompt is already pending.

## OpenCode API notes

**Sources:** `.planning/research/ARCHITECTURE.md`; authoritative per-install: **`GET http://localhost:4096/doc`** (OpenAPI 3.1).

### SSE events (non-exhaustive)

| `type` | Role |
|--------|------|
| `question.asked` | Interactive question; correlate `requestID`, `sessionID` in `properties` |
| `question.replied` / `question.rejected` | Lifecycle — **clear pending** (MCP-06) |
| `permission.asked` | Sandbox/tool permission prompt |
| `permission.replied` | Permission resolved (may inform logging; clearing pending may already happen on HTTP reply) |

**Shape:** Align with Phase 2 rule: **`properties`-nested** `{ type, properties: { sessionID, ... } }` — validate against live payloads (**STATE.md** flags schema risk).

### HTTP: question reply

| Method | Path | Body |
|--------|------|------|
| `POST` | `/question/{requestID}/reply` | `{ "answers": QuestionAnswer[] }` — answers in **question order** (see generated SDK / OpenAPI) |
| `POST` | `/question/{requestID}/reject` | Reject flow if needed |

**`QuestionRequest` (conceptual):** includes `id`, `sessionID`, `questions: QuestionInfo[]`, optional `tool: { messageID, callID }`.  
**`QuestionInfo`:** `question`, `header`, `options[]` (`label`, `description`), optional `multiple`, `custom` (free text).

### HTTP: permission reply

| Method | Path | Body |
|--------|------|------|
| `POST` | `/permission/{requestID}/reply` | `{ "reply": "once" \| "always" \| "reject", "message"?: string }` |

This matches **D-01–D-04** and supersedes two-button “Allow/Deny” wording in older requirement text.

### Risk

**LOW confidence on field-level JSON** until verified on target OpenCode version — use **`/doc`** or SDK `types.gen.ts` at install time.

## Telegram / grammY patterns

### Inline keyboards

- Build with **`InlineKeyboard`** from `grammY` (or raw `InlineKeyboardMarkup` objects).
- **Multiple rows:** array of rows, each row is an array of buttons — use for readability (**D-05**).

### `callback_query`

- Register with **`bot.on("callback_query")`** or **`bot.callbackQuery(...)`** with filters **after** the same middleware stack as messages (allowlist already supports callbacks — **ACC-02**).
- Always call **`ctx.answerCallbackQuery()`** (optionally with `text`) so the client stops showing a loading state — mirror Phase 1 allowlist behavior for denied users.

### `callback_data` size limit

- Telegram **`InlineKeyboardButton.callback_data`**: **1–64 bytes** ([Telegram Bot API — `InlineKeyboardButton`](https://core.telegram.org/bots/api#inlinekeyboardbutton)).
- **Implication:** Do not embed long `requestID`s + indices if they exceed 64 bytes; use **short opaque keys** mapped in memory (**D-07**, Claude’s discretion), or compress/hashing strategy with collision-safe map.

### Commands vs free text (**D-08**)

- Keep **`bot.command(...)`** registrations **before** catch-all **`message:text`** (already true in `createBot`).
- **Awaiting-answer mode:** Implement as **early branch inside `makeMessageHandler`** *or* middleware that runs **after** command routing — grammY dispatches commands first when registered with `bot.command`, so plain `/cancel` still hits `cmd-cancel` if registered correctly. **Verify:** command messages may appear as `message:text` starting with `/` — grammY’s command plugin handles this when using `bot.command`; do not duplicate a second catch-all that swallows commands.

### Multi-select (**D-06**)

- Toggle selection in server-side state; **Submit** button sends ordered `answers` once.

### Pagination (**D-07**)

- **`editMessageText`** + new `reply_markup` for Next/Prev; state holds page index + `requestID`.

## Don't Hand-Roll

| Problem | Don't build | Use instead |
|---------|-------------|-------------|
| SSE parsing | Custom protocol | Existing `sse.ts` line parser |
| Telegram HTML safety for prompts | Ad-hoc tags | Reuse `sanitize-html` / plain text for prompts if unsure |
| Permission semantics | Invent “allow/deny” binary | OpenCode enum **once/always/reject** |

## Common Pitfalls

### Pitfall 1: Stale `sessionID` (D-11)

**What goes wrong:** User switches session; SSE still delivers events for old session → wrong UI or double prompts.  
**Why:** OpenCode continues other sessions in background.  
**How to avoid:** Compare `properties.sessionID` to `registry.getActiveSessionId(chatId)` before surfacing UI.  
**Warning signs:** Prompts appearing after `/switch` for the “wrong” conversation context.

### Pitfall 2: `callback_data` overflow

**What goes wrong:** Telegram rejects API call with `BUTTON_DATA_INVALID`.  
**Why:** Payload > 64 bytes.  
**How to avoid:** Short keys + in-memory map; pagination state in RAM (**D-07**).

### Pitfall 3: Blocked loading spinner (ACC-02)

**What goes wrong:** User sees endless spinner on button tap.  
**Why:** Handler throws before `answerCallbackQuery`.  
**How to avoid:** `try/finally` with `answerCallbackQuery`; allowlist already answers for denied users — keep same for errors.

### Pitfall 4: Swallowing commands in “awaiting answer” mode

**What goes wrong:** `/switch` treated as literal answer text.  
**Why:** Wrong handler order or custom text router intercepting commands.  
**How to avoid:** Rely on grammY **`bot.command`** precedence (**D-08**); add tests for `/switch` while awaiting.

### Pitfall 5: Latest prompt without clearing old UI (D-10)

**What goes wrong:** Two keyboards both “work” or user answers stale `requestID`.  
**Why:** Forgot to replace pending state.  
**How to avoid:** Atomic replace of pending record; invalidate old `callback_data` map entries.

### Pitfall 6: OpenCode / REQUIREMENTS wording drift

**What goes wrong:** Plan implements binary Allow/Deny only.  
**Why:** **MCP-04** in REQUIREMENTS.md not updated.  
**How to avoid:** Treat **05-CONTEXT.md** as source of truth for permission UX.

## Validation Architecture

> `workflow.nyquist_validation` is **true** in `.planning/config.json` — include concrete test dimensions.

### Test framework

| Property | Value |
|----------|-------|
| Framework | Vitest (`src/**/*.test.ts`) |
| Config | `vitest.config.ts` |
| Quick run | `npm test` or `npx vitest run` |
| Full suite | same |

### Nyquist-style dimensions (verifiable)

| Dimension | What “good” means | Example automated check |
|-----------|-------------------|-------------------------|
| **SSE parsing** | `question.asked` / `permission.asked` JSON parses; types narrow safely | Unit test: fixture strings → expected discriminated union / fields |
| **Session gate (D-11)** | Non-active `sessionID` → no `sendMessage` / no state mutation | Mock API + registry with two sessions; assert ignore path |
| **Latest wins (D-10)** | Second prompt replaces first pending state | Unit test: two sequential `onAsked` → single pending `requestID` |
| **Permission POST (D-01)** | Three callbacks produce `{ reply: "once"\|"always"\|"reject" }` | Mock `fetch`; assert body |
| **Question POST (MCP-03)** | Single- and multi-select build correct `answers` order | Mock `fetch`; assert JSON |
| **Command precedence (D-08)** | While “awaiting”, `/cancel` fires cancel handler, not answer | Integration-style: `Bot` + test updates with `callback_query` / command sequencing |
| **Clear rules (MCP-06)** | `/cancel`, `question.replied`, switch → pending cleared | Unit tests on `PendingInteractiveState` |
| **Allowlist (ACC-02)** | Callback from unlisted user answered + blocked | Extend pattern from `allowlist.test.ts` for new handler if separate |

### Wave 0 gaps (likely)

- [ ] `src/opencode/events.test.ts` or extend — SSE fixtures for `question.*` / `permission.*`
- [ ] `src/opencode/interactive-pending.test.ts` (new) — state machine for D-10/D-11/D-06
- [ ] Handler tests — mock `ctx.api` and `fetch` for OpenCode replies

### Phase gate

- `npx vitest run` green; manual UAT with real OpenCode MCP tool that triggers questions/permissions (environment-dependent).

## Sources

### Primary (HIGH)

- `.planning/research/ARCHITECTURE.md` — endpoints, event names, question/permission flows
- `.planning/phases/05-mcp-questions-permissions/05-CONTEXT.md` — locked decisions D-01–D-11
- [Telegram Bot API — InlineKeyboardButton](https://core.telegram.org/bots/api#inlinekeyboardbutton) — `callback_data` 64-byte limit

### Secondary (MEDIUM)

- `.planning/STATE.md` — SSE `properties` nesting; OpenCode schema validation risk
- `src/session/registry.ts`, `src/main.ts`, `src/bot/index.ts` — integration points

### Tertiary (LOW — validate before implementation)

- Exact `question.asked` payload fields for your OpenCode version — **`GET /doc`**

## Metadata

**Confidence breakdown:**

- Standard stack: **HIGH** — project locked to grammY + existing patterns
- Architecture: **MEDIUM-HIGH** — pending-state design is standard; session↔chat mapping must be implemented carefully
- Pitfalls: **HIGH** — Telegram limits and session filtering are well-understood failure modes

**Research date:** 2026-03-29  
**Valid until:** ~30 days (OpenCode event schemas should be re-verified after any server upgrade)

## RESEARCH COMPLETE
