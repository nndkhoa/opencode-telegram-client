import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  patchConfig,
  getConfigProviders,
  getConfig,
  extractConfiguredModel,
  defaultModelRefsFromPayload,
  parseModelRefToBodyModel,
} from "./config.js";

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
  it("resolves { providers, default } from OpenCode on ok response", async () => {
    const body = {
      providers: [
        {
          id: "anthropic",
          name: "Anthropic",
          models: {
            "claude-sonnet-4": {
              id: "claude-sonnet-4",
              providerID: "anthropic",
              name: "Claude Sonnet 4",
              status: "active",
            },
          },
        },
      ],
      default: { anthropic: "claude-sonnet-4" },
    };
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(body) }) as any;
    const result = await getConfigProviders("http://localhost:4096");
    expect(result.providers).toHaveLength(1);
    expect(result.providers[0].id).toBe("anthropic");
    expect(result.default).toEqual({ anthropic: "claude-sonnet-4" });
  });

  it("accepts legacy map of provider id -> provider on ok response", async () => {
    const legacy = {
      anthropic: {
        id: "anthropic",
        name: "Anthropic",
        models: {
          "claude-sonnet-4": {
            id: "claude-sonnet-4",
            providerID: "anthropic",
            name: "Claude Sonnet 4",
            status: "active",
          },
        },
      },
    };
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(legacy) }) as any;
    const result = await getConfigProviders("http://localhost:4096");
    expect(result.providers).toHaveLength(1);
    expect(result.providers[0].name).toBe("Anthropic");
    expect(result.default).toEqual({});
  });

  it("throws on non-ok response", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 }) as any;
    await expect(getConfigProviders("http://localhost:4096")).rejects.toThrow("GET /config/providers failed: HTTP 503");
  });
});

describe("parseModelRefToBodyModel", () => {
  it("splits provider/model on first slash", () => {
    expect(parseModelRefToBodyModel("github-copilot/gpt-5-mini")).toEqual({
      providerID: "github-copilot",
      modelID: "gpt-5-mini",
    });
  });

  it("returns undefined when no slash", () => {
    expect(parseModelRefToBodyModel("gpt-4o")).toBeUndefined();
  });
});

describe("extractConfiguredModel", () => {
  it("reads top-level model", () => {
    expect(extractConfiguredModel({ model: "openai/gpt-4o" })).toBe("openai/gpt-4o");
  });

  it("reads agent.build.model when top-level missing", () => {
    expect(
      extractConfiguredModel({
        agent: { build: { model: "anthropic/claude-sonnet-4" } },
      })
    ).toBe("anthropic/claude-sonnet-4");
  });

  it("returns undefined when absent", () => {
    expect(extractConfiguredModel({})).toBeUndefined();
    expect(extractConfiguredModel(null)).toBeUndefined();
  });
});

describe("defaultModelRefsFromPayload", () => {
  it("builds provider/model refs from default map", () => {
    const refs = defaultModelRefsFromPayload({
      providers: [],
      default: { anthropic: "claude-3", openai: "gpt-4o" },
    });
    expect(refs).toEqual(["anthropic/claude-3", "openai/gpt-4o"]);
  });

  it("passes through already-qualified ids", () => {
    expect(
      defaultModelRefsFromPayload({
        providers: [],
        default: { x: "vendor/full/model-name" },
      })
    ).toEqual(["vendor/full/model-name"]);
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
