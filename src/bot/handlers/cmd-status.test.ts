import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeCmdStatusHandler } from "./cmd-status.js";
import { FILE02_D14_MODEL_REF } from "./fixtures/file02-d14-model-ref.js";

vi.mock("../../opencode/health.js", () => ({
  checkHealth: vi.fn(),
}));

vi.mock("../../opencode/display-model.js", () => ({
  resolveDisplayModel: vi.fn(),
}));

import { checkHealth } from "../../opencode/health.js";
import { resolveDisplayModel } from "../../opencode/display-model.js";

const mockCheckHealth = vi.mocked(checkHealth);
const mockResolveDisplayModel = vi.mocked(resolveDisplayModel);

function makeRegistry(sessionName = "default", sessionId: string | null = "sess-123") {
  return {
    getActiveName: vi.fn().mockReturnValue(sessionName),
    getActiveSessionId: vi.fn().mockReturnValue(sessionId ?? undefined),
  };
}

function makeManager(busy = false) {
  return {
    isBusy: vi.fn().mockReturnValue(busy),
  };
}

function makeCtx(chatId = 42) {
  return {
    chat: { id: chatId },
    reply: vi.fn().mockResolvedValue(undefined),
  };
}

describe("FILE-02 D-14: /status agrees with /model on model label", () => {
  it("status line contains Model: <ref> matching /model no-arg fixture (anthropic/claude-sonnet-4)", async () => {
    mockCheckHealth.mockResolvedValue({ healthy: true, version: "1.3.3" });
    mockResolveDisplayModel.mockResolvedValue({ kind: "resolved", ref: FILE02_D14_MODEL_REF });
    const registry = makeRegistry("my-project", "sess-123");
    const manager = makeManager(false);
    const handler = makeCmdStatusHandler(registry as any, manager as any, "http://localhost:4096");
    const ctx = makeCtx();
    await handler(ctx as any);
    const reply: string = ctx.reply.mock.calls[0][0];
    expect(reply).toContain(`Model: ${FILE02_D14_MODEL_REF}`);
    expect(reply).toContain("anthropic/claude");
  });
});

describe("makeCmdStatusHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([]),
    } as any);
  });

  it("replies with healthy status and resolved model when OpenCode is reachable (04.2)", async () => {
    mockCheckHealth.mockResolvedValue({ healthy: true, version: "1.3.3" });
    mockResolveDisplayModel.mockResolvedValue({ kind: "resolved", ref: FILE02_D14_MODEL_REF });
    const registry = makeRegistry("my-project", "sess-123");
    const manager = makeManager(false);
    const handler = makeCmdStatusHandler(registry as any, manager as any, "http://localhost:4096");
    const ctx = makeCtx();

    await handler(ctx as any);

    expect(ctx.reply).toHaveBeenCalledWith(
      `Session: my-project | OpenCode: ✅ healthy | Model: ${FILE02_D14_MODEL_REF} | State: idle`
    );
  });

  it("shows active state when manager.isBusy returns true", async () => {
    mockCheckHealth.mockResolvedValue({ healthy: true, version: "1.3.3" });
    mockResolveDisplayModel.mockResolvedValue({ kind: "resolved", ref: FILE02_D14_MODEL_REF });
    const registry = makeRegistry("my-project", "sess-123");
    const manager = makeManager(true);
    const handler = makeCmdStatusHandler(registry as any, manager as any, "http://localhost:4096");
    const ctx = makeCtx();

    await handler(ctx as any);

    const reply: string = ctx.reply.mock.calls[0][0];
    expect(reply).toContain("State: active");
  });

  it("shows model from resolver when assistant message would supply ref", async () => {
    mockCheckHealth.mockResolvedValue({ healthy: true, version: "1.3.3" });
    mockResolveDisplayModel.mockResolvedValue({ kind: "resolved", ref: FILE02_D14_MODEL_REF });
    const registry = makeRegistry("my-project", "sess-123");
    const manager = makeManager(false);
    const handler = makeCmdStatusHandler(registry as any, manager as any, "http://localhost:4096");
    const ctx = makeCtx();

    await handler(ctx as any);

    const reply: string = ctx.reply.mock.calls[0][0];
    expect(reply).toContain(`Model: ${FILE02_D14_MODEL_REF}`);
  });

  it("shows degraded output when checkHealth throws", async () => {
    mockCheckHealth.mockRejectedValue(new Error("ECONNREFUSED"));
    const registry = makeRegistry("my-project", "sess-123");
    const manager = makeManager(false);
    const handler = makeCmdStatusHandler(registry as any, manager as any, "http://localhost:4096");
    const ctx = makeCtx();

    await handler(ctx as any);

    expect(ctx.reply).toHaveBeenCalledWith(
      "Session: my-project | OpenCode: ❌ unreachable | Model: unknown | State: unknown"
    );
    expect(mockResolveDisplayModel).not.toHaveBeenCalled();
  });

  it("shows default session name when no sessions exist", async () => {
    mockCheckHealth.mockResolvedValue({ healthy: true, version: "1.3.3" });
    mockResolveDisplayModel.mockResolvedValue({ kind: "unset" });
    const registry = makeRegistry("default", null);
    const manager = makeManager(false);
    const handler = makeCmdStatusHandler(registry as any, manager as any, "http://localhost:4096");
    const ctx = makeCtx();

    await handler(ctx as any);

    const reply: string = ctx.reply.mock.calls[0][0];
    expect(reply).toContain("Session: default");
    expect(reply).toContain("not set — /model");
  });

  it("shows unset hint when no sessionId and model unresolved", async () => {
    mockCheckHealth.mockResolvedValue({ healthy: true, version: "1.3.3" });
    mockResolveDisplayModel.mockResolvedValue({ kind: "unset" });
    const registry = makeRegistry("default", null);
    const manager = makeManager(false);
    const handler = makeCmdStatusHandler(registry as any, manager as any, "http://localhost:4096");
    const ctx = makeCtx();

    await handler(ctx as any);

    const reply: string = ctx.reply.mock.calls[0][0];
    expect(reply).toContain("not set — /model");
  });
});
