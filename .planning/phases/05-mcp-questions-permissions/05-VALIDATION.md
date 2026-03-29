---
phase: 5
slug: mcp-questions-permissions
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-29
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` (project root) |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30–90 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| *Filled after plans exist* | — | — | MCP-01–MCP-06 | unit | `npm test` | ⬜ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Unit tests for `PendingInteractiveState` (or equivalent) — stubs for MCP-06 clear rules
- [ ] Tests for SSE event parsing / session filter (D-11) where mockable
- [ ] Existing `npm test` / vitest covers repo — ensure new modules have colocated `*.test.ts`

*Wave 0 completes when every plan task has an automated verify path or explicit manual row below.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live `question.asked` / `permission.asked` payloads vs OpenCode build | MCP-01–MCP-05 | Requires running OpenCode + Telegram | Send prompt that triggers MCP tool question; confirm keyboard + reply |

*Automated tests use mocks for HTTP/SSE where possible.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
