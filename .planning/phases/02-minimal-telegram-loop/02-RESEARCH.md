# Phase 2: Minimal Telegram Loop - Research

**Researched:** 2026-03-28
**Domain:** Telegram Bot API streaming + OpenCode SSE integration
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Session Bootstrap**
- D-01: Auto-create `POST /session` on the first message for a given chatId. Store the returned sessionId in an in-memory `Map<chatId, sessionId>`. Reuse on all subsequent messages from the same chat. Phase 4 takes over this map when it adds the full session registry.

**Turn-End Detection**
- D-02: `session.idle` SSE event is the definitive signal that streaming is complete and the final message should be sent. Do not rely on timeouts or `message.updated` as primary signals.

**Streaming UX**
- D-03: While streaming, prefix the accumulating plain-text buffer with a `⏳ Thinking...` header line. Example interim message:
  ```
  ⏳ Thinking...

  Here is the response so far...
  ```
- D-04: On `session.idle`, replace the interim message with the final clean output (Phase 3 adds HTML rendering; for now plain text is acceptable for the final message too). Remove the `⏳ Thinking...` prefix entirely.
- D-05: Throttle `editMessageText` to ~500ms between edits (MSG-03). Coalesce incoming `message.part.delta` tokens into the buffer; only push an edit when the throttle window opens.

**Error Handling**
- D-06 (unreachable at send time): If `prompt_async` fails (OpenCode unreachable or HTTP error), edit the interim "thinking" message to show a clear error. Example: `❌ OpenCode is unreachable. Make sure it's running at localhost:4096.`
- D-07 (mid-stream error): If an error occurs after streaming has started (SSE disconnect, unexpected event), edit the interim message to show an error and discard the partial content. Do not leave partial text in the message. Example: `❌ Something went wrong mid-response. Please try again.`

**Concurrency Guard**
- D-08: If the user sends a message while a response is already streaming for their chat, reject immediately with: `⏳ Still working on your last message. Please wait.` Do not forward the message to OpenCode. Track per-chatId "busy" state alongside the session map.

**Streaming State Shape (Claude's Discretion on exact fields)**
- Per active turn, maintain streaming state: `{ sessionId, telegramChatId, telegramMessageId, buffer, lastEditAt, busy }`. Clear on `session.idle` or error.

### Claude's Discretion
- Exact in-memory data structure for the chat→session map and streaming state (e.g. a single `Map` with a compound value, or separate maps).
- Whether `typing` chat action (MSG-02) is sent once at message receipt or periodically during streaming.
- File/module organization for the new handler code (e.g. `src/bot/handlers/message.ts`, `src/opencode/session.ts`).

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope. Session management commands (`/new`, `/switch`, `/sessions`) are NOT in scope — Phase 4.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MSG-01 | User can send a text message and receive a response from OpenCode via the active session | `POST /session/:id/prompt_async` → SSE `message.part.delta` → `editMessageText` |
| MSG-02 | Bot sends a `typing` chat action while waiting for OpenCode to respond | `sendChatAction(chatId, "typing")` via grammY context or `bot.api` |
| MSG-03 | Response streams live — bot edits the Telegram message as tokens arrive (throttled, max ~1 edit/500ms) | Throttle pattern with `lastEditAt` timestamp comparison; coalesce delta buffer |
| MSG-04 | After streaming completes, the interim message is replaced with a clean final message rendered as Telegram-safe HTML | On `session.idle` event: call `editMessageText` with final buffer (plain text for Phase 2) |
| MSG-07 | Bot sends a clear, actionable error message if OpenCode is unreachable or returns an error | Catch `fetch` errors + non-2xx HTTP; `editMessageText` or `reply` with error text |
</phase_requirements>

---

## Summary

Phase 2 wires three systems together: the grammY Telegram bot (already running with allowlist middleware), the OpenCode REST API (`POST /session`, `POST /session/:id/prompt_async`), and the shared SSE connection (`startSseLoop` with `onEvent` callback). The core work is replacing the Phase 1 echo handler with a real message handler that (1) creates/reuses a session per chatId, (2) sends the prompt via `prompt_async`, (3) streams token deltas via throttled `editMessageText`, and (4) commits a final clean message on `session.idle`.

The SSE event shapes have been **verified against a live OpenCode 1.3.3 instance**. The key event is `message.part.delta` with properties `{ sessionID, messageID, partID, field, delta }` — the `delta` field carries the text token. Turn completion arrives as `session.idle` with `{ sessionID }`. Both are nested under a `properties` key in the JSON payload, not at the top level.

**Primary recommendation:** Use the existing `startSseLoop` / `onEvent` callback as the routing bus. Wire a `StreamingStateManager` singleton that maps `sessionID` → active turn state. The message handler creates/reuses the session and calls `prompt_async`; the `onEvent` callback drives all subsequent Telegram edits.

---

## Standard Stack

### Core (all already installed in package.json)

| Library | Version (installed) | Purpose | Why Standard |
|---------|---------------------|---------|--------------|
| grammy | 1.41.1 | Telegram bot framework | TypeScript-first, supports `sendChatAction`, `editMessageText`, `sendMessageDraft` |
| @microsoft/fetch-event-source | ^2.0.1 | SSE client | Already wired in `startSseLoop`; handles POST + auth headers |
| pino | ^10.3.1 | Structured logging | Project standard; child loggers for sessionId context |
| typescript | ^6.0.2 | Type safety | Project standard; strict mode on |
| vitest | latest | Testing | Project standard; all 18 Phase 1 tests pass |

**No new dependencies needed for Phase 2.** All required libraries are already installed.

### Telegram Streaming APIs Available

| API | grammY Support | Use Case |
|-----|----------------|----------|
| `editMessageText(chatId, msgId, text)` | ✅ `bot.api.editMessageText(...)` | Throttled streaming updates (D-05) |
| `sendMessageDraft(chatId, draftId, text)` | ✅ Added in grammY 1.41.1 | Native streaming alternative — Bot API 9.3+, private chats only |
| `sendChatAction(chatId, "typing")` | ✅ `ctx.replyWithChatAction("typing")` | MSG-02 — typing indicator |

**Decision on `sendMessageDraft` vs `editMessageText`:** The CONTEXT.md decisions (D-03, D-04, D-05) are written for `editMessageText` semantics (interim message with `⏳ Thinking...` prefix, replaced on `session.idle`). `sendMessageDraft` is a Bot API 9.3+ feature (Dec 31, 2025) that streams partial messages without requiring a prior `sendMessage` call — it uses a `draft_id` integer and `parse_mode` support. However, since the decisions explicitly describe the `editMessageText` pattern and Phase 3 adds HTML rendering, **use `editMessageText` for Phase 2**. `sendMessageDraft` may be reconsidered for Phase 3 or later.

---

## Architecture Patterns

### Recommended Module Structure

```
src/
├── bot/
│   ├── index.ts              # Bot instance (Phase 1) — replace echo handler here
│   ├── handlers/
│   │   └── message.ts        # NEW: Phase 2 message handler
│   └── middleware/
│       ├── allowlist.ts      # Phase 1 (unchanged)
│       └── dm-only.ts        # Phase 1 (unchanged)
├── opencode/
│   ├── events.ts             # EXTEND: add typed message.part.delta + session.idle
│   ├── health.ts             # Phase 1 (unchanged)
│   ├── session.ts            # NEW: POST /session, POST .../prompt_async
│   ├── sse.ts                # Phase 1 (unchanged)
│   └── streaming-state.ts   # NEW: StreamingStateManager singleton
├── config/
│   ├── env.ts                # Phase 1 (unchanged)
│   └── parse-env.ts          # Phase 1 (unchanged)
├── logger.ts                 # Phase 1 (unchanged)
└── main.ts                   # MODIFY: wire onEvent callback to StreamingStateManager
```

### Pattern 1: SSE Event Routing via Callback

**What:** `main.ts` passes a real `onEvent` callback to `startSseLoop` that routes events to `StreamingStateManager.handleEvent(event)`.

**When to use:** Phase 1 already wired this stub. Phase 2 replaces the stub with real routing.

**Verified live SSE event shape (OpenCode 1.3.3):**

```typescript
// message.part.delta — actual shape from live server
// data: {"type":"message.part.delta","properties":{"sessionID":"ses_...","messageID":"msg_...","partID":"prt_...","field":"text","delta":"hello"}}

// session.idle — actual shape from live server
// data: {"type":"session.idle","properties":{"sessionID":"ses_..."}}

// IMPORTANT: properties are nested under "properties", NOT at the root of the JSON
// The existing parseEvent() returns OpenCodeEvent with top-level fields — needs update
```

**CRITICAL FINDING:** The existing `src/opencode/events.ts` has `sessionID` at the top level, but live OpenCode events have this shape:
```json
{
  "type": "message.part.delta",
  "properties": {
    "sessionID": "ses_...",
    "messageID": "msg_...",
    "partID": "prt_...",
    "field": "text",
    "delta": "hello"
  }
}
```

The `parseEvent` function currently returns `OpenCodeEvent` with `event.sessionID` at the top level, but the actual payload has `event.properties.sessionID`. The `startSseLoop` already logs `event.sessionID` which would be `undefined` on real events. **Phase 2 must fix the event type definitions and routing to use `event.properties`.**

**Example:**

```typescript
// Source: live OpenCode 1.3.3 SSE stream verified 2026-03-28
export type MessagePartDeltaEvent = {
  type: "message.part.delta";
  properties: {
    sessionID: string;
    messageID: string;
    partID: string;
    field: string;
    delta: string;
  };
};

export type SessionIdleEvent = {
  type: "session.idle";
  properties: {
    sessionID: string;
  };
};

export type OpenCodeEvent =
  | MessagePartDeltaEvent
  | SessionIdleEvent
  | { type: string; properties?: { sessionID?: string; [key: string]: unknown } };
```

### Pattern 2: StreamingStateManager

**What:** A class or plain object that maps `sessionID` → turn state and `chatId` → `{ sessionId, busy }`.

**When to use:** Created once in `main.ts`, shared between the message handler and `onEvent` callback.

```typescript
// Source: derived from CONTEXT.md D-08 + architecture research
type TurnState = {
  chatId: number;
  messageId: number;   // Telegram message ID for editMessageText
  buffer: string;
  lastEditAt: number;  // Date.now() of last edit
};

class StreamingStateManager {
  // chatId → sessionId (created on first message)
  private sessions = new Map<number, string>();
  // chatId → busy flag
  private busy = new Map<number, boolean>();
  // sessionId → active turn state (null = no active turn)
  private turns = new Map<string, TurnState>();

  isBusy(chatId: number): boolean { ... }
  getOrCreateSession(chatId: number): string | undefined { ... }
  setSession(chatId: number, sessionId: string): void { ... }
  startTurn(sessionId: string, chatId: number, messageId: number): void { ... }
  getTurn(sessionId: string): TurnState | undefined { ... }
  endTurn(sessionId: string): void { ... }
  handleEvent(event: OpenCodeEvent, bot: Api): void { ... }
}
```

### Pattern 3: Throttled editMessageText

**What:** Only call `editMessageText` when 500ms has elapsed since the last edit.

**When to use:** Inside `handleEvent` when processing `message.part.delta`.

```typescript
// Source: CONTEXT.md D-05
const THROTTLE_MS = 500;

async function maybeEdit(
  bot: Api,
  turn: TurnState,
  sessionId: string,
  manager: StreamingStateManager
): Promise<void> {
  const now = Date.now();
  if (now - turn.lastEditAt < THROTTLE_MS) return;
  turn.lastEditAt = now;
  const text = `⏳ Thinking...\n\n${turn.buffer}`;
  await bot.editMessageText(turn.chatId, turn.messageId, text).catch(() => {
    // ignore "message not modified" errors (Telegram 400)
  });
}
```

### Pattern 4: prompt_async HTTP call

**What:** `POST /session/:id/prompt_async` returns 204 No Content. Fire-and-forget from the message handler; all results arrive via SSE.

**Verified live:** Returns 204, body is empty. The SSE events follow shortly after.

```typescript
// Source: verified against live OpenCode 1.3.3
export async function sendPromptAsync(
  baseUrl: string,
  sessionId: string,
  text: string
): Promise<void> {
  const url = new URL(`/session/${sessionId}/prompt_async`, baseUrl).toString();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      parts: [{ type: "text", text }],
    }),
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`prompt_async failed: HTTP ${res.status}`);
  }
}
```

### Pattern 5: Session auto-creation

**What:** `POST /session` with empty body returns a new session object.

**Verified live:**
```json
{
  "id": "ses_2cb3ae202ffeXW3v1oMrbw1OeH",
  "slug": "tidy-river",
  "version": "1.3.3",
  "projectID": "global",
  "directory": "/Users/admin",
  "title": "New session - 2026-03-28T14:07:06.752Z",
  "time": { "created": 1774706826752, "updated": 1774706826752 }
}
```

```typescript
// Source: verified against live OpenCode 1.3.3
export async function createSession(baseUrl: string): Promise<string> {
  const res = await fetch(new URL("/session", baseUrl).toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`POST /session failed: HTTP ${res.status}`);
  const data = await res.json() as { id: string };
  return data.id;
}
```

### Anti-Patterns to Avoid

- **Routing SSE events by `event.sessionID` (wrong):** Live events have `event.properties.sessionID`. Using `event.sessionID` will always be `undefined`.
- **Calling `editMessageText` on every delta:** Rate-limited by Telegram — throttle to 500ms.
- **Not catching "message not modified" Telegram error:** If the buffer hasn't changed between throttle windows, Telegram returns 400 "Bad Request: message is not modified". Always `.catch()` edit calls.
- **Blocking the message handler on `prompt_async`:** `prompt_async` returns 204 immediately. The turn is driven by SSE events, not by the HTTP response.
- **Sending `typing` action after streaming starts:** Send once at message receipt (before `prompt_async`). The streaming message itself is the visual indicator that work is in progress.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSE parsing | Custom SSE parser | `@microsoft/fetch-event-source` (already installed) | Handles reconnect, POST, custom headers |
| Event source reconnect | Custom backoff loop | Already in `startSseLoop` | Phase 1 already handles this |
| HTTP for OpenCode | Axios or custom client | Native `fetch` | Node 20+ has it built in; project standard |
| Throttle timer | `setTimeout` chains | Simple `Date.now()` delta check | Stateless, no cleanup needed; simpler for this use case |

---

## Common Pitfalls

### Pitfall 1: Wrong SSE event property path

**What goes wrong:** Code reads `event.sessionID` (undefined) instead of `event.properties.sessionID`.

**Why it happens:** The existing `OpenCodeEvent` type in `events.ts` was designed with `sessionID` at the top level (Phase 1 placeholder), but live OpenCode wraps all event data in a `properties` object.

**How to avoid:** Update `events.ts` to reflect the actual `{ type, properties }` shape. Verified against live server.

**Warning signs:** SSE routing never matches any active turn; no `editMessageText` calls made.

### Pitfall 2: "Message is not modified" Telegram error

**What goes wrong:** `editMessageText` throws because the text didn't change between throttle windows.

**Why it happens:** Throttle window fires but no new delta arrived since last edit; buffer is identical.

**How to avoid:** Track `lastSentText` on the turn state and skip the edit if text hasn't changed. Or `.catch()` all edit calls silently (simpler for Phase 2).

**Warning signs:** Console flooded with `TelegramError: Bad Request: message is not modified`.

### Pitfall 3: Race condition — two messages before turn ends

**What goes wrong:** User sends a second message before `session.idle` arrives; `startTurn` overwrites the active turn map entry, losing the `messageId` for the first turn.

**Why it happens:** D-08 requires rejecting while busy, but the busy flag must be set *before* `prompt_async` fires and cleared only on `session.idle` or error.

**How to avoid:** Set `busy = true` immediately on receiving the user message (before `prompt_async`). Check `isBusy()` as the first thing in the handler.

**Warning signs:** Partial streaming messages left unresolved; error messages appear in wrong messages.

### Pitfall 4: Session created but SSE disconnected before events arrive

**What goes wrong:** `POST /session` + `prompt_async` succeed, but SSE was disconnected and reconnects after the events were emitted. The events are not replayed on reconnect.

**Why it happens:** OpenCode SSE is a live stream, not a log. After reconnect, only future events are sent.

**How to avoid:** This is an edge case beyond Phase 2 scope. Accept that mid-stream disconnects during this phase will result in the D-07 error path (SSE error handler clears the turn). Document as a known limitation.

**Warning signs:** Streaming message stuck on `⏳ Thinking...` indefinitely after SSE reconnect.

### Pitfall 5: Final edit on `session.idle` races with throttled edit

**What goes wrong:** A throttled edit fires at almost the same time as the `session.idle` final edit, causing the `⏳ Thinking...` prefix to reappear briefly.

**Why it happens:** The throttle timer fires between `session.idle` and `endTurn()` completing.

**How to avoid:** Call `endTurn()` (clear the turn from the map) *before* sending the final edit. Any in-flight throttled callbacks that check `getTurn()` will find `undefined` and no-op.

---

## Runtime State Inventory

> Phase 2 is not a rename/refactor phase. This section is included for completeness only.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | None — no persistent data yet | None |
| Live service config | OpenCode SSE connection (running in Phase 1 bot) | None — Phase 2 extends existing connection |
| OS-registered state | None | None |
| Secrets/env vars | BOT_TOKEN, OPENCODE_URL, ALLOWED_USER_IDS — unchanged | None |
| Build artifacts | None | None |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | ✓ | v25.8.2 | — |
| OpenCode server | `prompt_async`, SSE events | ✓ | 1.3.3 at localhost:4096 | Clear error message per D-06 |
| grammY 1.41.1 | Bot framework, `editMessageText`, `sendChatAction` | ✓ | 1.41.1 | — |
| @microsoft/fetch-event-source | SSE client | ✓ | ^2.0.1 | — |
| Telegram Bot API | `editMessageText`, `sendChatAction`, `sendMessageDraft` | ✓ (via grammY) | Bot API 9.5+ | — |
| vitest | Tests | ✓ | latest (18 tests passing) | — |

**No missing dependencies.** All required services and libraries are available.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest (latest) |
| Config file | none — uses `vitest` default discovery |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MSG-01 | Message triggers session creation + `prompt_async` | unit | `npm test -- src/opencode/session.test.ts` | ❌ Wave 0 |
| MSG-02 | `typing` chat action sent on message receipt | unit | `npm test -- src/bot/handlers/message.test.ts` | ❌ Wave 0 |
| MSG-03 | Throttle: edits at ≤500ms intervals | unit | `npm test -- src/opencode/streaming-state.test.ts` | ❌ Wave 0 |
| MSG-04 | Final clean message sent on `session.idle` | unit | `npm test -- src/opencode/streaming-state.test.ts` | ❌ Wave 0 |
| MSG-07 | Error message on `prompt_async` failure | unit | `npm test -- src/bot/handlers/message.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** All 18 existing + new tests green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/opencode/session.test.ts` — covers MSG-01 (session creation, `prompt_async` call)
- [ ] `src/bot/handlers/message.test.ts` — covers MSG-02, MSG-07 (typing action, error handling)
- [ ] `src/opencode/streaming-state.test.ts` — covers MSG-03, MSG-04 (throttle logic, `session.idle` handling)

---

## Code Examples

### Full message handler skeleton

```typescript
// src/bot/handlers/message.ts
import type { Context } from "grammy";
import type { StreamingStateManager } from "../opencode/streaming-state.js";
import { createSession, sendPromptAsync } from "../opencode/session.js";
import { logger } from "../logger.js";

export function makeMessageHandler(
  manager: StreamingStateManager,
  openCodeUrl: string
) {
  return async (ctx: Context): Promise<void> => {
    const chatId = ctx.chat!.id;
    const text = ctx.message?.text;
    if (!text) return;

    // D-08: concurrency guard
    if (manager.isBusy(chatId)) {
      await ctx.reply("⏳ Still working on your last message. Please wait.");
      return;
    }

    // MSG-02: typing indicator
    await ctx.replyWithChatAction("typing");

    // D-01: auto-create session
    let sessionId = manager.getSession(chatId);
    if (!sessionId) {
      try {
        sessionId = await createSession(openCodeUrl);
        manager.setSession(chatId, sessionId);
      } catch (err) {
        logger.error({ err, chatId }, "Failed to create session");
        await ctx.reply("❌ OpenCode is unreachable. Make sure it's running at localhost:4096.");
        return;
      }
    }

    // Send initial "thinking" message
    const sentMsg = await ctx.reply("⏳ Thinking...");
    manager.startTurn(sessionId, chatId, sentMsg.message_id);

    // D-06: call prompt_async
    try {
      await sendPromptAsync(openCodeUrl, sessionId, text);
    } catch (err) {
      logger.error({ err, chatId, sessionId }, "prompt_async failed");
      manager.endTurn(sessionId);
      await ctx.api.editMessageText(
        chatId,
        sentMsg.message_id,
        "❌ OpenCode is unreachable. Make sure it's running at localhost:4096."
      );
    }
  };
}
```

### StreamingStateManager handleEvent

```typescript
// src/opencode/streaming-state.ts — handleEvent method
handleEvent(event: OpenCodeEvent, bot: Api): void {
  if (event.type === "message.part.delta") {
    const { sessionID, delta } = event.properties;
    const turn = this.turns.get(sessionID);
    if (!turn || !delta) return;

    turn.buffer += delta;

    // D-05: throttle to ~500ms
    const now = Date.now();
    if (now - turn.lastEditAt >= THROTTLE_MS) {
      turn.lastEditAt = now;
      const interim = `⏳ Thinking...\n\n${turn.buffer}`;
      bot.editMessageText(turn.chatId, turn.messageId, interim)
        .catch(() => {}); // ignore "not modified"
    }
  }

  if (event.type === "session.idle") {
    const { sessionID } = event.properties;
    const turn = this.turns.get(sessionID);
    if (!turn) return;

    // D-04: clear turn FIRST, then send final edit
    const finalText = turn.buffer || "(empty response)";
    const { chatId, messageId } = turn;
    this.endTurn(sessionID);

    // D-02: session.idle is the definitive turn-end signal
    bot.editMessageText(chatId, messageId, finalText)
      .catch(() => {});
  }
}
```

### Updated events.ts (live-verified shapes)

```typescript
// src/opencode/events.ts — Phase 2 additions
export type MessagePartDeltaEvent = {
  type: "message.part.delta";
  properties: {
    sessionID: string;
    messageID: string;
    partID: string;
    field: string;
    delta: string;
  };
};

export type SessionIdleEvent = {
  type: "session.idle";
  properties: {
    sessionID: string;
  };
};

export type OpenCodeEvent =
  | MessagePartDeltaEvent
  | SessionIdleEvent
  | { type: string; properties?: Record<string, unknown> };

export function parseEvent(raw: string): OpenCodeEvent | null {
  try {
    return JSON.parse(raw) as OpenCodeEvent;
  } catch {
    return null;
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `editMessageText` only for streaming | `sendMessageDraft` (Bot API 9.3+, Dec 2025) | Dec 31, 2025 | Native streaming without a pre-existing message; uses `draft_id` integer; grammY 1.41.1 supports it. Use `editMessageText` for Phase 2 per locked decisions. |
| `EventSource` (GET-only) for SSE | `@microsoft/fetch-event-source` for POST/custom-header SSE | ~2021 | Already in use; `openWhenHidden: true` required for Node.js |

---

## Open Questions

1. **`⏳ Thinking...` + empty buffer timing**
   - What we know: `prompt_async` returns 204 immediately; the first `message.part.delta` may arrive 1-3 seconds later.
   - What's unclear: Should the initial "Thinking..." message be sent before or after `prompt_async` succeeds? If sent before and `prompt_async` fails, we need to edit it to show the error.
   - Recommendation: Send the initial message before `prompt_async` (as in D-06 — "edit the interim thinking message to show a clear error"). This is already captured in the handler skeleton above.

2. **`typing` refresh frequency**
   - What we know: Telegram `typing` chat action expires after ~5 seconds.
   - What's unclear: CONTEXT.md leaves this to Claude's discretion. For long responses (>5s), the typing indicator will disappear before streaming ends.
   - Recommendation: Send `typing` once at message receipt. The streaming message itself (`⏳ Thinking...`) provides the visual feedback. Periodic `typing` refresh adds complexity and is not required for Phase 2 success criteria.

3. **`message.part.delta` filter — only `field: "text"` deltas**
   - What we know: Live SSE showed `"field": "text"` for the text token. Other field types may exist.
   - What's unclear: Are there non-text deltas (e.g., for tool calls) that should be filtered out?
   - Recommendation: Filter `event.properties.field === "text"` before appending to the buffer. This is defensive and keeps the streaming buffer clean.

---

## Sources

### Primary (HIGH confidence)
- **Live OpenCode 1.3.3 SSE stream** — actual `message.part.delta` and `session.idle` event shapes verified 2026-03-28 against running server at localhost:4096
- **Live OpenCode 1.3.3 REST API** — `POST /session` and `POST /session/:id/prompt_async` response shapes verified 2026-03-28
- **Telegram Bot API docs** (https://core.telegram.org/bots/api) — `sendMessageDraft` (Bot API 9.3, Dec 31 2025), `editMessageText`, `sendChatAction` signatures
- **grammY 1.41.1 installed** — `sendMessageDraft`, `editMessageText`, `sendChatAction` confirmed in `node_modules/grammy/out/core/api.d.ts`
- **Phase 1 codebase** — `src/opencode/sse.ts`, `src/bot/index.ts`, `src/main.ts`, `src/opencode/events.ts` read directly

### Secondary (MEDIUM confidence)
- `.planning/research/ARCHITECTURE.md` — OpenCode API table, SSE event type list (pre-dating live verification)
- `.planning/research/STACK.md` — library version recommendations
- CONTEXT.md — locked decisions D-01 through D-08

### Tertiary (LOW confidence)
- None — all critical claims verified from primary sources.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages installed and verified
- Architecture: HIGH — SSE event shapes verified against live OpenCode 1.3.3
- Pitfalls: HIGH — derived from code inspection + live event verification
- Telegram API: HIGH — verified in grammY 1.41.1 types + official Bot API docs

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (stable APIs; OpenCode event shapes may change with server updates)

**Critical discovery:** The existing `events.ts` has `sessionID` at the top level of the union type, but live OpenCode events have `{ type, properties: { sessionID, ... } }`. This must be corrected in Phase 2.
