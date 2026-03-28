# Phase 2: Minimal Telegram Loop - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

An allowlisted user sends a text message → bot calls `POST /session/:id/prompt_async` → SSE `message.part.delta` events stream back → bot edits a single Telegram message live (throttled ~500ms) → `session.idle` signals turn complete → final clean message replaces the interim.

Requirements in scope: MSG-01, MSG-02, MSG-03, MSG-04, MSG-07

Session management commands (`/new`, `/switch`, `/sessions`) are NOT in scope — that is Phase 4. Phase 2 uses a simple in-memory map only.

</domain>

<decisions>
## Implementation Decisions

### Session Bootstrap
- **D-01:** Auto-create `POST /session` on the first message for a given chatId. Store the returned sessionId in an in-memory `Map<chatId, sessionId>`. Reuse on all subsequent messages from the same chat. Phase 4 takes over this map when it adds the full session registry.

### Turn-End Detection
- **D-02:** `session.idle` SSE event is the definitive signal that streaming is complete and the final message should be sent. Do not rely on timeouts or `message.updated` as primary signals.

### Streaming UX
- **D-03:** While streaming, prefix the accumulating plain-text buffer with a `⏳ Thinking...` header line. Example interim message:
  ```
  ⏳ Thinking...

  Here is the response so far...
  ```
- **D-04:** On `session.idle`, replace the interim message with the final clean output (Phase 3 adds HTML rendering; for now plain text is acceptable for the final message too). Remove the `⏳ Thinking...` prefix entirely.
- **D-05:** Throttle `editMessageText` to ~500ms between edits (MSG-03). Coalesce incoming `message.part.delta` tokens into the buffer; only push an edit when the throttle window opens.

### Error Handling
- **D-06 (unreachable at send time):** If `prompt_async` fails (OpenCode unreachable or HTTP error), edit the interim "thinking" message to show a clear error. Example: `❌ OpenCode is unreachable. Make sure it's running at localhost:4096.`
- **D-07 (mid-stream error):** If an error occurs after streaming has started (SSE disconnect, unexpected event), edit the interim message to show an error and discard the partial content. Do not leave partial text in the message. Example: `❌ Something went wrong mid-response. Please try again.`

### Concurrency Guard
- **D-08:** If the user sends a message while a response is already streaming for their chat, reject immediately with: `⏳ Still working on your last message. Please wait.` Do not forward the message to OpenCode. Track per-chatId "busy" state alongside the session map.

### Streaming State Shape (Claude's Discretion on exact fields)
- Per active turn, maintain streaming state: `{ sessionId, telegramChatId, telegramMessageId, buffer, lastEditAt, busy }`. Clear on `session.idle` or error.

### Claude's Discretion
- Exact in-memory data structure for the chat→session map and streaming state (e.g. a single `Map` with a compound value, or separate maps).
- Whether `typing` chat action (MSG-02) is sent once at message receipt or periodically during streaming.
- File/module organization for the new handler code (e.g. `src/bot/handlers/message.ts`, `src/opencode/session.ts`).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### OpenCode API
- `.planning/research/ARCHITECTURE.md` — Full endpoint table, SSE event types (`message.part.delta`, `session.idle`), `prompt_async` flow, streaming pattern recommendations, state management guidance
- `.planning/research/SUMMARY.md` — Synthesized stack choices and architecture insights

### Project Requirements
- `.planning/REQUIREMENTS.md` — MSG-01 through MSG-04, MSG-07 acceptance criteria (Phase 2 scope)
- `.planning/PROJECT.md` — Core value, constraints, key decisions (HTML parse mode, stream→clean pattern)

### Stack
- `.planning/research/STACK.md` — grammY version, TypeScript strict mode setup

### Phase 1 Context (patterns to follow)
- `.planning/phases/01-foundation/01-CONTEXT.md` — ESM/NodeNext import conventions (.js extensions), baseUrl-as-parameter pattern, middleware factory pattern, openWhenHidden SSE requirement

No additional external specs referenced during discussion.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/bot/index.ts` — Bot instance with DM-only + allowlist middleware already wired. Phase 2 replaces the Phase 1 echo handler (`bot.on("message:text", ...)`) with the real handler.
- `src/opencode/sse.ts` — `startSseLoop` with `onEvent` callback. Phase 2 routes `message.part.delta` and `session.idle` events through this callback to the streaming state manager.
- `src/opencode/events.ts` — `OpenCodeEvent` discriminated union. Needs `message.part.delta` and `session.idle` types added/refined.
- `src/main.ts` — `onEvent` callback is currently a logger stub (`Phase 2+ will route by sessionID`). This is the integration point: Phase 2 wires real routing here.
- `src/config/env.ts` — `config.openCodeUrl` available for constructing `prompt_async` endpoint URL.
- `src/logger.ts` — Shared pino logger available.

### Established Patterns
- ESM project: all imports use `.js` extensions even for TypeScript source files.
- Functions accept `baseUrl` as a parameter (not a config import) for test isolation.
- Middleware uses factory functions (`allowlistMiddleware(set)`) for test isolation.
- No test setup needed for Phase 2 business logic beyond unit tests for the streaming state manager.

### Integration Points
- `src/main.ts` `onEvent` callback: swap the logger stub for a real dispatcher that routes events to the active streaming state by `sessionID`.
- `src/bot/index.ts` `bot.on("message:text", ...)`: replace Phase 1 echo handler with the Phase 2 message handler.
- `src/opencode/events.ts`: extend `OpenCodeEvent` union with typed `message.part.delta` and `session.idle` shapes.

</code_context>

<specifics>
## Specific Ideas

- The `⏳ Thinking...` prefix pattern was explicitly chosen (over a trailing cursor or no decoration).
- Error messages use ❌ emoji prefix for visibility.
- "Still working" rejection uses ⏳ prefix for consistency with the streaming indicator.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 02-minimal-telegram-loop*
*Context gathered: 2026-03-28*
