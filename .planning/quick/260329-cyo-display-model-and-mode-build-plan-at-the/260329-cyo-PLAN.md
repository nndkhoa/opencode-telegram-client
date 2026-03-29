# Quick Task 260329-cyo: display model and mode (build/plan) at end of Telegram message

## Tasks

1. **Assistant metadata** — Add `fetchLastAssistantFooterInfo` + HTML footer helper: `GET /session/:id/message`, take the latest assistant row, read `providerID`/`modelID`, `agent` (build/plan), with fallback to `resolveDisplayModel` when fetch fails.
2. **Rendering** — Append footer to final HTML chunks (respect 4096; footer on last chunk or new message).
3. **StreamingStateManager** — Accept `openCodeUrl`, on `session.idle` await metadata and append footer before `editMessageText` / `sendMessage`; include footer on HTML-fallback plain path.
4. **Tests** — Unit-test message parsing; update streaming-state tests (mock `fetch`).

## Verification

- `npm test` passes.
- Final assistant Telegram message ends with italic line `model · agent` (e.g. `anthropic/x · build`).
