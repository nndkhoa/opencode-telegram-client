---
phase: 4
slug: session-commands
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-28
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts (if exists) or package.json scripts |
| **Quick run command** | `npx vitest run` |
| **Full suite command** | `npx vitest run --coverage` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run`
- **After every plan wave:** Run `npx vitest run --coverage`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 1 | SESS-01 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 4-01-02 | 01 | 1 | SESS-02 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 4-01-03 | 01 | 1 | SESS-03 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 4-02-01 | 02 | 1 | SESS-04 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 4-02-02 | 02 | 1 | CMD-01 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 4-02-03 | 02 | 1 | CMD-02 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 4-03-01 | 03 | 2 | CMD-03 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 4-03-02 | 03 | 2 | CMD-04 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 4-03-03 | 03 | 2 | CMD-05 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 4-04-01 | 04 | 2 | CMD-06 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 4-04-02 | 04 | 2 | CMD-07 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 4-04-03 | 04 | 2 | SESS-05 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 4-04-04 | 04 | 2 | SESS-06 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/__tests__/session-registry.test.ts` — stubs for SESS-01, SESS-02, SESS-03
- [ ] `src/__tests__/commands.test.ts` — stubs for CMD-01 through CMD-07, SESS-04, SESS-05, SESS-06

*Existing vitest infrastructure assumed from Phase 1-3.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| BotFather command menu visible in Telegram | CMD-07 | Requires live Telegram client | Open bot in Telegram, type `/` and verify all commands appear in picker |
| `/cancel` mid-stream stops response | CMD-05 | Requires live OpenCode + Telegram | Send a long prompt, then `/cancel` — verify "Request cancelled" reply |
| `/status` shows correct model ID | CMD-03 | Requires live OpenCode session | Start a session, run `/status` — verify modelID displayed matches config |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
