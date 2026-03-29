# Quick task 260329-owj — Summary

## Done

- **Heartbeat logging:** `shouldLogSseEventAtInfo()` suppresses info and `OPENCODE_SSE_VERBOSE` lines for `heartbeat`, `*.heartbeat`, and `ping` SSE event types.
- **Lists:** `marked.use` custom `list` + `checkbox` renderers emit Telegram-safe lines; `sanitize-html` allows `br` so list separators survive.
- **Errors:** `extractOpenCodeErrorMessage()` reads `data.message` (+ optional `responseBody` for `APIError`). `StreamingStateManager` handles `session.error` and `message.updated` assistant errors, replaces the streaming placeholder with `❌ …`, clears busy state.

## Verification

- `npm test` — 218 passed
- `npm run typecheck` — clean
