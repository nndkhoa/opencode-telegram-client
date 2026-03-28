import { describe, it, expect, vi, beforeEach } from "vitest";
import { patchConfig, getConfigProviders, getConfig } from "./config.js";

describe("patchConfig", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("resolves void on 200 OK", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: vi.fn().mockResolvedValue({}) }) as any;
    await expect(patchConfig("http://localhost:4096", "anthropic/claude-sonnet-4")).resolves.toBeUndefined();
    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:4096/config",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ model: "anthropic/claude-sonnet-4" }) })
    );
  });

  it("throws Error('unknown_model') on 400", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 400 }) as any;
    await expect(patchConfig("http://localhost:4096", "bad/model")).rejects.toThrow("unknown_model");
  });

  it("throws with status on other non-ok", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as any;
    await expect(patchConfig("http://localhost:4096", "x/y")).rejects.toThrow("PATCH /config failed: HTTP 500");
  });
});

describe("getConfigProviders", () => {
  it("resolves provider map on ok response", async () => {
    const providers = {
      anthropic: { id: "anthropic", name: "Anthropic", models: { "claude-sonnet-4": { id: "claude-sonnet-4", providerID: "anthropic", name: "Claude Sonnet 4", status: "active" } } },
    };
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(providers) }) as any;
    const result = await getConfigProviders("http://localhost:4096");
    expect(result).toEqual(providers);
  });

  it("throws on non-ok response", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 }) as any;
    await expect(getConfigProviders("http://localhost:4096")).rejects.toThrow("GET /config/providers failed: HTTP 503");
  });
});

describe("getConfig", () => {
  it("resolves config with model", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({ model: "anthropic/claude-sonnet-4" }) }) as any;
    const result = await getConfig("http://localhost:4096");
    expect(result.model).toBe("anthropic/claude-sonnet-4");
  });

  it("resolves config with undefined model when not set", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({}) }) as any;
    const result = await getConfig("http://localhost:4096");
    expect(result.model).toBeUndefined();
  });

  it("throws on non-ok response", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as any;
    await expect(getConfig("http://localhost:4096")).rejects.toThrow("GET /config failed: HTTP 500");
  });
});
