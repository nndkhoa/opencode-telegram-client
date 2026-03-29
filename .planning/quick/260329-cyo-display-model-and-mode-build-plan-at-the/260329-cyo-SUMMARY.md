# Quick Task 260329-cyo — Summary

## Done

- After each completed assistant turn (`session.idle`), the bot loads the latest assistant row from `GET /session/:id/message` and appends a Telegram HTML footer: `provider/model · agent` (agent is the OpenCode primary agent name, e.g. `build` / `plan`; if `agent` is empty, `mode` is used).
- If that fetch yields nothing useful, model falls back to `resolveDisplayModel` (persisted `/model`, then config, then older session messages); agent shows `—`.
- `appendHtmlFooterToChunks` keeps the 4096 limit: footer goes on the last chunk or starts a new message when needed.
- HTML parse failure path appends the same info as plain text.

## Files

- `src/opencode/assistant-meta.ts` — fetch + resolve + `formatAssistantFooterHtml`
- `src/rendering/markdown.ts` — `appendHtmlFooterToChunks`
- `src/opencode/streaming-state.ts` — footer on final chunks; `StreamingStateManager(registry, openCodeUrl)`
- `src/main.ts` — pass `config.openCodeUrl` into manager
- Tests: `assistant-meta.test.ts`, `streaming-state.test.ts`, `message.test.ts`, `markdown.test.ts`
