import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkHealth } from "./health.js";

describe("checkHealth", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ healthy: true, version: "1.0" }),
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("resolves with JSON body when fetch returns 200 and healthy payload", async () => {
    const result = await checkHealth("http://localhost:4096");
    expect(result).toEqual({ healthy: true, version: "1.0" });
  });

  it("throws an error containing 503 when fetch returns HTTP 503", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({}),
      })
    );
    await expect(checkHealth("http://localhost:4096")).rejects.toThrow(/503/);
  });
});
