import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveDisplayModel } from "./display-model.js";

vi.mock("./config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./config.js")>();
  return {
    ...actual,
    getConfig: vi.fn(),
  };
});

import { getConfig } from "./config.js";

const mockGetConfig = vi.mocked(getConfig);

describe("resolveDisplayModel", () => {
  const baseUrl = "http://localhost:4096";

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("config-only: resolves from GET /config without fetching session messages", async () => {
    mockGetConfig.mockResolvedValue({ model: "anthropic/claude-sonnet-4" });
    const result = await resolveDisplayModel(baseUrl, "sess-1");
    expect(result).toEqual({ kind: "resolved", ref: "anthropic/claude-sonnet-4" });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("message-only: empty config, assistant message supplies ref", async () => {
    mockGetConfig.mockResolvedValue({});
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([
        { info: { role: "user" } },
        { info: { role: "assistant", modelID: "claude-sonnet-4", providerID: "anthropic" } },
      ]),
    } as never);

    const result = await resolveDisplayModel(baseUrl, "sess-1");
    expect(result).toEqual({ kind: "resolved", ref: "anthropic/claude-sonnet-4" });
    expect(mockGetConfig).toHaveBeenCalled();
  });

  it("config and message agree: config wins first", async () => {
    mockGetConfig.mockResolvedValue({ model: "anthropic/claude-sonnet-4" });
    const result = await resolveDisplayModel(baseUrl, "sess-1");
    expect(result).toEqual({ kind: "resolved", ref: "anthropic/claude-sonnet-4" });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("empty session messages + config set (main bug): resolves from config when no assistant model in messages", async () => {
    mockGetConfig.mockResolvedValue({ model: "anthropic/claude-opus-4" });
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([]),
    } as never);

    const result = await resolveDisplayModel(baseUrl, "sess-1");
    expect(result).toEqual({ kind: "resolved", ref: "anthropic/claude-opus-4" });
  });

  it("getConfig throws: still resolves from messages when session has assistant model", async () => {
    mockGetConfig.mockRejectedValue(new Error("GET /config failed"));
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([
        { info: { role: "assistant", modelID: "gpt-4o", providerID: "openai" } },
      ]),
    } as never);

    const result = await resolveDisplayModel(baseUrl, "sess-1");
    expect(result).toEqual({ kind: "resolved", ref: "openai/gpt-4o" });
  });

  it("returns unset when no session id and config empty", async () => {
    mockGetConfig.mockResolvedValue({});
    const result = await resolveDisplayModel(baseUrl, undefined);
    expect(result).toEqual({ kind: "unset" });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
