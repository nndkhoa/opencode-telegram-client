# Phase 1: Foundation - Research

**Researched:** 2026-03-28  
**Domain:** Node.js Telegram bot (grammY), OpenCode HTTP/SSE, env validation  
**Confidence:** HIGH (official grammY + OpenCode server docs + npm registry verification)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### SSE Architecture
- **D-01:** Single shared `GET /event` SSE connection for the entire process — events are filtered in-memory by sessionID. No per-session connections.
- **D-02:** Auto-reconnect with exponential backoff on disconnect. Log the disconnect. No user notification needed at this phase.

#### Allowlist Wiring
- **D-03:** Non-allowlisted users receive a rejection message ("You don't have access to this bot") — not a silent drop.
- **D-04:** DMs only — group chats and channel messages are rejected at the middleware level before any allowlist check.

#### Env Config Shape
- **D-05:** Fail fast — all required env vars are validated at startup. Log a clear error and exit if any are missing.
- **D-06:** OpenCode base URL is configurable via `OPENCODE_URL` env var, defaulting to `http://localhost:4096`.
- **D-07:** Allowlist stored as comma-separated user IDs in `ALLOWED_USER_IDS` env var (e.g., `ALLOWED_USER_IDS=123456,789012`).

### Claude's Discretion
- Project folder structure (e.g., `src/bot/`, `src/opencode/`, `src/session/`) — Claude decides based on what serves the architecture best.
- SSE reconnection backoff parameters (initial delay, max delay, jitter) — Claude picks reasonable defaults.

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INFRA-01 | TypeScript with strict mode | Standard Stack tsconfig; `typescript` ^6.x |
| INFRA-02 | Config from env / `.env` | `dotenv` + fail-fast schema; `BOT_TOKEN`, `OPENCODE_URL`, `ALLOWED_USER_IDS` |
| INFRA-04 | Single shared SSE to `GET /event`, route by session ID | `fetchEventSource` or `fetch` + `eventsource-parser`; in-memory filter by `sessionID` on parsed events |
| ACC-01 | Reject non-allowlisted users (by Telegram user ID) | `bot.use()` allowlist middleware after DM gate; `ctx.from?.id` |
| ACC-02 | Reject non-allowlisted callback queries | Same allowlist on `callback_query` path; `ctx.callbackQuery.from.id` |
| ACC-03 | Allowlist from env (comma-separated IDs) | Parse to `Set<number>` at startup; validate non-empty numeric tokens |
</phase_requirements>

## Summary

Phase 1 establishes a **single Node.js process** that (1) validates configuration at startup, (2) performs a **GET `/global/health`** check against OpenCode, (3) maintains **one long-lived GET `/event` SSE** consumer with **reconnect and backoff**, parsing events and logging them while preparing for later **sessionID-scoped routing**, and (4) runs a **grammY** bot with **middleware order: DM-only gate → allowlist → handlers**, including **callback queries**.

**Primary recommendation:** Use **`grammy`** (npm package, `^1.41.1`) with `bot.chatType("private")` or an equivalent early guard for non-private chats, stack **global `bot.use()` middleware** for allowlist (shared by messages and callbacks), use **`@microsoft/fetch-event-source`** for SSE with **`openWhenHidden: true`** (important in Node where there is no document), wrap the client in an **outer retry loop** with exponential backoff and jitter, and validate env with **Zod** (or similar) after **`dotenv/config`**.

## Project Constraints (from .cursor/rules/)

**None —** `.cursor/rules/` is not present in this repository. Follow `.planning/research/STACK.md` and phase CONTEXT above.

## Standard Stack

### Core

| Library | Version (verified 2026-03-28) | Purpose | Why Standard |
|---------|----------------------------------|---------|--------------|
| `grammy` | **1.41.1** (`^1.41.1`) | Telegram bot, middleware, long polling | TypeScript-first, composable middleware; project lock (STACK.md) |
| `typescript` | **6.0.2** | Strict typechecking | INFRA-01 |
| `tsx` | **4.21.0** | Dev runner without separate build | STACK.md |
| `pino` | **10.3.1** | Structured logging | STACK.md; JSON logs for ops |
| Native `fetch` | Node built-in (Undici) | REST + SSE transport to OpenCode | STACK.md; one HTTP story |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `dotenv` | **17.3.1** | Load `.env` before validation | INFRA-02 local dev |
| `zod` | **4.3.6** | Startup env schema, parse `ALLOWED_USER_IDS` | Fail-fast config (D-05) |
| `@microsoft/fetch-event-source` | **2.0.1** | SSE over `fetch` (headers, retry hooks) | `GET /event` consumer |
| `eventsource-parser` | **3.0.6** | Incremental SSE parsing if using raw `fetch` body | Alternative to `fetchEventSource` |
| `pino-pretty` | ^13 (dev) | Human-readable logs in dev | Optional devDependency |

**Installation (illustrative):**

```bash
npm install grammy pino dotenv zod @microsoft/fetch-event-source
npm install -D typescript tsx @types/node pino-pretty
```

**Version verification:** Registry versions confirmed via `npm view <package> version` on 2026-03-28. The display name “grammY” maps to npm package **`grammy`** (lowercase).

### Alternatives Considered

| Instead of | Could use | Tradeoff |
|------------|-----------|----------|
| `@microsoft/fetch-event-source` | `fetch` + `eventsource-parser` | More control, slightly more code; same SSE semantics |
| `zod` | `envalid`, `env-schema` | Zod is ubiquitous and pairs well with TypeScript |

**Key insight:** Prefer **one** SSE implementation style in the codebase—either wrap `fetchEventSource` in a reconnect loop or own the stream with `eventsource-parser`, but do not mix patterns across modules.

## Architecture Patterns

### Recommended Project Structure

```
src/
├── main.ts              # bootstrap: config → health → start SSE + bot
├── config/
│   └── env.ts           # zod schema, parse ALLOWED_USER_IDS → Set<bigint|number>
├── opencode/
│   ├── health.ts        # GET /global/health
│   ├── sse.ts           # shared /event loop + reconnect + dispatch hooks
│   └── events.ts        # optional: narrow Event JSON types (align with SDK later)
├── bot/
│   ├── index.ts         # Bot instance, middleware chain
│   └── middleware/
│       ├── dm-only.ts   # private chat gate (before allowlist)
│       └── allowlist.ts # ACC-01/02 + D-03 message
└── logger.ts            # pino instance
```

This matches CONTEXT “Claude's discretion” and keeps OpenCode transport separate from Telegram.

### Pattern 1: grammY long polling

**What:** `Bot` + `bot.start()` (or `grammY` runner in production later) pulling updates from Telegram.

**When to use:** Default for Phase 1; no webhook server required.

**Example:**

```typescript
// Source: https://grammy.dev/guide/
import { Bot } from "grammy";

const bot = new Bot(process.env.BOT_TOKEN!);

bot.start();
```

Use **`npm run dev`** → `tsx src/main.ts` (or `node --import tsx src/main.ts`).

### Pattern 2: DM-only before allowlist (D-04)

**What:** Restrict handling to **private** chats so groups never reach allowlist logic.

**When to use:** Always per D-04.

**Options (pick one style project-wide):**

1. **`bot.chatType("private")`** — creates a composer; register allowlist and handlers under it ([filter queries doc](https://grammy.dev/guide/filter-queries.html) shows `const pm = bot.chatType("private"); pm.command(...)`).
2. **Explicit middleware** — resolve `chat` from `ctx.chat` or `ctx.callbackQuery?.message?.chat`; if `type !== "private"`, `return` without `next()`.

For **callback_query**, ensure the chat type check still runs (callback updates include `callback_query.message.chat` for messages in private chats).

### Pattern 3: Allowlist middleware (ACC-01, ACC-02, D-03)

**What:** Early `bot.use()` that checks `ctx.from?.id` against a **Set** from `ALLOWED_USER_IDS`. If not allowed: **`ctx.reply("You don't have access to this bot")`** (or `answerCbQuery` + message for callbacks where appropriate) and **do not** call `next()`.

**When to use:** All updates that should be gated; place **after** DM-only middleware so non-DM never hits allowlist (D-04).

**Example:**

```typescript
// Source: https://grammy.dev/guide/middleware.html
import type { Context, NextFunction } from "grammy";

export function allowlistMiddleware(allowed: Set<number>) {
  return async (ctx: Context, next: NextFunction) => {
    const uid = ctx.from?.id;
    if (uid === undefined || !allowed.has(uid)) {
      await ctx.reply("You don't have access to this bot");
      return;
    }
    await next();
  };
}
```

**Callback queries:** Same middleware runs if registered with `bot.use()` globally; for disallowed users, use **`ctx.answerCallbackQuery()`** (optional but avoids spinner stuck state) plus reply or short message—planner should pick one consistent UX.

### Pattern 4: Env validation at startup (D-05, INFRA-02)

**What:** `dotenv/config` at entry top, then `zod` safeParse; on failure log and **`process.exit(1)`**.

**Schema fields (illustrative):** `BOT_TOKEN` (non-empty string), `OPENCODE_URL` (URL, default `http://localhost:4096`), `ALLOWED_USER_IDS` (string parsed to non-empty set of positive integers).

### Pattern 5: OpenCode SSE client (INFRA-04, D-01, D-02)

**What:** **`fetchEventSource(`${baseUrl}/event`, { ... })`** with:

- **`openWhenHidden: true`** — avoids relying on document visibility (Node has no “visible tab”; keeps behavior predictable if code is reused in workers/tests).
- **`fetch`** — pass custom `fetch` if later adding Basic auth headers (`Authorization` from `OPENCODE_SERVER_*` — out of scope unless added in config).
- **`onmessage`** — `JSON.parse(ev.data)`; inspect event payload for **`sessionID`** (or equivalent field per OpenCode `Event` union) and **drop or route** events not matching active sessions (Phase 1: log all; filter hooks ready).
- **Reconnect:** On disconnect/error, log, apply **exponential backoff with jitter** (e.g. base 1s, max 60s, jitter ±20%), then reconnect. Implement via **outer `while` loop** with `AbortController` for shutdown, or `onerror` returning retry delay per library behavior.

**Alternative:** `const res = await fetch(url);` then feed `res.body` to **`createParser`** from `eventsource-parser` if you need lower-level control ([eventsource-parser](https://www.npmjs.com/package/eventsource-parser) streaming API).

### Pattern 6: Wiring bot + SSE in one process

**What:** After config + health check, start **both**:

1. **SSE task** — `void runSseLoop(signal)` (no await in main, or await `Promise.all` with bot runner—grammY’s `bot.start()` is long-lived; typical pattern is `await Promise.all([bot.start(), ssePromise])` only if both are awaitable; `fetchEventSource` promise resolves when stream ends—wrap in infinite retry loop so it stays “running”).

2. **Bot** — `await bot.start()` or use `bot.start()` return value per grammY docs.

**Anti-pattern:** Blocking `main` on SSE before starting Telegram—both should run concurrently once OpenCode is reachable.

### Anti-Patterns to Avoid

- **Installing wrong package name:** npm **`grammy`**, not `grammY`.
- **Allowlist before DM check:** Violates D-04; gate private chats first.
- **Using browser `EventSource` only:** Cannot set custom headers for future auth; `fetch`-based SSE is more flexible (STACK.md).
- **Silent drop for D-03:** CONTEXT requires an explicit rejection message for non-allowlisted users.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSE over GET with retry/backoff | Raw TCP/socket | `fetchEventSource` or `eventsource-parser` | Spec-compliant framing, chunk boundaries |
| Env parsing / coercion | Ad-hoc `process.env` reads | `zod` schema | Single validation path, typed config |
| Telegram update routing | Manual switch on `update_id` | grammY `Composer`, `bot.on`, `chatType` | Tested routing, filter queries |

**Key insight:** The only “custom” part should be **OpenCode event JSON** narrowing and **sessionID** routing—prefer aligning with generated OpenCode SDK types in a later phase when stable.

## Common Pitfalls

### Pitfall 1: `fetchEventSource` Page Visibility (Node / tests)

**What goes wrong:** Connection pauses or behaves unexpectedly if defaults assume a browser document.

**Why:** Library integrates with Page Visibility unless opted out.

**How to avoid:** Set **`openWhenHidden: true`** in `FetchEventSourceInit` ([type definitions](https://unpkg.com/@microsoft/fetch-event-source@2.0.1/lib/esm/fetch.d.ts)).

### Pitfall 2: Middleware order

**What goes wrong:** Commands answered by the wrong layer, or groups hitting allowlist.

**Why:** grammY runs middleware in registration order; broad matchers (`bot.on(":text")`) can swallow updates.

**How to avoid:** Register **DM gate → allowlist → feature handlers**; use `bot.chatType("private")` subtree or explicit early returns.

### Pitfall 3: Callback query without blocking handlers

**What goes wrong:** User taps button; allowlist passes but UI stuck “loading”.

**Why:** Callback queries should often call `answerCallbackQuery`.

**How to avoid:** For ACC-02, ensure rejected users still get **`answerCallbackQuery`** with error text when applicable.

### Pitfall 4: OpenCode base URL trailing slash

**What goes wrong:** Double slashes or broken paths when concatenating `/event`.

**Why:** String concat bugs.

**How to avoid:** Normalize base URL (e.g. `new URL("/event", base)`).

## Code Examples

### Health check (official API shape)

**Source:** [OpenCode server docs — Global](https://dev.opencode.ai/docs/server)

`GET /global/health` returns **`{ healthy: true, version: string }`**.

```typescript
const base = process.env.OPENCODE_URL ?? "http://localhost:4096";
const res = await fetch(new URL("/global/health", base));
if (!res.ok) throw new Error(`health: ${res.status}`);
const body = (await res.json()) as { healthy: boolean; version: string };
```

### tsconfig baseline (INFRA-01)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

Align `package.json` `"type": "module"` with `"module": "NodeNext"` (or use CommonJS consistently—**avoid mixed** defaults).

### Zod env parse (illustrative)

```typescript
import { z } from "zod";

const EnvSchema = z.object({
  BOT_TOKEN: z.string().min(1),
  OPENCODE_URL: z.string().url().default("http://localhost:4096"),
  ALLOWED_USER_IDS: z.string().transform((s) =>
    s.split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => Number.parseInt(x, 10))
  ).pipe(z.array(z.number().int().positive()).nonempty()),
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `node-fetch` on Node 20+ | Native `fetch` | Node 18+ stable | Fewer deps |
| Browser `EventSource` only | `fetch` + SSE libraries | Long-standing | Headers, retries, Node |

**Deprecated/outdated:** Relying on **Telegraf** as default for greenfield 2026 bots—still valid, but project chose **grammY** (STACK.md).

## Open Questions

1. **Exact JSON shape for every `/event` payload field**
   - **What we know:** Discriminated `Event` union exists in OpenCode SDK (`types.gen.ts`); ARCHITECTURE.md lists key `type` strings.
   - **What's unclear:** Field names for session association on every event variant.
   - **Recommendation:** Log raw `data` in Phase 1; add narrow TypeScript types + tests when integrating prompts (Phase 2+).

2. **HTTP Basic auth to OpenCode**
   - **What we know:** Docs describe `OPENCODE_SERVER_PASSWORD` optional auth.
   - **What's unclear:** Whether Phase 1 must send credentials.
   - **Recommendation:** Omit unless `.env` requires it; add optional `OPENCODE_BASIC_*` or `fetch` `headers` when needed.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Runtime | ✓ | v25.8.2 (host) | Use ≥20 LTS per STACK.md |
| npm | Dependencies | ✓ | (with Node) | — |
| OpenCode server | Health + SSE | Runtime expectation | listen `127.0.0.1:4096` default | Install/run `opencode serve`; phase fails fast if health check fails |
| Telegram Bot API | grammY long polling | Network | HTTPS 443 | Bot token required |

**Missing dependencies with no fallback:**

- Valid `BOT_TOKEN` and reachable Telegram API — blocks bot.
- Running OpenCode — blocks health/SSE verification unless tests mock `fetch`.

**Missing dependencies with fallback:**

- OpenCode down at dev time — use **mock `fetch`** in unit tests; document “start OpenCode first” for manual UAT.

## Validation Architecture

> `workflow.nyquist_validation` is **enabled** in `.planning/config.json`.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | **Vitest** or **node:test** + **tsx** (greenfield — pick one in Wave 0) |
| Config file | `vitest.config.ts` if Vitest |
| Quick run command | `npx vitest run` or `node --import tsx --test` |
| Full suite command | same as quick for small projects |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| INFRA-01 | `tsc --noEmit` strict | static | `npx tsc --noEmit` | ❌ Wave 0 — add `tsconfig.json` |
| INFRA-02 | Invalid env exits non-zero | unit | `vitest run src/config/env.test.ts` | ❌ Wave 0 |
| INFRA-04 | SSE reconnect calls logged / parser invoked | unit (mock fetch stream) | `vitest run src/opencode/sse.test.ts` | ❌ Wave 0 |
| ACC-01 | Non-allowlisted message → reply + no `next` | unit (mock Context) | `vitest run src/bot/middleware/allowlist.test.ts` | ❌ Wave 0 |
| ACC-02 | Non-allowlisted callback → blocked | unit | same file or dedicated | ❌ Wave 0 |
| ACC-03 | Parsed allowlist from env string | unit | `env.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run` (or targeted file).
- **Per wave merge:** full suite + `tsc --noEmit`.
- **Phase gate:** Full suite green before `/gsd-verify-work`; manual: success criteria 1–3 against real OpenCode + Telegram.

### Wave 0 Gaps

- [ ] Add `package.json` scripts: `dev`, `build`, `test`, `typecheck`.
- [ ] Add Vitest (or node:test) + minimal mock for `fetch` and grammY `Context`.
- [ ] Integration test (optional): hit real `http://localhost:4096/global/health` behind `process.env.RUN_INTEGRATION=1` skip if server absent.

## Sources

### Primary (HIGH confidence)

- [OpenCode Server documentation](https://dev.opencode.ai/docs/server) — `/global/health` response shape, `/event` SSE description.
- [grammY — Filter queries](https://grammy.dev/guide/filter-queries.html) — `chatType("private")` pattern.
- [grammY — Middleware](https://grammy.dev/guide/middleware.html) — `bot.use`, `next()` semantics.
- [npm `@microsoft/fetch-event-source` 2.0.1](https://www.npmjs.com/package/@microsoft/fetch-event-source) — API surface, `openWhenHidden`.
- `.planning/research/ARCHITECTURE.md` — endpoint table, event types, build order.
- `.planning/research/STACK.md` — library choices and rationale.
- `npm view` registry versions (2026-03-28): `grammy@1.41.1`, `zod@4.3.6`, etc.

### Secondary (MEDIUM confidence)

- [unpkg fetch.d.ts](https://unpkg.com/@microsoft/fetch-event-source@2.0.1/lib/esm/fetch.d.ts) — TypeScript options verification.

### Tertiary (LOW confidence)

- None material — SSE backoff numeric defaults are discretion per CONTEXT (choose in PLAN).

## Metadata

**Confidence breakdown:**

- Standard stack: **HIGH** — locked by STACK.md + npm verification.
- Architecture: **HIGH** — aligns with OpenCode docs + grammY guides.
- Pitfalls: **MEDIUM–HIGH** — `openWhenHidden` verified from types; full Node+SSE behavior should be smoke-tested.

**Research date:** 2026-03-28  
**Valid until:** ~30 days (dependencies) / sooner if OpenCode API changes
