# Phase 6: Power Features — RESEARCH.md

## RESEARCH COMPLETE

**Date:** 2026-03-29  
**Confidence:** MEDIUM for OpenCode image `parts[]` shape (must verify via `GET /doc` on installed server). HIGH for grammY + pino patterns.

---

## User Constraints

Copied from `.planning/phases/06-power-features/06-CONTEXT.md` — **planner and executor MUST honor verbatim.**

### Photo uploads
- **D-01:** Photos only — `message:photo`; do not handle `document` in this phase.
- **D-02:** Ignore caption — do not send caption text to OpenCode.
- **D-03:** Non-photo media → short “not supported yet” reply.
- **D-04:** Same allowlist and session resolution as text.

### `/clear`
- **D-05:** No `/clear` command; fresh context via `/new`.

### Logging
- **D-06–D-11:** Incoming Telegram fields at info; OpenCode HTTP metadata at info (no full bodies); SSE at info = event type + session id only; errors with context; JSON structured; stdout + daily-rotating file under `logs/`; README does not document logging.

### README
- **D-12–D-13:** Minimal; no external links.

### Model
- **D-14:** Regression / consistency check only for FILE-02.

### Overlap
- **D-15–D-17:** Busy + MCP rules for photos mirror text.

---

## Standard Stack

| Concern | Choice | Notes |
|---------|--------|------|
| Runtime | Node + TypeScript ESM | Existing |
| Bot | grammY 1.x | `bot.on("message:photo")`, `ctx.getFile()`, `file.download()` or `https.get` Telegram file URL |
| Logs | pino 10.x + pino-pretty (dev) | Existing `src/logger.ts` |
| File rotation | `rotating-file-stream` (or equivalent) + `pino.multistream` / `pino.destination` | Add dependency; write under `logs/` with daily rotation |
| Tests | vitest | `npm test` |

---

## Architecture Patterns

1. **Prompt body:** Extend `sendPromptAsync` pattern in `session.ts` — today `parts: [{ type: "text", text }]`. Image part must match OpenCode OpenAPI (e.g. `type: "file"` with `mime` + base64 or URL — **verify `GET /doc`**).
2. **Telegram download:** `await ctx.getFile()` → `file.file_path` → `https://api.telegram.org/file/bot<token>/<path>` — never log token in URLs; use `ctx.api.getFile` + download helper.
3. **Handler order:** Register `message:photo` after commands, alongside or instead of only `message:text` — photos are not `message:text`; use dedicated `bot.on("message:photo")`. Register **unsupported** handlers (`message:document`, etc.) with short reply per **D-03**.
4. **Logging:** Prefer a small `logTelegramUpdate(ctx)` at start of handlers + centralized wrappers for `fetch` to OpenCode (or explicit `logger.info` after each `fetch` in `session.ts`, `config.ts`, `replies.ts`, `health.ts`). SSE: add **`logger.info({ eventType, sessionID }, ...)`** per event for **LOG-03** while keeping delta detail at **debug** only (**D-08**).

---

## Don't Hand-Roll

- **SSE client** — keep existing `sse.ts` loop.
- **Custom log rotation** — use `rotating-file-stream` or battle-tested pino companion, not ad-hoc cron.

---

## Common Pitfalls

- **4096 limit:** Applies to bot *messages*; photo upload path sends to OpenCode, not Telegram text — still respect Telegram upload limits when downloading.
- **OpenCode `parts` schema drift** — always cross-check generated OpenAPI from running server.
- **Logging secrets:** Never log `bot` token, full env, or raw `Authorization` headers.
- **MCP:** Photo while `pending.isAwaitingFreeTextAnswer` — must not submit as question answer (**D-16**).

---

## Code Examples (sketches)

**grammY photo handler registration:**

```ts
bot.on("message:photo", async (ctx) => { ... });
```

**pino + rotating file (conceptual):**

```ts
import pino from "pino";
import { createStream } from "rotating-file-stream";
// stream filename with date pattern, multistream to stdout + file
```

---

## Validation Architecture

**Framework:** Vitest (`npm test`).  
**Quick command:** `npm test`  
**Full command:** `npm run typecheck && npm test`

**Sampling:** After each task commit, run `npm test` for touched tests; before phase verify, full suite + typecheck.

**Manual:** Optional smoke — send photo to local bot with OpenCode running (not automated in CI).

---

## Open Questions (resolve during execution)

1. Exact JSON shape for non-text `parts[]` entries (image) — **`GET /doc`** on `localhost:4096`.
2. Whether OpenCode expects base64 inline vs multipart — OpenAPI decides.
