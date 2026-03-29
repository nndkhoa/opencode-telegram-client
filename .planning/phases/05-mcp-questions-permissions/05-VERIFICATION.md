---
phase: 05-mcp-questions-permissions
verified: 2026-03-29T03:51:40Z
status: passed
score: 4/4 success criteria verified
re_verification:
  previous_status: null
  previous_score: null
  gaps_closed: []
  gaps_remaining: []
  regressions: []
gaps: []
human_verification:
  - test: "End-to-end with real OpenCode + Telegram"
    expected: "question.asked with options shows keyboard; taps reach OpenCode; open-ended path accepts next message; permission three buttons post correct replies; /cancel and /switch clear prompts."
    why_human: "Automated suite uses mocks; live SSE shape and Telegram API behavior need a running stack."
  - test: "User-visible copy for open-ended questions"
    expected: "Prompt text should instruct users to send a reply, not reference internal phase numbers."
    why_human: "Code still contains placeholder strings mentioning “05-03” in `interactive-dispatch.ts` (cosmetic only; behavior is complete)."
---

# Phase 5: MCP questions & permissions — verification report

**Phase goal:** OpenCode MCP questions and permission prompts are surfaced interactively in Telegram.

**Verified:** 2026-03-29T03:51:40Z

**Status:** passed

**Re-verification:** No — initial verification

## Goal achievement

### Observable truths (roadmap success criteria)

| # | Truth | Status | Evidence |
|---|--------|--------|----------|
| 1 | `question.asked` with options → inline keyboard; tap submits answer | ✓ VERIFIED | `sendQuestionWithKeyboard` + `buildQuestionKeyboardForChat` (`interactive-dispatch.ts`); `q:pick` / `q:submit` → `postQuestionReply` (`callback-interactive.ts`) |
| 2 | `question.asked` with no options → prompt; next message is answer | ✓ VERIFIED | `sendQuestionPlainAwaitingText` sets `awaitingFreeText: true` (`interactive-dispatch.ts`); `isAwaitingFreeTextAnswer` + `postQuestionReply` in `message.ts` |
| 3 | `permission.asked` → three inline buttons once/always/reject; choice relayed | ✓ VERIFIED | `sendPermissionPrompt` — Once/Always/Reject (`interactive-dispatch.ts` 71–74); `postPermissionReply` with `once` \| `always` \| `reject` (`callback-interactive.ts` 57–68) |
| 4 | `/cancel`, session switch, or `question.replied` / `question.rejected` clears pending | ✓ VERIFIED | `cmd-cancel.ts` `pending.clear`; `cmd-switch.ts` on successful switch; `dispatchInteractiveOpenCodeEvent` → `clearOnQuestionReplied` / `clearOnQuestionRejected` (`interactive-dispatch.ts` 228–239); `/new` also clears (`cmd-new.ts`) per MCP-06 lifecycle |

**Score:** 4/4 truths verified

### Required artifacts (from PLAN must_haves)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/opencode/events.ts` | Interactive SSE unions + guards | ✓ | `question.asked`, `permission.asked`, lifecycle events |
| `src/opencode/interactive-pending.ts` | Per-chat pending, D-10/D-11, clear hooks | ✓ | `gsd-tools verify artifacts` on 05-01-PLAN: all passed |
| `src/opencode/replies.ts` | `postQuestionReply`, `postPermissionReply` | ✓ | POST paths and JSON bodies match OpenCode shapes |
| `src/opencode/interactive-dispatch.ts` | SSE → Telegram for asked + lifecycle | ✓ | Wired from `main.ts` after `manager.handleEvent` |
| `src/bot/handlers/callback-interactive.ts` | Callback → HTTP replies | ✓ | Registered in `bot/index.ts` |
| `src/bot/handlers/message.ts` | Free-text answer path | ✓ | Runs before busy guard when awaiting |
| `src/bot/handlers/cmd-cancel.ts` | Clears pending | ✓ | Interactive-only and streaming paths |
| `src/bot/handlers/cmd-switch.ts`, `cmd-new.ts` | Clear + `rememberSessionChat` | ✓ | MCP-06 session change |

### Key link verification

| From | To | Via | Status |
|------|-----|-----|--------|
| `main.ts` | `dispatchInteractiveOpenCodeEvent` | `await` after `handleEvent` | ✓ WIRED |
| `bot/index.ts` | `callback-interactive.ts` | `bot.on("callback_query", …)` | ✓ WIRED |
| `message.ts` | `postQuestionReply` | Awaiting free-text branch | ✓ WIRED |
| `replies.ts` | OpenCode HTTP | `fetch` POST | ✓ (gsd-tools key-links 05-01) |

### Data-flow trace (Level 4)

| Artifact | Data | Source | Real data? | Status |
|----------|------|--------|------------|--------|
| Interactive prompts | `event.properties` (questions, permission, ids) | SSE `onEvent` | ✓ From parsed OpenCode events | ✓ FLOWING |
| Reply POSTs | `answers`, `reply` | User callback / text + pending snapshot | ✓ Built from selection or `buildFreeTextQuestionAnswers` | ✓ FLOWING |

### Behavioral spot-checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase 05 unit/integration tests | `npx vitest run` (7 files, 48 tests) | Exit 0 | ✓ PASS |

### Requirements coverage (MCP-01 … MCP-06)

| ID | Description (REQUIREMENTS.md) | Plan claiming it | Status | Evidence |
|----|-----------------------------|------------------|--------|----------|
| MCP-01 | Options → inline keyboard | 05-02 | ✓ | `buildQuestionKeyboardForChat`, send path |
| MCP-02 | No options → prompt, next message = answer | 05-02, 05-03 | ✓ | `awaitingFreeText` + `message.ts` |
| MCP-03 | Answer via POST `/question/{id}/reply` | 05-01 | ✓ | `replies.ts` + callbacks + message handler |
| MCP-04 | Permission prompt (REQ text: Allow/Deny) | 05-02 | ✓ | Implementation matches OpenCode API: three buttons **Once / Always / Reject** and `PermissionReplyBody` — REQ line 38 is **wording drift** vs API/plans |
| MCP-05 | POST `/permission/{id}/reply` | 05-01 | ✓ | `postPermissionReply` |
| MCP-06 | Clear on `/cancel`, `question.replied`/`question.rejected`, session switch | 05-01, 05-03 | ✓ | `clear`, SSE handlers, switch; `/new` also clears |

**Orphaned requirements:** None — every MCP-0x for this phase appears in at least one PLAN `requirements` block.

### Anti-patterns

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `interactive-dispatch.ts` | User-visible strings still say “05-03” / “until 05-03 submits” (lines 271, 277) | ℹ️ Info | Behavior complete; copy should be updated for production polish |
| `interactive-pending.ts` | Comment “submit in 05-03” | ℹ️ Info | Internal comment only |

### Human verification required

See YAML frontmatter `human_verification` for live stack E2E and copy review.

### Gaps summary

None blocking phase goal. Optional follow-up: replace internal phase references in Telegram message copy.

---

_Verified: 2026-03-29T03:51:40Z_

_Verifier: Claude (gsd-verifier)_
