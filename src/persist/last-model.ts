import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { patchConfig } from "../opencode/config.js";
import { logger } from "../logger.js";

const DEFAULT_FILE = join(process.cwd(), "data", "last-model.json");

type PersistedFile = { model: string };

let diskRead: string | undefined | null = null;
/** Model we believe OpenCode global config matches this process (after save or successful PATCH). */
let appliedModel: string | undefined;

function path(): string {
  return process.env.TELEGRAM_LAST_MODEL_FILE ?? DEFAULT_FILE;
}

function readDisk(): string | undefined {
  if (diskRead !== null) return diskRead;
  const p = path();
  if (!existsSync(p)) {
    diskRead = undefined;
    return diskRead;
  }
  try {
    const raw = readFileSync(p, "utf8");
    const o = JSON.parse(raw) as PersistedFile;
    if (typeof o.model === "string" && o.model.trim() !== "") {
      diskRead = o.model.trim();
    } else {
      diskRead = undefined;
    }
  } catch (err) {
    logger.warn({ err, path: p }, "Could not read persisted last model — ignoring");
    diskRead = undefined;
  }
  return diskRead;
}

/**
 * Model from the last successful `/model` (written to `data/last-model.json`).
 * Prefer this over `GET /config` for prompts and `/status`: OpenCode may still report
 * an older effective model (e.g. `agent.build.model`) after `PATCH /config`.
 */
export function getPersistedModelRef(): string | undefined {
  return readDisk();
}

export function savePersistedModel(model: string): void {
  const trimmed = model.trim();
  const p = path();
  mkdirSync(dirname(p), { recursive: true });
  const payload: PersistedFile = { model: trimmed };
  writeFileSync(p, JSON.stringify(payload, null, 2), "utf8");
  diskRead = trimmed;
  appliedModel = trimmed;
}

/**
 * Re-applies persisted global model to OpenCode once per process (or after save) so the first
 * user message after a bot restart uses the same model as before, if OpenCode lost in-memory state.
 */
export async function ensurePersistedModelApplied(openCodeUrl: string): Promise<void> {
  const m = readDisk();
  if (!m) return;
  if (appliedModel === m) return;
  try {
    await patchConfig(openCodeUrl, m);
    appliedModel = m;
    logger.info({ model: m }, "Restored persisted model to OpenCode");
  } catch (err) {
    logger.warn({ err, model: m }, "Could not apply persisted model — continuing with OpenCode defaults");
  }
}
