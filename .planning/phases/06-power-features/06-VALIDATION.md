---
phase: 6
slug: power-features
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-29
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (latest) |
| **Config file** | `package.json` scripts + `vitest` defaults |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm run typecheck && npm test` |
| **Estimated runtime** | ~30–90 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test` (scoped to changed tests when practical)
- **After every plan wave:** Run `npm run typecheck && npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 6-01-01 | 01 | 1 | LOG-05 | unit | `npm test -- logger` | ⬜ | ⬜ pending |
| 6-01-02 | 01 | 1 | LOG-01 | unit | `npm test -- bot` | ⬜ | ⬜ pending |
| 6-01-03 | 01 | 1 | LOG-02–LOG-04 | unit | `npm test -- session` / integration | ⬜ | ⬜ pending |
| 6-02-01 | 02 | 2 | FILE-01 | unit | `npm test -- photo` / `session` | ⬜ | ⬜ pending |
| 6-03-01 | 03 | 3 | INFRA-03 | grep | `grep README` | ⬜ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Existing vitest infrastructure — **no new framework install** unless executor discovers missing peer deps for rotation library

*Existing infrastructure covers unit testing.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Photo end-to-end to OpenCode | FILE-01 | Needs live OpenCode + Telegram | Send photo in DM; verify OpenCode receives prompt with image part |
| Rotated log file appears | LOG-05 | Filesystem date | Run bot 1 day or adjust system clock / use test hook |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or documented manual path
- [ ] `nyquist_compliant: true` set in frontmatter when phase verified

**Approval:** pending
