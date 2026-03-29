# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — MVP

**Shipped:** 2026-03-29  
**Phases:** 8 | **Plans:** 21

### What Was Built

- End-to-end Telegram bot proxying OpenCode: allowlist, streaming replies, HTML rendering, session registry and commands
- Interactive MCP question and permission flows with inline keyboards and free-text follow-up
- Power features: photo upload to sessions, global model switching with `/model`, structured pino logging, minimal README

### What Worked

- Vertical-slice phases (connectivity → loop → rendering → sessions → MCP → polish) kept each increment shippable
- TDD and handler tests around grammY and OpenCode boundaries caught routing and parse_mode issues early
- Single shared SSE connection with session-scoped dispatch scaled cleanly to interactive events

### What Was Inefficient

- Inserted decimal phases (04.1, 04.2) for model UX show that upfront API/display contracts for `/status` and `/model` would have reduced rework
- Some SUMMARY front matter lacked one-liner fields, which diluted auto-extracted milestone accomplishments until cleaned manually

### Patterns Established

- Command registration order: all `bot.command()` handlers before the catch-all text handler
- Interim stream as plain text; Telegram HTML only on final message after markdown pipeline
- Session registry as single source of truth for chat→active session; streaming state references registry, not a parallel map

### Key Lessons

1. Align OpenCode event shapes with the SDK union early; add narrow casts at integration boundaries instead of fighting the catch-all union in handlers.
2. Telegram HTML tables are unsupported; use monospace-aligned text or lists for tabular status output.

### Cost Observations

- Model mix: not instrumented in-repo for this milestone
- Sessions: N/A
- Notable: Milestone completion is documentation- and test-heavy relative to LOC; keeping REQUIREMENTS checkboxes in sync with traceability avoids false “pending” rows at ship time

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Key Change |
|-----------|--------|------------|
| v1.0 | 8 | Initial GSD roadmap from foundation through power features |

### Cumulative Quality

| Milestone | Test stack | Notes |
|-----------|------------|-------|
| v1.0 | Vitest | Unit and handler tests across config, OpenCode client, bot handlers |

### Top Lessons (Verified Across Milestones)

1. _(Add after v1.1+)_
