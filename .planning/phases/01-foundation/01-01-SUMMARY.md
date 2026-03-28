---
phase: 01-foundation
plan: 01
subsystem: infra
tags: [typescript, zod, vitest, pino, grammy, dotenv, nodejs]

requires: []

provides:
  - Compilable TypeScript project with strict mode (NodeNext module resolution)
  - Zod-validated env config singleton exported as typed `Config` object
  - Testable `parseEnv()` function separated from singleton for unit testing
  - Vitest test infrastructure with 6 passing unit tests
  - pino logger singleton with dev pretty-print and production JSON modes
  - .env.example documenting BOT_TOKEN, ALLOWED_USER_IDS, OPENCODE_URL

affects: [01-02, 01-03, all subsequent plans that import config or logger]

tech-stack:
  added: [grammy@1.41.1, zod@4.3.6, pino@10.3.1, dotenv@17.3.1, "@microsoft/fetch-event-source@2.0.1", typescript@6.0.2, tsx@4.21.0, vitest, pino-pretty]
  patterns: [fail-fast env validation at startup, parseEnv separated from singleton for testability, NodeNext ESM module resolution]

key-files:
  created:
    - package.json
    - tsconfig.json
    - vitest.config.ts
    - .env.example
    - src/logger.ts
    - src/config/env.ts
    - src/config/parse-env.ts
    - src/config/env.test.ts
  modified: []

key-decisions:
  - "parseEnv() extracted to parse-env.ts separate from env.ts singleton — enables test imports without triggering process.exit(1)"
  - "ESM-native project with type=module and NodeNext module resolution — all imports use .js extensions"
  - "Fail-fast config: process.exit(1) on startup if any required env var is invalid (D-05)"
  - "ALLOWED_USER_IDS parsed to Set<number> at startup, validated non-empty and numeric (D-07)"
  - "OPENCODE_URL defaults to http://localhost:4096 when absent (D-06)"

patterns-established:
  - "Pattern: Config singleton import — import { config } from './config/env.js' for production use"
  - "Pattern: Test isolation — import { parseEnv } from './config/parse-env.js' in tests to avoid process.exit"
  - "Pattern: ESM imports — always use .js extension even for .ts source files"

requirements-completed: [INFRA-01, INFRA-02, ACC-03]

duration: 2min
completed: 2026-03-28
---

# Phase 01 Plan 01: Foundation — Project Scaffold Summary

**TypeScript/ESM project scaffold with Zod-validated env config (BOT_TOKEN, ALLOWED_USER_IDS as Set<number>, OPENCODE_URL with default), pino logger, and 6 passing Vitest unit tests covering all validation paths**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-28T13:23:21Z
- **Completed:** 2026-03-28T13:25:27Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Bootstrapped ESM TypeScript project with strict mode, NodeNext module resolution, and all dependencies installed
- Created Zod-validated env config with fail-fast `process.exit(1)` on startup for missing BOT_TOKEN or invalid ALLOWED_USER_IDS
- Separated `parseEnv()` from the config singleton to enable full unit test coverage without triggering process.exit
- 6 passing Vitest unit tests covering: valid config, URL default, missing BOT_TOKEN, empty ALLOWED_USER_IDS, non-numeric IDs, comma-separated ID parsing

## Task Commits

Each task was committed atomically:

1. **Task 1: Initialize project scaffold** - `79e7c58` (chore)
2. **Task 2: Add env config module with Zod validation + logger** - `4518179` (feat)

## Files Created/Modified

- `package.json` - ESM project with grammy, zod, pino, dotenv, fetch-event-source deps and npm scripts
- `tsconfig.json` - Strict TypeScript with NodeNext module resolution, ES2022 target
- `vitest.config.ts` - Vitest config targeting src/**/*.test.ts
- `.env.example` - Documents BOT_TOKEN (required), ALLOWED_USER_IDS (required), OPENCODE_URL (optional)
- `src/logger.ts` - pino singleton with pino-pretty in dev, JSON in production
- `src/config/parse-env.ts` - Zod schema + `parseEnv()` function (no side effects, safe to import in tests)
- `src/config/env.ts` - Config singleton that calls `parseEnv(process.env)` and exits on failure; re-exports `parseEnv` and `Config` type
- `src/config/env.test.ts` - 6 unit tests importing from parse-env.js directly

## Decisions Made

- Extracted `parseEnv` to `parse-env.ts` separate from the singleton in `env.ts`. When tests import `env.ts`, the top-level module code runs `parseEnv(process.env)` — since the test environment has no BOT_TOKEN, this triggers `process.exit(1)`. The separation lets tests import `parse-env.ts` directly with no side effects.
- Used `.js` extensions in all imports (required for NodeNext ESM resolution with TypeScript source files).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Separated parseEnv into parse-env.ts to fix process.exit in test context**
- **Found during:** Task 2 (running vitest)
- **Issue:** Importing `env.ts` in tests triggered top-level singleton code which called `process.exit(1)` since BOT_TOKEN was absent in test env. Plan said "Tests do NOT import the module top-level" but the test imported `parseEnv` from `env.ts` which still executed module-level code.
- **Fix:** Moved pure `parseEnv` function and Zod schema to `src/config/parse-env.ts` (no dotenv import, no process.exit). `env.ts` imports from `parse-env.ts` and re-exports for consumers. Tests import from `parse-env.ts` directly.
- **Files modified:** src/config/env.ts, src/config/parse-env.ts (new), src/config/env.test.ts
- **Verification:** All 6 tests pass; `npx tsc --noEmit` exits 0
- **Committed in:** 4518179 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug fix for test isolation)
**Impact on plan:** Essential fix for testability. API surface unchanged — `config` singleton and `parseEnv` function still exported from `src/config/env.ts` as specified. Only internal structure changed.

## Issues Encountered

- The plan's test file imported `parseEnv` from `./env.js` but the module-level singleton code in env.ts still executes on import, causing `process.exit(1)` in test context. Resolved by extracting pure function to `parse-env.ts`.

## User Setup Required

None - no external service configuration required for this plan. BOT_TOKEN and ALLOWED_USER_IDS will be needed at runtime (documented in .env.example).

## Next Phase Readiness

- All subsequent Phase 1 plans can import `{ config }` from `./config/env.js` for typed config access
- `config.botToken`, `config.openCodeUrl`, `config.allowedUserIds` (Set<number>) are ready
- Test infrastructure (Vitest) is ready for Plans 02 and 03
- TypeScript compiles strictly — foundation for all subsequent type-safe code

---
*Phase: 01-foundation*
*Completed: 2026-03-28*
