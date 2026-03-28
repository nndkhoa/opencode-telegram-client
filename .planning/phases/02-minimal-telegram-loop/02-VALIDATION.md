---
phase: 2
slug: minimal-telegram-loop
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-28
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run --reporter=verbose --coverage` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run --reporter=verbose --coverage`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 1 | MSG-01 | unit | `npx vitest run src/opencode/client.test.ts` | ❌ W0 | ⬜ pending |
| 2-01-02 | 01 | 1 | MSG-01 | unit | `npx vitest run src/opencode/client.test.ts` | ❌ W0 | ⬜ pending |
| 2-01-03 | 01 | 1 | MSG-02 | unit | `npx vitest run src/opencode/streamer.test.ts` | ❌ W0 | ⬜ pending |
| 2-02-01 | 02 | 2 | MSG-03 | unit | `npx vitest run src/bot/handler.test.ts` | ❌ W0 | ⬜ pending |
| 2-02-02 | 02 | 2 | MSG-04 | unit | `npx vitest run src/bot/handler.test.ts` | ❌ W0 | ⬜ pending |
| 2-02-03 | 02 | 2 | MSG-07 | unit | `npx vitest run src/bot/handler.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/opencode/client.test.ts` — stubs for MSG-01 (session creation, prompt dispatch)
- [ ] `src/opencode/streamer.test.ts` — stubs for MSG-02 (SSE streaming, delta assembly)
- [ ] `src/bot/handler.test.ts` — stubs for MSG-03, MSG-04, MSG-07 (message handling, typing action, error handling)

*Existing vitest infrastructure covers framework — only test stub files need creation.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Streaming message updates visible in Telegram UI | MSG-03 | Requires live Telegram bot + chat session | Send a message to the bot and observe tokens appearing in real time |
| `typing` chat action visible in Telegram | MSG-03 | Telegram client UI state, not testable via API | Observe the "typing..." indicator in the chat before response arrives |
| Final message replaces interim draft | MSG-04 | Requires live Telegram + timing observation | Confirm the streamed draft is replaced cleanly by the final message |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
