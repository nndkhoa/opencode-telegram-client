# Phase 4: Session Commands - Research

**Researched:** 2026-03-28
**Domain:** TypeScript/Node.js — grammY bot commands, session registry pattern, OpenCode session API
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Session Registry Architecture**
- **D-01:** Extract session management into a separate `SessionRegistry` class — distinct from `StreamingStateManager`. Clean separation of concerns; each class is independently testable. `StreamingStateManager` imports `SessionRegistry` for active session lookups.
- **D-02:** Per-chat session shape is explicit: `{ default: string, named: Map<string, string>, active: string }` — `default` holds the auto-created session ID, `named` maps name→sessionId, `active` points to the currently selected session ID.

**Session Naming**
- **D-03:** Session names must match `/^[a-z0-9][a-z0-9\-_]*$/` (alphanumeric, hyphens, underscores). Names are normalized to lowercase before storage and comparison — case-insensitive.
- **D-04:** `/new <name>` with an already-existing name (after normalization) responds with: `❌ Session "name" already exists. Use /switch <name> to switch to it.`
- **D-05:** `/new` with no argument auto-creates a session with a timestamp-based name: `session-<unix-timestamp>` (e.g. `session-1711638000`). Switches to it immediately.

**`/sessions` List Format**
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

**`/status` Output**
- **D-08:** Single-line summary format:
  `Session: <name> | OpenCode: ✅ healthy | Model: <model> | State: idle`
- **D-09:** Model info is fetched live from OpenCode (config/session API) for the active session — not tracked locally.
- **D-10:** If OpenCode is unreachable when `/status` runs, show degraded status inline:
  `Session: <name> | OpenCode: ❌ unreachable | Model: unknown | State: unknown`

**`/cancel` Behavior**
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

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SESS-01 | Each Telegram chat has a default session — auto-created on first message if none exists | `SessionRegistry.getOrCreateDefault(chatId)` replaces `StreamingStateManager.getSession/setSession` |
| SESS-02 | User can create a named session with `/new <name>` | `bot.command("new", ...)` + `SessionRegistry.createNamed()` + `createSession()` |
| SESS-03 | User can switch to an existing named session with `/switch <name>` | `bot.command("switch", ...)` + `SessionRegistry.switchTo()` |
| SESS-04 | User can list all sessions (default + named) with `/sessions` | `bot.command("sessions", ...)` + `SessionRegistry.list()` |
| SESS-05 | Active session pointer persists in memory per chat (survives message-level context, not process restarts) | In-memory `Map<chatId, ChatSessions>` in `SessionRegistry` |
| SESS-06 | `/status` shows current session ID, OpenCode server health, and active/idle state | `checkHealth()` + `GET /session/:id/message?limit=1` for model, `StreamingStateManager.isBusy()` for state |
| CMD-01 | `/help` — lists all available commands with descriptions | `bot.command("help", ...)` returning formatted text |
| CMD-02 | `/new <name>` — creates and switches to a named OpenCode session | Handler validates name regex, calls `createSession()`, registers in `SessionRegistry` |
| CMD-03 | `/switch <name>` — switches active session to the named session | Handler looks up name in `SessionRegistry`, fails gracefully if not found |
| CMD-04 | `/sessions` — lists all sessions for the current chat | Handler calls `SessionRegistry.list(chatId)` formats with `(active)` marker |
| CMD-05 | `/status` — shows active session and OpenCode server health | Handler calls health + messages API concurrently |
| CMD-06 | `/cancel` — aborts the current in-progress OpenCode request | Handler calls `POST /session/:id/abort`, edits streaming message, clears turn state |
| CMD-07 | BotFather command menu is set with all commands and descriptions | `bot.api.setMyCommands()` called at bot startup in `createBot()` |
</phase_requirements>

## Summary

Phase 4 builds a `SessionRegistry` class that replaces the simple `Map<chatId, sessionId>` inside `StreamingStateManager` with a full per-chat session structure (`default`, `named`, `active`). It then wires six command handlers (`/new`, `/switch`, `/sessions`, `/status`, `/cancel`, `/help`) into the existing grammY bot, and registers the command menu via `bot.api.setMyCommands()` at startup.

The architecture is entirely within existing project patterns: factory functions for handlers, ESM `.js` imports, DI injection via constructor parameters. The key new API surface is grammY's `bot.command()` and `bot.api.setMyCommands()`, both available in the installed grammY v1.41.1. Model info for `/status` is retrieved from `GET /session/:id/message?limit=1` — live session messages contain `info.model.modelID` on the most recent message.

**Primary recommendation:** Build `SessionRegistry` first (TDD), then wire it into `StreamingStateManager` and the message handler, then add command handlers one by one. Register BotFather commands in `createBot()` immediately after bot construction. No new npm packages required.

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| grammy | 1.41.1 | Bot commands, `setMyCommands` | Already in use; `bot.command()` and `bot.api.setMyCommands()` both confirmed available |
| TypeScript | ^6.0.2 | Type safety, strict mode | Project standard |
| vitest | latest | Unit tests | Established test framework |

### No New Dependencies Required

Phase 4 needs no new npm packages. All functionality is achievable with:
- **grammY** `bot.command()` for command routing
- **grammY** `bot.api.setMyCommands()` for BotFather menu
- **Native `fetch`** for `POST /session/:id/abort` and health/model queries
- **Existing** `createSession()`, `checkHealth()`, `StreamingStateManager`

**Installation:** None needed.

## Architecture Patterns

### Recommended File Layout (Claude's Discretion)
```
src/
├── session/
│   └── registry.ts          # SessionRegistry class (new)
├── opencode/
│   ├── streaming-state.ts   # Updated: accepts SessionRegistry, removes internal sessions Map
│   └── session.ts           # Updated: add abortSession() function
├── bot/
│   ├── index.ts             # Updated: register commands + setMyCommands()
│   └── handlers/
│       ├── message.ts       # Updated: use registry.getOrCreateDefault()
│       ├── cmd-new.ts       # New: /new handler
│       ├── cmd-switch.ts    # New: /switch handler
│       ├── cmd-sessions.ts  # New: /sessions handler
│       ├── cmd-status.ts    # New: /status handler
│       ├── cmd-cancel.ts    # New: /cancel handler
│       └── cmd-help.ts      # New: /help handler
```

**Rationale:** Per D-01, `SessionRegistry` is a separate class. Per existing project patterns, each command handler is a separate factory function in its own file (same as `makeMessageHandler` in `handlers/message.ts`).

### Pattern 1: grammY Command Registration

**What:** `bot.command("name", handler)` registers a handler for `/name` messages. Multiple commands can be registered in sequence.

**When to use:** All 6 commands follow this pattern in `createBot()`.

```typescript
// Source: grammY v1.41.1 installed at node_modules/grammy/out/composer.d.ts
// Signature:
// command(command: MaybeArray<StringWithCommandSuggestions>, ...middleware: Array<CommandMiddleware<C>>): Composer<CommandContext<C>>

bot.command("new", makeCmdNewHandler(registry, openCodeUrl));
bot.command("switch", makeCmdSwitchHandler(registry));
bot.command("sessions", makeCmdSessionsHandler(registry));
bot.command("status", makeCmdStatusHandler(registry, manager, openCodeUrl));
bot.command("cancel", makeCmdCancelHandler(registry, manager, openCodeUrl));
bot.command("help", makeCmdHelpHandler());
```

**Command argument access:** `ctx.match` contains text after the command (e.g., for `/new my-project`, `ctx.match === "my-project"`).

### Pattern 2: BotFather Menu Registration (`setMyCommands`)

**What:** `bot.api.setMyCommands()` registers the command list visible in Telegram's "/" picker UI.

**When to use:** Called once at startup, inside `createBot()` after all `bot.command()` registrations.

```typescript
// Source: grammY API at node_modules/grammy/out/core/api.d.ts line 1076
// BotCommand interface (from @grammyjs/types/manage.d.ts):
// { command: string; description: string; }

await bot.api.setMyCommands([
  { command: "new", description: "Create and switch to a named session" },
  { command: "switch", description: "Switch to an existing named session" },
  { command: "sessions", description: "List all sessions for this chat" },
  { command: "status", description: "Show active session and OpenCode health" },
  { command: "cancel", description: "Abort the current in-progress request" },
  { command: "help", description: "Show all commands" },
]);
```

**Constraint:** `command` field must be lowercase, 1-32 chars, only letters/digits/underscores. `description` is 1-256 chars. Telegram enforces these at API level.

### Pattern 3: SessionRegistry Class

**What:** Encapsulates per-chat session state with the D-02 shape.

```typescript
// src/session/registry.ts
type ChatSessions = {
  default: string;       // auto-created session ID
  named: Map<string, string>; // name → sessionId
  active: string;        // currently selected sessionId
};

export class SessionRegistry {
  private chats = new Map<number, ChatSessions>();

  getActiveSessionId(chatId: number): string | undefined { ... }
  async getOrCreateDefault(chatId: number, openCodeUrl: string): Promise<string> { ... }
  createNamed(chatId: number, name: string, sessionId: string): void { ... }
  switchTo(chatId: number, name: string): boolean { ... }
  getActiveName(chatId: number): string { ... }
  list(chatId: number): { name: string; active: boolean }[] { ... }
  hasNamed(chatId: number, name: string): boolean { ... }
  getNamedId(chatId: number, name: string): string | undefined { ... }
  isBusy(chatId: number): boolean { ... } // delegates to StreamingStateManager
}
```

**Integration:** `StreamingStateManager` constructor accepts `SessionRegistry` instead of managing its own `Map<number, string>`. `makeMessageHandler` receives `registry` instead of calling `manager.getSession/setSession`.

### Pattern 4: `/status` Model Info — Confirmed Live API Behavior

**Finding (HIGH confidence — verified against running OpenCode 1.3.3):**

- `GET /session/:id` does **NOT** contain model info (confirmed by live query).
- `GET /config` does **NOT** contain current model (it contains provider config, not active model).
- `GET /session/:id/message?limit=5` returns messages where `info.model` is populated on **user role messages** (assistant messages show `model: None`).

```typescript
// Fetch model from most recent user message in session
const res = await fetch(`${baseUrl}/session/${sessionId}/message?limit=10`);
const messages = await res.json() as Array<{ info: { role: string; model?: { providerID: string; modelID: string } } }>;
const withModel = messages.find(m => m.info.role === "user" && m.info.model);
const model = withModel?.info.model?.modelID ?? "unknown";
```

**Health check reuse:** `checkHealth()` in `src/opencode/health.ts` already returns `{ healthy: boolean; version: string }` — reuse directly for `/status`.

### Pattern 5: `/cancel` — Abort + Turn Cleanup

**Finding (HIGH confidence — verified `POST /session/:id/abort` endpoint exists):**

```typescript
// New function to add to src/opencode/session.ts
export async function abortSession(baseUrl: string, sessionId: string): Promise<void> {
  const url = new URL(`/session/${sessionId}/abort`, baseUrl).toString();
  const res = await fetch(url, { method: "POST" });
  // 400 if session ID format invalid, otherwise completes
  if (!res.ok && res.status !== 404) {
    throw new Error(`abort failed: HTTP ${res.status}`);
  }
}
```

**Cancel handler flow (D-12):**
1. Check `manager.isBusy(chatId)` — if false, reply `ℹ️ Nothing in progress to cancel.`
2. Get active sessionId from registry
3. Call `abortSession(openCodeUrl, sessionId)` — fire and forget is acceptable
4. Get turn's `messageId` from `manager.turns.get(sessionId)` (exposed as non-private in existing code)
5. Call `manager.endTurn(sessionId)` to clear busy state
6. Edit original streaming message to `🚫 Cancelled.`
7. Reply `✅ Cancelled.`

**Turn state access:** `manager.turns` is already exposed as non-private in `streaming-state.ts` (line 25: `turns = new Map<string, TurnState>()`). The cancel handler needs `chatId` and `messageId` from the turn.

### Anti-Patterns to Avoid
- **Calling `manager.getSession(chatId)` directly** after Phase 4 — this method should be replaced/deprecated in favor of `registry.getActiveSessionId(chatId)`.
- **Checking session name case-sensitively** — always normalize to lowercase before Map operations (D-03).
- **Registering `setMyCommands` inside an async handler** — call it once at startup; grammY's `Bot.start()` is async so `createBot()` can become `async createBot()` or the caller handles the promise.
- **Showing OpenCode session IDs to users in `/sessions`** — the format shows names only (D-06), not IDs.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Command argument parsing | Custom text splitter for `/new my-project` | `ctx.match` (grammY built-in) | grammY provides match text after command automatically |
| Command registration | Custom routing on `message:text` | `bot.command()` | grammY handles `/command` text detection, case, entities |
| Telegram command menu | Manual BotFather chat | `bot.api.setMyCommands()` | Programmatic; survives redeployment; testable |
| Session name validation | Ad hoc string checks | `/^[a-z0-9][a-z0-9\-_]*$/` regex (D-03) | Locked decision; apply once in registry, not in handlers |

**Key insight:** grammY's `ctx.match` is populated for command handlers with the text after the command including any arguments — no manual parsing of `ctx.message.text` needed.

## Common Pitfalls

### Pitfall 1: `ctx.match` vs `ctx.message?.text` for Command Arguments
**What goes wrong:** Reading `ctx.message?.text` in a command handler gives the full message including `/new ` prefix. Parsing manually is error-prone.
**Why it happens:** Developers unfamiliar with grammY's command API fall back to text parsing.
**How to avoid:** Always use `ctx.match` in `bot.command()` handlers — it contains only the text after the command and leading whitespace stripped.
**Warning signs:** `text.split(" ")[1]` in command handlers.

### Pitfall 2: `setMyCommands` Called Before Bot Initialization
**What goes wrong:** `bot.api.setMyCommands()` fails if called before the bot is initialized/connected.
**Why it happens:** Calling it at module load time rather than after `createBot()`.
**How to avoid:** Call `await bot.api.setMyCommands([...])` inside `main.ts` after `createBot()` returns, or in an `init()` method called before `bot.start()`.
**Warning signs:** `TypeError: Cannot read properties of undefined` on bot.api calls.

### Pitfall 3: SessionRegistry Not Injected into StreamingStateManager
**What goes wrong:** `StreamingStateManager` still has its internal `sessions` Map; message handler calls both `manager.setSession()` and `registry.createDefault()`, causing split state.
**Why it happens:** Partial refactor — `StreamingStateManager` updated but old Map not removed.
**How to avoid:** `StreamingStateManager` constructor should accept `SessionRegistry` (or delegate session queries to it). Remove `private sessions` Map after migration.
**Warning signs:** `/sessions` shows different sessions than what the message handler uses.

### Pitfall 4: Named Session `Map` Not Initialized for New Chats
**What goes wrong:** `registry.chats.get(chatId)` returns `undefined` when handlers for `/switch` or `/sessions` run before any message is sent.
**Why it happens:** Chat entry is only created on first message (default session auto-create).
**How to avoid:** All `SessionRegistry` methods that read per-chat state must handle the case where no entry exists yet — return empty state, not throw.
**Warning signs:** Unhandled `undefined` errors in `/sessions` or `/switch` handlers for new chats.

### Pitfall 5: `/cancel` Race — Turn Cleared Before Edit Sent
**What goes wrong:** `manager.endTurn(sessionId)` clears the turn (including `messageId`), so the edit to `🚫 Cancelled.` fails because the message ID was not captured first.
**Why it happens:** Same race pattern as existing Phase 2/3 concern — D-12 requires capturing `chatId`/`messageId` before calling `endTurn`.
**How to avoid:** Read `turn = manager.turns.get(sessionId)` to capture `{ chatId, messageId }`, then call `endTurn()`, then use the captured values for `editMessageText`.
**Warning signs:** "Message to edit not found" Telegram API errors after cancel.

### Pitfall 6: Model Info Not Found for New Sessions
**What goes wrong:** `/status` returns `Model: unknown` for brand-new sessions that have no messages yet.
**Why it happens:** Model info lives in message `info.model` on user messages; new sessions have no messages.
**How to avoid:** Gracefully default to `"unknown"` if no messages with model info exist — this is expected behavior for fresh sessions.
**Warning signs:** Error thrown instead of `"unknown"` fallback.

## Code Examples

### grammY command handler factory (matches existing patterns)
```typescript
// src/bot/handlers/cmd-new.ts
import type { Context } from "grammy";
import type { SessionRegistry } from "../../session/registry.js";
import { createSession } from "../../opencode/session.js";
import { logger } from "../../logger.js";

export function makeCmdNewHandler(registry: SessionRegistry, openCodeUrl: string) {
  return async (ctx: Context): Promise<void> => {
    const chatId = ctx.chat!.id;
    const rawName = ctx.match?.trim() ?? "";

    // D-05: no argument → timestamp-based name
    const name = rawName.length > 0
      ? rawName.toLowerCase()
      : `session-${Math.floor(Date.now() / 1000)}`;

    // D-03: validate name format
    if (!/^[a-z0-9][a-z0-9\-_]*$/.test(name)) {
      await ctx.reply(`❌ Invalid session name "${name}". Use only lowercase letters, digits, hyphens, underscores.`);
      return;
    }

    // D-04: duplicate name check
    if (registry.hasNamed(chatId, name)) {
      await ctx.reply(`❌ Session "${name}" already exists. Use /switch ${name} to switch to it.`);
      return;
    }

    try {
      const sessionId = await createSession(openCodeUrl);
      registry.createNamed(chatId, name, sessionId);
      logger.info({ chatId, name, sessionId }, "Created named session");
      await ctx.reply(`✅ Created and switched to session "${name}".`);
    } catch (err) {
      logger.error({ err, chatId }, "Failed to create named session");
      await ctx.reply("❌ OpenCode is unreachable. Make sure it's running at localhost:4096.");
    }
  };
}
```

### BotFather command menu registration
```typescript
// In main.ts or createBot() — called once at startup
// Source: grammY API (confirmed in node_modules/grammy/out/core/api.d.ts line 1076)
await bot.api.setMyCommands([
  { command: "new", description: "Create and switch to a named session" },
  { command: "switch", description: "Switch to an existing named session" },
  { command: "sessions", description: "List all sessions for this chat" },
  { command: "status", description: "Show active session and OpenCode health" },
  { command: "cancel", description: "Abort the current in-progress request" },
  { command: "help", description: "Show all commands" },
]);
```

### Model info fetch for `/status`
```typescript
// Verified against live OpenCode 1.3.3
// Model is on user messages: info.model.modelID
async function fetchActiveModel(baseUrl: string, sessionId: string): Promise<string> {
  try {
    const res = await fetch(new URL(`/session/${sessionId}/message?limit=10`, baseUrl).toString());
    if (!res.ok) return "unknown";
    const msgs = (await res.json()) as Array<{
      info: { role: string; model?: { providerID: string; modelID: string } };
    }>;
    const withModel = msgs.find(m => m.info.role === "user" && m.info.model);
    return withModel?.info.model?.modelID ?? "unknown";
  } catch {
    return "unknown";
  }
}
```

### `/status` handler output assembly
```typescript
// D-08/D-09/D-10 format
const sessionName = registry.getActiveName(chatId) ?? "default";
const isActive = manager.isBusy(chatId);
let healthStr: string;
let modelStr: string;
let stateStr: string;

try {
  const health = await checkHealth(openCodeUrl);
  const sessionId = registry.getActiveSessionId(chatId);
  const model = sessionId ? await fetchActiveModel(openCodeUrl, sessionId) : "unknown";
  healthStr = health.healthy ? "✅ healthy" : "⚠️ unhealthy";
  modelStr = model;
  stateStr = isActive ? "active" : "idle";
} catch {
  healthStr = "❌ unreachable";
  modelStr = "unknown";
  stateStr = "unknown";
}

await ctx.reply(`Session: ${sessionName} | OpenCode: ${healthStr} | Model: ${modelStr} | State: ${stateStr}`);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Telegraf for Telegram bots | grammY (TypeScript-first) | Phase 1 decision | Already implemented; bot.command() is idiomatic grammY |
| Manual session map in StreamingStateManager | SessionRegistry class | Phase 4 (this phase) | Clean separation; both classes independently testable |

## Open Questions

1. **`setMyCommands` placement — `createBot()` vs `main.ts`**
   - What we know: `bot.api.setMyCommands()` is async; `createBot()` is currently sync.
   - What's unclear: Should `createBot()` become async, or should caller (`main.ts`) call `setMyCommands` separately?
   - Recommendation: Keep `createBot()` sync; call `await bot.api.setMyCommands([...])` in `main.ts` after `createBot()` returns, before `bot.start()`. Clean separation of concerns.

2. **`StreamingStateManager` refactor depth**
   - What we know: `StreamingStateManager` has `getSession/setSession` methods and `private sessions` Map.
   - What's unclear: Should `StreamingStateManager` accept `SessionRegistry` via constructor, or should message handler bypass it entirely?
   - Recommendation: Constructor injection — `StreamingStateManager` accepts optional `SessionRegistry`; falls back to internal map if not provided (backward-compatible for existing tests). Message handler updated to call registry directly for session creation.

3. **`/cancel` access to `TurnState.messageId`**
   - What we know: `turns` Map is non-private (`turns = new Map<string, TurnState>()`) at line 25 of streaming-state.ts, accessible via type cast in tests.
   - What's unclear: Should a `getTurn(sessionId)` public method be added for clean access?
   - Recommendation: Add `getTurn(sessionId: string): TurnState | undefined` as a proper public method. Cleaner than type-casting in cancel handler.

## Environment Availability

Step 2.6: External dependencies verified.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| grammY | bot.command(), setMyCommands | ✓ | 1.41.1 | — |
| OpenCode server | POST /session/:id/abort, GET /session/:id/message | ✓ | 1.3.3 | Graceful error message |
| vitest | Unit tests | ✓ | latest | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** OpenCode server may be offline at test time — all handlers must have try/catch with user-friendly error messages.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (latest) |
| Config file | none — uses package.json scripts |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SESS-01 | Default session auto-created on first message | unit | `npm test -- --reporter verbose` | ❌ Wave 0 |
| SESS-02 | `/new <name>` creates named session | unit | `npm test` | ❌ Wave 0 |
| SESS-03 | `/switch <name>` changes active session | unit | `npm test` | ❌ Wave 0 |
| SESS-04 | `/sessions` lists all sessions with active marker | unit | `npm test` | ❌ Wave 0 |
| SESS-05 | Active session pointer stored per chat in memory | unit | `npm test` | ❌ Wave 0 |
| SESS-06 | `/status` shows session name, health, model, state | unit | `npm test` | ❌ Wave 0 |
| CMD-01 | `/help` returns command list | unit | `npm test` | ❌ Wave 0 |
| CMD-02 | `/new` validates name regex, prevents duplicates | unit | `npm test` | ❌ Wave 0 |
| CMD-03 | `/switch` fails gracefully for unknown name | unit | `npm test` | ❌ Wave 0 |
| CMD-04 | `/sessions` usage hint when only default exists | unit | `npm test` | ❌ Wave 0 |
| CMD-05 | `/status` degraded output when OpenCode unreachable | unit | `npm test` | ❌ Wave 0 |
| CMD-06 | `/cancel` no-op when nothing in progress | unit | `npm test` | ❌ Wave 0 |
| CMD-07 | `setMyCommands` called at startup | unit (mock) | `npm test` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green (all 55 existing + new tests) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/session/registry.test.ts` — covers SESS-01 through SESS-05 (SessionRegistry unit tests)
- [ ] `src/bot/handlers/cmd-new.test.ts` — covers CMD-02, SESS-02
- [ ] `src/bot/handlers/cmd-switch.test.ts` — covers CMD-03, SESS-03
- [ ] `src/bot/handlers/cmd-sessions.test.ts` — covers CMD-04, SESS-04
- [ ] `src/bot/handlers/cmd-status.test.ts` — covers CMD-05, SESS-06
- [ ] `src/bot/handlers/cmd-cancel.test.ts` — covers CMD-06, D-11, D-12
- [ ] `src/bot/handlers/cmd-help.test.ts` — covers CMD-01
- [ ] `src/opencode/session.test.ts` — extend with `abortSession()` tests

## Sources

### Primary (HIGH confidence)
- Installed grammY v1.41.1 — `bot.command()` signature, `setMyCommands()` signature, `BotCommand` interface, `ctx.match` behavior
- Live OpenCode 1.3.3 at localhost:4096 — confirmed `POST /session/:id/abort` exists, `GET /session/:id/message` returns model info on user messages, `GET /session/:id` has no model field
- `.planning/research/ARCHITECTURE.md` — authoritative endpoint table
- Existing source files — `StreamingStateManager`, `makeMessageHandler`, `createSession`, `checkHealth` patterns

### Secondary (MEDIUM confidence)
- `.planning/phases/04-session-commands/04-CONTEXT.md` — all locked decisions (D-01 through D-12)
- `.planning/REQUIREMENTS.md` — acceptance criteria for SESS-01..06, CMD-01..07

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — installed versions verified, no new packages needed
- Architecture: HIGH — existing patterns followed exactly, all APIs confirmed against live OpenCode
- Pitfalls: HIGH — derived from existing codebase patterns and confirmed API behavior
- Model info endpoint: HIGH — verified against live OpenCode 1.3.3 (model lives on user messages, not session object)

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (grammY API stable; OpenCode API may change on major version)
