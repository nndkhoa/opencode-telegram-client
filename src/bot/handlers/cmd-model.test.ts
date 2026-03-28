import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeCmdModelHandler } from "./cmd-model.js";

vi.mock("../../opencode/config.js", () => ({
  patchConfig: vi.fn(),
  getConfigProviders: vi.fn(),
  getConfig: vi.fn(),
}));

import { patchConfig, getConfigProviders, getConfig } from "../../opencode/config.js";

const mockPatchConfig = vi.mocked(patchConfig);
const mockGetConfigProviders = vi.mocked(getConfigProviders);
const mockGetConfig = vi.mocked(getConfig);

function makeCtx(match = "") {
  return {
    chat: { id: 42 },
    match,
    reply: vi.fn().mockResolvedValue(undefined),
  };
}

const sampleProviders = {
  anthropic: { id: "anthropic", name: "Anthropic", models: { "claude-sonnet-4": { id: "claude-sonnet-4", providerID: "anthropic", name: "Claude Sonnet 4", status: "active" }, "claude-opus-4": { id: "claude-opus-4", providerID: "anthropic", name: "Claude Opus 4", status: "active" } } },
  openai: { id: "openai", name: "OpenAI", models: { "gpt-4o": { id: "gpt-4o", providerID: "openai", name: "GPT-4o", status: "active" } } },
};

describe("makeCmdModelHandler — no-arg path", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("shows current model from getConfig on first line", async () => {
    mockGetConfig.mockResolvedValue({ model: "anthropic/claude-sonnet-4" });
    mockGetConfigProviders.mockResolvedValue(sampleProviders);
    const handler = makeCmdModelHandler({} as any, "http://localhost:4096");
    const ctx = makeCtx("");
    await handler(ctx as any);
    const text: string = ctx.reply.mock.calls[0][0];
    expect(text).toContain("Model: anthropic/claude-sonnet-4");
  });

  it("shows 'unknown' when config has no model set", async () => {
    mockGetConfig.mockResolvedValue({});
    mockGetConfigProviders.mockResolvedValue(sampleProviders);
    const handler = makeCmdModelHandler({} as any, "http://localhost:4096");
    const ctx = makeCtx("");
    await handler(ctx as any);
    const text: string = ctx.reply.mock.calls[0][0];
    expect(text).toContain("Model: unknown");
  });

  it("lists providers by name with their model IDs", async () => {
    mockGetConfig.mockResolvedValue({ model: "anthropic/claude-sonnet-4" });
    mockGetConfigProviders.mockResolvedValue(sampleProviders);
    const handler = makeCmdModelHandler({} as any, "http://localhost:4096");
    const ctx = makeCtx("");
    await handler(ctx as any);
    const text: string = ctx.reply.mock.calls[0][0];
    expect(text).toContain("Available models:");
    expect(text).toContain("Anthropic: claude-sonnet-4, claude-opus-4");
    expect(text).toContain("OpenAI: gpt-4o");
  });

  it("replies with error when getConfigProviders throws", async () => {
    mockGetConfig.mockResolvedValue({});
    mockGetConfigProviders.mockRejectedValue(new Error("ECONNREFUSED"));
    const handler = makeCmdModelHandler({} as any, "http://localhost:4096");
    const ctx = makeCtx("");
    await handler(ctx as any);
    expect(ctx.reply).toHaveBeenCalledWith("❌ Could not fetch available models. Is OpenCode running?");
  });
});

describe("makeCmdModelHandler — switch path", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("replies success on patchConfig resolve", async () => {
    mockPatchConfig.mockResolvedValue(undefined);
    const handler = makeCmdModelHandler({} as any, "http://localhost:4096");
    const ctx = makeCtx("anthropic/claude-sonnet-4");
    await handler(ctx as any);
    expect(ctx.reply).toHaveBeenCalledWith("✅ Model switched to anthropic/claude-sonnet-4 (global — affects all sessions).");
  });

  it("replies unknown model error on Error('unknown_model')", async () => {
    mockPatchConfig.mockRejectedValue(new Error("unknown_model"));
    const handler = makeCmdModelHandler({} as any, "http://localhost:4096");
    const ctx = makeCtx("bad/model");
    await handler(ctx as any);
    expect(ctx.reply).toHaveBeenCalledWith("❌ Unknown model \"bad/model\". Run /model to see available models.");
  });

  it("replies generic error on other thrown errors", async () => {
    mockPatchConfig.mockRejectedValue(new Error("PATCH /config failed: HTTP 500"));
    const handler = makeCmdModelHandler({} as any, "http://localhost:4096");
    const ctx = makeCtx("x/y");
    await handler(ctx as any);
    expect(ctx.reply).toHaveBeenCalledWith("❌ Could not switch model. Is OpenCode running?");
  });
});
