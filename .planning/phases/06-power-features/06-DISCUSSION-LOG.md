# Phase 6: Power Features - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-29
**Phase:** 6-Power Features
**Areas discussed:** File uploads, `/clear`, Logging policy, README scope, Overlap/guards

---

## File uploads (Telegram → OpenCode)

| Option | Description | Selected |
|--------|-------------|----------|
| Documents + photos | Download and forward as prompt file parts; caption as text in same turn | ✓ |
| Documents only | Exclude photos | |
| All media types | Voice, video, stickers | |

**User's choice:** Discuss all areas — **documents + photos**; other media explicit not-supported reply (**D-03**).
**Notes:** Wire format deferred to OpenCode `GET /doc` / research (**D-01**).

---

## `/clear` semantics

| Option | Description | Selected |
|--------|-------------|----------|
| API-native clear | Use dedicated clear route if present in OpenCode | ✓ (preferred path) |
| Delete + recreate session | `DELETE /session` + new session + registry rebind | ✓ (fallback per **D-05**) |
| Confirmation prompt | Second step before clear | |

**User's choice:** **No** confirmation (**D-08**); abort in-flight first (**D-07**); clear MCP pending (**D-06**).

---

## Logging policy (pino)

| Option | Description | Selected |
|--------|-------------|----------|
| Full bodies at info | Log entire prompts/responses | |
| Truncated / leveled | Info for metadata; bodies debug or truncated | ✓ (**D-10**, **D-13**) |
| No Telegram ids | Privacy-minimal | |
| Log user/chat ids | Operational debugging on allowlisted bot | ✓ (**D-09**) |

**User's choice:** Structured JSON prod, pretty dev (**D-12**); no secrets; SSE deltas not at info (**D-13**).

---

## README scope

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal | Env + run only | |
| Minimal + troubleshooting | Add common failure modes | ✓ (**D-14**) |

**User's choice:** Table + run + short troubleshooting.

---

## Overlap / guards (files vs streaming & MCP)

| Option | Description | Selected |
|--------|-------------|----------|
| Same busy guard as text | Reject file when streaming | ✓ (**D-16**) |
| File as MCP answer | Allow file to satisfy free-text question | |
| Require text for MCP | File rejected with guidance | ✓ (**D-17**) |

**User's choice:** Align with text busy behavior; files do not satisfy MCP prompts.

---

## Claude's Discretion

- OpenCode request bodies for file parts and exact clear sequence
- Truncate lengths and pino field layout
- grammY file download details

## Deferred Ideas

- Message queue while streaming (**v2**)
- Log DB / query UI (out of scope for v1)
