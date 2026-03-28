import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

vi.mock("../opencode/config.js", () => ({
  patchConfig: vi.fn(),
}));

vi.mock("../logger.js", () => ({
  logger: { warn: vi.fn(), info: vi.fn() },
}));

import { patchConfig } from "../opencode/config.js";

describe("last-model", () => {
  let dir: string;
  let statePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "lm-"));
    statePath = join(dir, "state.json");
    process.env.TELEGRAM_LAST_MODEL_FILE = statePath;
    vi.resetModules();
    vi.mocked(patchConfig).mockReset();
    vi.mocked(patchConfig).mockResolvedValue(undefined);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.TELEGRAM_LAST_MODEL_FILE;
  });

  it("savePersistedModel writes JSON", async () => {
    const { savePersistedModel } = await import("./last-model.js");
    savePersistedModel("anthropic/x");
    expect(existsSync(statePath)).toBe(true);
    expect(JSON.parse(readFileSync(statePath, "utf8"))).toEqual({ model: "anthropic/x" });
  });

  it("ensurePersistedModelApplied PATCHes once per persisted value", async () => {
    writeFileSync(statePath, JSON.stringify({ model: "p/q" }));
    const { ensurePersistedModelApplied } = await import("./last-model.js");
    await ensurePersistedModelApplied("http://localhost:4096");
    await ensurePersistedModelApplied("http://localhost:4096");
    expect(patchConfig).toHaveBeenCalledTimes(1);
    expect(patchConfig).toHaveBeenCalledWith("http://localhost:4096", "p/q");
  });

  it("ensurePersistedModelApplied does nothing when file missing", async () => {
    const { ensurePersistedModelApplied } = await import("./last-model.js");
    await ensurePersistedModelApplied("http://localhost:4096");
    expect(patchConfig).not.toHaveBeenCalled();
  });
});
