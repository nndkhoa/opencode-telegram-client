# Phase 6: Power Features - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the Q&A.

**Date:** 2026-03-29
**Phase:** 6-Power Features
**Areas discussed:** File uploads, `/clear`, Logging, README, Overlap/guards

---

## Area 1 — File uploads

| Question | Options considered | User choice |
|----------|---------------------|-------------|
| Media types | documents, photos, video | **Photos only** (v1) |
| Unsupported types | short reply vs silent | **2a** — short “not supported yet” |
| Caption | send with file vs ignore | **3b** — **ignore caption** |
| Extra rules | — | **4a** — defer overlap to Area 5 |

**Notes:** Conflicts with **FILE-01** “document” wording — resolve in planning/requirements update.

---

## Area 2 — `/clear`

| Question | Options considered | User choice |
|----------|---------------------|-------------|
| Implement `/clear`? | yes / no | **No** — **use `/new` instead**; no clear command |

---

## Area 3 — Logging

| Question | User choice |
|----------|-------------|
| Incoming Telegram (info) | **1a** — user id, chat id, update type, message id, timestamp |
| OpenCode HTTP (info) | **2a** — method, path, session id; no full bodies |
| SSE (info) | **3a** — event type + session id only; no token deltas |
| Output | **4b** — stdout + **daily-rotating log file under `logs/`** |

---

## Area 4 — README

| Question | User choice |
|----------|-------------|
| Depth | **1a** — minimal: what it is, install, env table, run |
| Mention `logs/` / rotation? | **2c** — **no** |
| External links | **3** — **none** |

---

## Area 5 — Overlap (photo vs busy / MCP)

| Question | User choice |
|----------|-------------|
| Busy + photo | **1a** — same as text (**⏳** wait) |
| MCP free-text + photo | **2a** — not valid; text or `/cancel` |
| MCP keyboard + photo | **3a** — same as free-text path |

---

## Earlier mistaken pass

An initial run wrote context using **defaults without user decisions**; user requested **discussion again**. This log reflects **subsequent user answers only**.
