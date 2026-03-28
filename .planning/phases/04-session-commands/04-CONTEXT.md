# Phase 4: Session Commands - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Full session registry (default + named sessions per chat) plus all bot commands: `/new`, `/switch`, `/sessions`, `/status`, `/cancel`, `/help`. Users gain the ability to manage multiple named OpenCode sessions per Telegram chat.

Requirements in scope: SESS-01, SESS-02, SESS-03, SESS-04, SESS-05, SESS-06, CMD-01, CMD-02, CMD-03, CMD-04, CMD-05, CMD-06, CMD-07

</domain>

<decisions>
## Implementation Decisions

### Session Registry Architecture
- **D-01:** Extract session management into a separate `SessionRegistry` class — distinct from `StreamingStateManager`. Clean separation of concerns; each class is independently testable. `StreamingStateManager` imports `SessionRegistry` for active session lookups.
- **D-02:** Per-chat session shape is explicit: `{ default: string, named: Map<string, string>, active: string }` — `default` holds the auto-created session ID, `named` maps name→sessionId, `active` points to the currently selected session ID.

### Session Naming
- **D-03:** Session names must match `/^[a-z0-9][a-z0-9\-_]*$/` (alphanumeric, hyphens, underscores). Names are normalized to lowercase before storage and comparison — case-insensitive.
- **D-04:** `/new <name>` with an already-existing name (after normalization) responds with: `❌ Session "name" already exists. Use /switch <name> to switch to it.`
- **D-05:** `/new` with no argument auto-creates a session with a timestamp-based name: `session-<unix-timestamp>` (e.g. `session-1711638000`). Switches to it immediately.

### `/sessions` List Format
- **D-06:** Plain text list with active marker:
  ```
  Sessions:
  • default (active)
  • my-project
  • work-spike
  ```
  Active session marked with `(active)`. No session IDs shown.
- **D-07:** When only the default session exists (no named sessions), append a usage hint:
  ```
  Sessions:
  • default (active)

  Use /new <name> to create a named session.
  ```

### `/status` Output
- **D-08:** Single-line summary format:
  `Session: <name> | OpenCode: ✅ healthy | Model: <model> | State: idle`
- **D-09:** Model info is fetched live from OpenCode (config/session API) for the active session — not tracked locally.
- **D-10:** If OpenCode is unreachable when `/status` runs, show degraded status inline:
  `Session: <name> | OpenCode: ❌ unreachable | Model: unknown | State: unknown`

### `/cancel` Behavior
- **D-11:** `/cancel` with nothing in progress replies: `ℹ️ Nothing in progress to cancel.`
- **D-12:** `/cancel` with an active streaming turn:
  1. Calls `POST /session/:id/abort` to signal OpenCode
  2. Edits the `⏳ Thinking...` streaming message to `🚫 Cancelled.`
  3. Sends a separate `✅ Cancelled.` reply
  4. Clears the active turn state in `StreamingStateManager`

### Claude's Discretion
- Exact module/file layout for `SessionRegistry` (e.g. `src/session/registry.ts` or `src/opencode/session-registry.ts`)
- How command handlers are registered in `bot/index.ts` (individual `bot.command()` calls vs a command router)
- BotFather command menu registration approach (via `bot.api.setMyCommands()` at startup)
- `/help` text formatting and ordering of commands
- OpenCode API endpoint for fetching model info in `/status` (researcher to confirm)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### OpenCode API
- `.planning/research/ARCHITECTURE.md` — Full endpoint table including `POST /session`, `POST /session/:id/abort`, session config/model API shape
- `.planning/research/SUMMARY.md` — Synthesized architecture insights

### Project Requirements
- `.planning/REQUIREMENTS.md` — SESS-01 through SESS-06, CMD-01 through CMD-07 acceptance criteria
- `.planning/PROJECT.md` — Core value, constraints, key decisions

### Phase Context (patterns to follow)
- `.planning/phases/01-foundation/01-CONTEXT.md` — ESM/NodeNext import conventions (.js extensions), factory/injection patterns
- `.planning/phases/02-minimal-telegram-loop/02-CONTEXT.md` — `StreamingStateManager` architecture, `startTurn`/`endTurn` API, error message emoji conventions (❌, ⏳)
- `.planning/phases/03-rendering-pipeline/03-CONTEXT.md` — `renderFinalMessage` module, `endTurn`-before-edit ordering requirement

No additional external specs referenced during discussion.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/opencode/session.ts` — `createSession(baseUrl)` already exists and can be reused for all session creation (default auto-create, `/new` named, `/new` timestamp-named)
- `src/opencode/streaming-state.ts` — `StreamingStateManager` has `getSession(chatId)` / `setSession(chatId, sessionId)` — Phase 4 replaces these with `SessionRegistry` calls; the simple `Map<chatId, sessionId>` inside `StreamingStateManager` is promoted to the registry
- `src/bot/index.ts` — `createBot(manager)` factory pattern; new command handlers follow the same DI injection approach
- `src/bot/handlers/message.ts` — `makeMessageHandler` pattern (factory returning async handler) — new command handlers follow this same factory pattern
- `src/logger.ts` — Shared pino logger available

### Established Patterns
- ESM project: all imports use `.js` extensions even for TypeScript source files
- Factory functions for handlers (`makeMessageHandler(manager, url)`) — testable via DI
- Error messages: `❌` prefix for errors, `⏳` for in-progress, `✅` for success, `ℹ️` for informational
- `endTurn` called before async Telegram API work to prevent races

### Integration Points
- `src/bot/index.ts`: add `bot.command()` registrations for all 6 commands + `bot.api.setMyCommands()` call at startup
- `src/opencode/streaming-state.ts`: replace internal `sessions` Map with `SessionRegistry` instance (or accept it via constructor injection)
- `src/bot/handlers/message.ts`: `makeMessageHandler` currently calls `manager.getSession(chatId)` / `manager.setSession()` — update to use `SessionRegistry`
- New module needed: `src/session/registry.ts` (or equivalent) — exports `SessionRegistry` class

</code_context>

<specifics>
## Specific Ideas

- Auto-named sessions use unix timestamp suffix: `session-<unix-timestamp>` — unique without needing a counter
- The `(active)` marker on `/sessions` list was explicitly chosen over highlighting or other decoration
- `/cancel` does both: edits the streaming message AND sends a separate confirmation reply — double confirmation intentional
- `/status` is a single-line format (not a block) — user's preference

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 04-session-commands*
*Context gathered: 2026-03-28*
