# Quick task 260329-owj — SSE noise, list rendering, OpenCode errors

## Tasks

1. **SSE:** Skip info (and verbose) logs for heartbeat-style event types (`heartbeat`, `*.heartbeat`, `ping`).
2. **Markdown:** Telegram HTML does not support `<ul>`/`<ol>`/`<li>`; render GFM lists as `•` / `1.` with `<br>`, allow `br` in sanitize; checkbox lines use ☐/☑.
3. **Errors:** On `session.error` and `message.updated` (assistant with `error`), extract message via OpenCode SDK-shaped errors and edit the active turn message with `❌ …`.

## Files

- `src/opencode/sse.ts`
- `src/rendering/markdown.ts`
- `src/opencode/open-errors.ts` (new)
- `src/opencode/streaming-state.ts`
- Tests: `open-errors.test.ts`, `markdown.test.ts`, `streaming-state.test.ts`
