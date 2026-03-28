# Stack Research

**Project:** OpenCode Telegram Client  
**Researched:** 2026-03-28  
**Sources:** npm registry (`npm view`, current as of research date), [grammY comparison](https://grammy.dev/resources/comparison), [Telegram Bot API](https://core.telegram.org/bots/api) (HTML formatting rules)

---

## Recommended Stack

| Layer | Library | Version | Rationale | Confidence |
|-------|---------|---------|-----------|------------|
| Runtime | **Node.js** | **≥ 20 LTS** (22 LTS when available on host) | Native `fetch` (Undici-backed), stable long polling + HTTP to local OpenCode; align team on one LTS. | HIGH |
| Telegram framework | **grammY** | **^1.41.1** | First-class TypeScript, active releases, docs/plugins, middleware fits sessions + allowlist; better fit than aging Telegraf or NTBA for a growing bot. | HIGH |
| Markdown → HTML | **marked** + **sanitize-html** | **^17.0.5** + **^2.17.2** | OpenCode returns Markdown; **HTML** `parse_mode` needs a real HTML pipeline—`marked` (GFM-capable) → `sanitize-html` with a **Telegram HTML tag whitelist** from [official docs](https://core.telegram.org/bots/api#formatting-options). | HIGH |
| SSE / streaming HTTP | **@microsoft/fetch-event-source** (+ optional **eventsource-parser**) | **^2.0.1** (+ **^3.0.6**) | OpenCode may use **POST or custom headers** for streamed responses; browser-style `EventSource` only does GET—`fetch-event-source` is the standard answer. Use **eventsource-parser** if you consume a raw `fetch` body stream and want a battle-tested SSE tokenizer. | MEDIUM–HIGH |
| HTTP client | **Native `fetch`** (Node **undici** internally) | *built-in* | No extra dependency for localhost JSON/SSE; same semantics as browsers. Add **undici** explicitly only if you need `ProxyAgent`, custom `Dispatcher`, or fine-tuned connection pooling. | HIGH |
| Logging | **pino** (+ **pino-pretty** dev-only) | **^10.3.1** (+ **^13.1.3**) | Structured JSON, very fast, fits “log requests/responses to console” without a log DB; child loggers per chat/session. | HIGH |
| TypeScript | **typescript** | **^6.0.2** | Project-wide typechecking; pin in lockfile. | HIGH |
| Dev / run | **tsx** | **^4.21.0** | Run TypeScript during local dev without a separate build step. | HIGH |
| Build (optional) | **esbuild** | **^0.27.4** | Fast `dist/` output if you ship compiled JS; alternatively `tsc` only. | MEDIUM |

---

## Telegram Bot Library

**Pick: grammY `^1.41.1`**

**Why grammY (for this project):**

- **TypeScript-first:** Types stay readable; fewer “fight the compiler” issues than Telegraf v4’s heavier typings (see [official comparison](https://grammy.dev/resources/comparison)).
- **Maintenance:** `grammY` is actively published (2026); **Telegraf `^4.16.3`** last shipped **2024-02**—fine for existing bots, weaker signal for a **greenfield** 2026 stack.
- **Structure:** Middleware model maps cleanly to **allowlist**, **per-chat session**, and **command routing** without the `EventEmitter`-sprawl typical of **node-telegram-bot-api (NTBA)** in larger codebases.

**Telegraf:** Still widely used and capable; reasonable if the team already knows it. For *new* code with heavy TS and docs-driven development, grammY is the better default.

**node-telegram-bot-api:** Minimal surface area and easy mental model for tiny scripts; for a **full OpenCode client** (streaming, MCP prompts, session UX), frameworks with composable middleware scale better.

**Confidence:** **HIGH** (npm freshness + official grammY positioning + Telegraf release cadence).

---

## Markdown → HTML Conversion

**Critical for this project:** `PROJECT.md` mandates **Telegram `parse_mode: HTML`**, not MarkdownV2. Libraries that emit “Telegram Markdown” strings are the wrong abstraction here.

**Pick: `marked` + `sanitize-html`**

1. **Parse Markdown (incl. GFM):** Use **marked `^17.0.5`** with GFM-oriented options so lists, tables, and strikethrough from models map to HTML.
2. **Clamp to Telegram-safe HTML:** Pipe HTML through **sanitize-html `^2.17.2`** with `allowedTags` / `allowedAttributes` matching Telegram’s HTML subset (e.g. `b`, `i`, `u`, `s`, `code`, `pre`, `a`, `blockquote`, `tg-spoiler`, `span` where applicable—see [HTML style](https://core.telegram.org/bots/api#html-style) in the Bot API spec). Strip unsupported tags rather than sending invalid markup.
3. **Length / Telegram limits:** After conversion, enforce **4096 characters** for standard messages (split or truncate with user-visible behavior)—this is application logic, not the converter’s job.

**Why not “Telegram markdown” converters for this stack?**

- **telegramify-markdown** converts to **Telegram-flavored Markdown strings**, not HTML—it does not satisfy the “HTML parse mode” decision by itself.

**Optional alternative:** **markdown-it `^14.1.1`** + plugins if you need richer pluggable syntax; same **sanitize-html** post-pass still applies. Slightly more wiring than `marked` for similar outcomes.

**Confidence:** **HIGH** on pipeline shape; **MEDIUM** on edge cases (nested lists, complex tables) until tested against real OpenCode output—plan golden tests on sample Markdown.

---

## SSE / Streaming

**Likely need:** Stream tokens from OpenCode over HTTP (often **SSE**). Two layers:

| Approach | When |
|----------|------|
| **@microsoft/fetch-event-source `^2.0.1`** | Server expects **POST** (or non-GET), auth headers, or custom retry/backoff—common for “open a stream” APIs. |
| **`fetch` + `eventsource-parser` `^3.0.6`** | You already hold a **`Response.body` `ReadableStream`** (e.g. from undici/fetch) and want incremental `event` / `data` frames without implementing parsing yourself. |
| **eventsource `^4.1.0`** | Spec-style `EventSource` client when **GET** with default semantics is enough; less flexible for POST/SSE hybrids. |

**Recommendation:** Start with **`fetch` + `@microsoft/fetch-event-source`** so you are not blocked if OpenCode’s stream endpoint is not “simple GET EventSource.” Wire **`eventsource-parser`** if you end up with a raw stream and need lower-level control.

**Confidence:** **MEDIUM–HIGH** until OpenCode’s exact streaming contract is documented (endpoint shape is still TBD in `PROJECT.md`).

---

## HTTP Client

**Pick: native `fetch` (Node 20+)**

- **Undici** is the implementation behind `fetch` in Node; treat **`undici` `^7.24.6`** as an explicit dependency only when you need APIs beyond `fetch` (custom agents, pooling, H2 details).
- **axios `^1.14.0`:** Feature-rich and familiar, but adds a dependency and overlapping surface area with `fetch` for JSON + stream use cases. Skip for greenfield unless the team standardizes on it.
- **node-fetch `^3.3.2`:** Largely **redundant** on Node 18+; v3 is ESM-oriented—prefer native `fetch` to avoid two HTTP stacks.

**Confidence:** **HIGH**.

---

## Logging

**Pick: pino `^10.3.1`**

- **Structured logs** (JSON) map well to “what came from Telegram / what went to OpenCode” with consistent fields (`direction`, `chatId`, `sessionId`, `latencyMs`, etc.).
- **Performance:** Low overhead when volume spikes during streaming.
- **Dev ergonomics:** **pino-pretty `^13.1.3`** as a **devDependency** for human-readable local output only.

**Winston `^3.19.0`:** Mature and flexible; heavier and slower than pino for high-frequency structured logs. Prefer winston only if you already depend on its transports ecosystem.

**Confidence:** **HIGH** for pino in Node services.

---

## TypeScript Setup

**Tooling**

- **typescript `^6.0.2`** — `strict` mode on.
- **tsx `^4.21.0`** — local `node --import tsx` or `tsx src/main.ts` for fast iteration.
- **Production build:** either `tsc` emitting `dist/` **or** **esbuild `^0.27.4`** for a single bundled entry (nice for `npx`-style runs).

**tsconfig (recommendations)**

- `"target": "ES2022"` (or newer, aligned with Node LTS).
- `"module": "NodeNext"` and `"moduleResolution": "NodeNext"` if publishing ESM; if CommonJS, be explicit and consistent—**avoid mixed defaults**.
- `"strict": true`, `"skipLibCheck": true` (pragmatic for speed).
- `"outDir": "dist"`, `"rootDir": "src"` when compiling.
- **`@types/node`** pinned to your Node major (e.g. **^22** or **^20**).

**Confidence:** **HIGH** on patterns; exact `module` choice depends on final `package.json` `"type"` field.

---

## What NOT to Use

| Item | Reason |
|------|--------|
| **telegramify-markdown** as the primary formatter | Targets **Telegram Markdown**, not **HTML** `parse_mode`; misaligned with `PROJECT.md`. |
| **node-telegram-bot-api** as the main framework | Acceptable for scripts; poor fit for layered middleware, testability, and long-term structure for this feature set. |
| **Raw HTML from models without sanitization** | XSS and API rejection risk; always run through a **Telegram-aware whitelist** (`sanitize-html` configured, not defaults-only). |
| **axios + fetch + node-fetch together** | Pick **one** HTTP story (`fetch` first) to simplify streaming and testing. |
| **node-fetch on Node 20+** | Redundant with global `fetch` unless you have a specific interop requirement. |
| **Console-only `console.log` for operational logs** | Works at tiny scale; fails structured request tracing compared to **pino**—project explicitly wants request/response visibility. |

---

## Version Pinning Note

Pin exact versions in **package-lock.json** / **pnpm-lock.yaml** at implementation time; caret ranges above reflect **current latest** from npm at research time and should be refreshed when `npm install` runs.
