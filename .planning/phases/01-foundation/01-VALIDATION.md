---
phase: 1
slug: foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-28
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (TypeScript-native) |
| **Config file** | vitest.config.ts — installed in plan `01-01` |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

Aligned with `.planning/phases/01-foundation/01-01-PLAN.md`, `01-02-PLAN.md`, and `01-03-PLAN.md` (waves 1 → 2 → 3).

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Notes |
|---------|------|------|-------------|-----------|-------------------|-------|
| 01-01-T1 | 01-01 | 1 | INFRA-01 | scaffold + deps | `node` / `grep` checks per plan Task 1 | No unit tests in T1 |
| 01-01-T2 | 01-01 | 1 | INFRA-02, ACC-03 | unit | `npx vitest run src/config --reporter=verbose` | Env `parseEnv` tests |
| 01-02-T1 | 01-02 | 2 | INFRA-04 | unit + compile | `npx vitest run src/opencode/health.test.ts && npx tsc --noEmit` | Health + events |
| 01-02-T2 | 01-02 | 2 | INFRA-04 | unit | `npx vitest run src/opencode --reporter=verbose` | SSE + health tests |
| 01-03-T1 | 01-03 | 3 | ACC-01, ACC-02 | unit | `npx vitest run src/bot --reporter=verbose` | Middleware tests |
| 01-03-T2 | 01-03 | 3 | ACC-01, ACC-02 | compile + full suite | `npx tsc --noEmit` then `npx vitest run --reporter=verbose` | Bot + `main.ts` wire-up |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Phase 1 does not use a separate Wave 0 plan. Bootstrap and test layout come from **`01-01`** (package.json, tsconfig, vitest, `src/config/env.test.ts`). OpenCode client tests land in **`01-02`** (`health.test.ts`, `sse.test.ts`). Bot tests land in **`01-03`** (`allowlist.test.ts`).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SSE connects to live OpenCode at localhost:4096 | INFRA-04 | Requires running OpenCode server | Start opencode serve, run bot, check logs for "SSE connected" |
| Health check returns valid response | INFRA-04 | Requires live OpenCode | Check console log shows `{ healthy: true }` on startup |
| Rejection message sent to non-allowlisted user | ACC-01 | Requires live Telegram bot | Send message from unlisted account, verify rejection reply |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or documented scaffold checks
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
