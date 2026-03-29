import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeCmdModelHandler, packTelegramHtmlSections } from "./cmd-model.js";
import type { ConfigProvidersPayload } from "../../opencode/config.js";
import { FILE02_D14_MODEL_REF } from "./fixtures/file02-d14-model-ref.js";

vi.mock("../../opencode/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../opencode/config.js")>();
  return {
    ...actual,
    patchConfig: vi.fn(),
    getConfigProviders: vi.fn(),
    getConfig: vi.fn(),
  };
});

vi.mock("../../persist/last-model.js", () => ({
  savePersistedModel: vi.fn(),
  getPersistedModelRef: vi.fn(() => undefined),
}));

import { patchConfig, getConfigProviders, getConfig } from "../../opencode/config.js";
import { savePersistedModel } from "../../persist/last-model.js";

const mockPatchConfig = vi.mocked(patchConfig);
const mockGetConfigProviders = vi.mocked(getConfigProviders);
const mockGetConfig = vi.mocked(getConfig);
const mockSavePersistedModel = vi.mocked(savePersistedModel);

function makeRegistry(sessionId: string | undefined = "sess-42") {
  return {
    getActiveSessionId: vi.fn().mockReturnValue(sessionId),
  };
}

function makeCtx(match = "") {
  return {
    chat: { id: 42 },
    match,
    reply: vi.fn().mockResolvedValue(undefined),
  };
}

function lastReplyHtml(ctx: { reply: ReturnType<typeof vi.fn> }): string {
  const call = ctx.reply.mock.calls[ctx.reply.mock.calls.length - 1];
  return call[0] as string;
}

const sampleProviders: ConfigProvidersPayload = {
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
        "claude-opus-4": {
          id: "claude-opus-4",
          providerID: "anthropic",
          name: "Claude Opus 4",
          status: "active",
        },
      },
    },
    {
      id: "openai",
      name: "OpenAI",
      models: {
        "gpt-4o": { id: "gpt-4o", providerID: "openai", name: "GPT-4o", status: "active" },
      },
    },
  ],
  default: { anthropic: "claude-sonnet-4" },
};

/** Matches buildFlatSelectableModelRefs(sampleProviders): opus, sonnet, gpt-4o */
const secondFlatRef = FILE02_D14_MODEL_REF;

describe("FILE-02 D-14: /model agrees with /status on model label", () => {
  it("no-arg /model HTML contains the same provider/model ref string as /status Model: line for the same fixture", async () => {
    mockGetConfig.mockResolvedValue({ model: FILE02_D14_MODEL_REF });
    mockGetConfigProviders.mockResolvedValue(sampleProviders);
    const handler = makeCmdModelHandler(makeRegistry() as any, "http://localhost:4096");
    const ctx = makeCtx("");
    await handler(ctx as any);
    const text = lastReplyHtml(ctx);
    expect(text).toContain(`<code>${FILE02_D14_MODEL_REF}</code>`);
    expect(text).toContain("(current)");
    // Same substring must appear on /status: `Model: ${FILE02_D14_MODEL_REF}` (see cmd-status.test.ts)
    expect(text).toContain(FILE02_D14_MODEL_REF);
  });
});

describe("makeCmdModelHandler — no-arg path", () => {
  it("shows current model from resolveDisplayModel on first line", async () => {
    mockGetConfig.mockResolvedValue({ model: "anthropic/claude-sonnet-4" });
    mockGetConfigProviders.mockResolvedValue(sampleProviders);
    const handler = makeCmdModelHandler(makeRegistry() as any, "http://localhost:4096");
    const ctx = makeCtx("");
    await handler(ctx as any);
    const text = lastReplyHtml(ctx);
    expect(text).toContain("<code>anthropic/claude-sonnet-4</code>");
    expect(text).toContain("(current)");
    expect(ctx.reply).toHaveBeenCalledWith(expect.any(String), { parse_mode: "HTML" });
  });

  it("reads model from agent.build when top-level model absent", async () => {
    mockGetConfig.mockResolvedValue({
      agent: { build: { model: "anthropic/claude-opus-4" } },
    } as never);
    mockGetConfigProviders.mockResolvedValue(sampleProviders);
    const handler = makeCmdModelHandler(makeRegistry() as any, "http://localhost:4096");
    const ctx = makeCtx("");
    await handler(ctx as any);
    const text = lastReplyHtml(ctx);
    expect(text).toContain("<code>anthropic/claude-opus-4</code>");
    expect(text).toContain("(current)");
  });

  it("falls back to single catalog default when config has no model (unset)", async () => {
    mockGetConfig.mockResolvedValue({});
    mockGetConfigProviders.mockResolvedValue(sampleProviders);
    // Safety: if getConfig mock is not applied to display-model's import, real fetch would hang.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      }),
    );
    try {
      // No active session — avoids real fetch to /session/.../message in resolveDisplayModel
      const handler = makeCmdModelHandler(makeRegistry(undefined) as any, "http://localhost:4096");
      const ctx = makeCtx("");
      await handler(ctx as any);
      const text = lastReplyHtml(ctx);
      expect(text).toContain("<code>anthropic/claude-sonnet-4</code>");
      expect(text).toContain("(provider catalog default)");
      expect(text).not.toContain("unknown");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("groups providers with numbered lines aligned to flat catalog order", async () => {
    mockGetConfig.mockResolvedValue({ model: "anthropic/claude-sonnet-4" });
    mockGetConfigProviders.mockResolvedValue(sampleProviders);
    const handler = makeCmdModelHandler(makeRegistry() as any, "http://localhost:4096");
    const ctx = makeCtx("");
    await handler(ctx as any);
    const text = lastReplyHtml(ctx);
    expect(text).toContain("<b>Available models</b>");
    expect(text).toContain("<b>Anthropic</b>");
    expect(text).toMatch(/1\.\s*<code>anthropic\/claude-opus-4<\/code>/);
    expect(text).toMatch(/2\.\s*<code>anthropic\/claude-sonnet-4<\/code>/);
    expect(text).toContain("<b>OpenAI</b>");
    expect(text).toMatch(/3\.\s*<code>openai\/gpt-4o<\/code>/);
  });

  it("replies with error when getConfigProviders throws", async () => {
    mockGetConfig.mockResolvedValue({});
    mockGetConfigProviders.mockRejectedValue(new Error("ECONNREFUSED"));
    const handler = makeCmdModelHandler(makeRegistry() as any, "http://localhost:4096");
    const ctx = makeCtx("");
    await handler(ctx as any);
    expect(ctx.reply).toHaveBeenCalledWith("❌ Could not fetch available models. Is OpenCode running?");
  });

  it("sends multiple HTML messages when catalog exceeds Telegram length limit", async () => {
    const models: Record<string, { id: string; providerID: string; name: string; status: string }> = {};
    for (let j = 0; j < 500; j++) {
      const id = `model-${j}`;
      models[id] = {
        id,
        providerID: "big",
        name: `Display name ${j} xxxxxxxxxxxxxxxx`,
        status: "active",
      };
    }
    const huge: ConfigProvidersPayload = {
      providers: [{ id: "big", name: "BigProvider", models }],
      default: {},
    };
    mockGetConfig.mockResolvedValue({ model: "big/model-0" });
    mockGetConfigProviders.mockResolvedValue(huge);
    const handler = makeCmdModelHandler(makeRegistry() as any, "http://localhost:4096");
    const ctx = makeCtx("");
    await handler(ctx as any);
    expect(ctx.reply.mock.calls.length).toBeGreaterThan(1);
    for (const call of ctx.reply.mock.calls) {
      expect((call[0] as string).length).toBeLessThanOrEqual(4096);
      expect(call[1]).toEqual({ parse_mode: "HTML" });
    }
  });
});

describe("packTelegramHtmlSections", () => {
  it("joins sections that fit into one message", () => {
    expect(packTelegramHtmlSections(["<b>a</b>", "b"], 100)).toEqual(["<b>a</b>\n\nb"]);
  });

  it("splits when combined length exceeds max", () => {
    const out = packTelegramHtmlSections(["x".repeat(25), "y".repeat(25)], 40);
    expect(out.length).toBeGreaterThan(1);
    expect(out.every((m) => m.length <= 40)).toBe(true);
  });
});

describe("makeCmdModelHandler — switch path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("replies success on patchConfig resolve", async () => {
    mockPatchConfig.mockResolvedValue(undefined);
    const handler = makeCmdModelHandler(makeRegistry() as any, "http://localhost:4096");
    const ctx = makeCtx("anthropic/claude-sonnet-4");
    await handler(ctx as any);
    expect(ctx.reply).toHaveBeenCalledWith("✅ Model switched to anthropic/claude-sonnet-4 (global — affects all sessions).");
    expect(mockSavePersistedModel).toHaveBeenCalledWith("anthropic/claude-sonnet-4");
  });

  it("replies unknown model error on Error('unknown_model')", async () => {
    mockPatchConfig.mockRejectedValue(new Error("unknown_model"));
    const handler = makeCmdModelHandler(makeRegistry() as any, "http://localhost:4096");
    const ctx = makeCtx("bad/model");
    await handler(ctx as any);
    expect(ctx.reply).toHaveBeenCalledWith("❌ Unknown model \"bad/model\". Run /model to see available models.");
    expect(mockSavePersistedModel).not.toHaveBeenCalled();
  });

  it("replies generic error on other thrown errors", async () => {
    mockPatchConfig.mockRejectedValue(new Error("PATCH /config failed: HTTP 500"));
    const handler = makeCmdModelHandler(makeRegistry() as any, "http://localhost:4096");
    const ctx = makeCtx("x/y");
    await handler(ctx as any);
    expect(ctx.reply).toHaveBeenCalledWith("❌ Could not switch model. Is OpenCode running?");
    expect(mockSavePersistedModel).not.toHaveBeenCalled();
  });

  it("numeric arg selects nth flat ref and shows success with full ref", async () => {
    mockGetConfigProviders.mockResolvedValue(sampleProviders);
    mockPatchConfig.mockResolvedValue(undefined);
    const handler = makeCmdModelHandler(makeRegistry() as any, "http://localhost:4096");
    const ctx = makeCtx("2");
    await handler(ctx as any);
    expect(mockPatchConfig).toHaveBeenCalledWith("http://localhost:4096", secondFlatRef);
    expect(mockSavePersistedModel).toHaveBeenCalledWith(secondFlatRef);
    expect(ctx.reply).toHaveBeenCalledWith(
      `✅ Model switched to ${secondFlatRef} (global — affects all sessions).`
    );
  });

  it("out-of-range numeric arg does not patch with a wrong ref", async () => {
    mockGetConfigProviders.mockResolvedValue(sampleProviders);
    const handler = makeCmdModelHandler(makeRegistry() as any, "http://localhost:4096");
    const ctx = makeCtx("99");
    await handler(ctx as any);
    expect(mockPatchConfig).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(
      "❌ No model at index 99. Run /model to see the numbered list (3 models)."
    );
  });
});
