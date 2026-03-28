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
| **Config file** | vitest.config.ts — Wave 0 installs |
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

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 0 | INFRA-01 | compile | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 1-01-02 | 01 | 1 | INFRA-02 | unit | `npx vitest run src/config` | ❌ W0 | ⬜ pending |
| 1-01-03 | 01 | 1 | ACC-03 | unit | `npx vitest run src/config` | ❌ W0 | ⬜ pending |
| 1-02-01 | 02 | 1 | INFRA-04 | unit | `npx vitest run src/opencode` | ❌ W0 | ⬜ pending |
| 1-03-01 | 03 | 1 | ACC-01, ACC-02 | unit | `npx vitest run src/bot` | ❌ W0 | ⬜ pending |
| 1-04-01 | 04 | 2 | INFRA-04 | integration | manual smoke test | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `package.json` — install grammy, typescript, tsx, pino, zod, dotenv, @microsoft/fetch-event-source, vitest
- [ ] `tsconfig.json` — strict mode, NodeNext module resolution
- [ ] `vitest.config.ts` — basic configuration
- [ ] `src/config/config.test.ts` — stubs for INFRA-02, ACC-03 (env validation)
- [ ] `src/bot/middleware.test.ts` — stubs for ACC-01, ACC-02 (allowlist middleware)
- [ ] `src/opencode/sse.test.ts` — stubs for INFRA-04 (SSE client)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SSE connects to live OpenCode at localhost:4096 | INFRA-04 | Requires running OpenCode server | Start opencode serve, run bot, check logs for "SSE connected" |
| Health check returns valid response | INFRA-02 | Requires live OpenCode | Check console log shows `{ healthy: true }` on startup |
| Rejection message sent to non-allowlisted user | ACC-01 | Requires live Telegram bot | Send message from unlisted account, verify rejection reply |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
