import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeCmdStatusHandler } from "./cmd-status.js";

vi.mock("../../opencode/health.js", () => ({
  checkHealth: vi.fn(),
}));

import { checkHealth } from "../../opencode/health.js";

const mockCheckHealth = vi.mocked(checkHealth);

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

describe("makeCmdStatusHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: fetch returns empty messages array
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([]),
    } as any);
  });

  it("replies with healthy status and idle state when OpenCode is reachable (D-08, D-09)", async () => {
    mockCheckHealth.mockResolvedValue({ healthy: true, version: "1.3.3" });
    const registry = makeRegistry("my-project", "sess-123");
    const manager = makeManager(false);
    const handler = makeCmdStatusHandler(registry as any, manager as any, "http://localhost:4096");
    const ctx = makeCtx();

    await handler(ctx as any);

    expect(ctx.reply).toHaveBeenCalledWith(
      "Session: my-project | OpenCode: ✅ healthy | Model: unknown | State: idle"
    );
  });

  it("shows active state when manager.isBusy returns true", async () => {
    mockCheckHealth.mockResolvedValue({ healthy: true, version: "1.3.3" });
    const registry = makeRegistry("my-project", "sess-123");
    const manager = makeManager(true);
    const handler = makeCmdStatusHandler(registry as any, manager as any, "http://localhost:4096");
    const ctx = makeCtx();

    await handler(ctx as any);

    const reply: string = ctx.reply.mock.calls[0][0];
    expect(reply).toContain("State: active");
  });

  it("shows model from assistant message when available", async () => {
    mockCheckHealth.mockResolvedValue({ healthy: true, version: "1.3.3" });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([
        { info: { role: "user" } },
        { info: { role: "assistant", modelID: "claude-sonnet-4", providerID: "anthropic" } },
      ]),
    } as any);
    const registry = makeRegistry("my-project", "sess-123");
    const manager = makeManager(false);
    const handler = makeCmdStatusHandler(registry as any, manager as any, "http://localhost:4096");
    const ctx = makeCtx();

    await handler(ctx as any);

    const reply: string = ctx.reply.mock.calls[0][0];
    expect(reply).toContain("Model: anthropic/claude-sonnet-4");
  });

  it("shows degraded output when checkHealth throws (D-10)", async () => {
    mockCheckHealth.mockRejectedValue(new Error("ECONNREFUSED"));
    const registry = makeRegistry("my-project", "sess-123");
    const manager = makeManager(false);
    const handler = makeCmdStatusHandler(registry as any, manager as any, "http://localhost:4096");
    const ctx = makeCtx();

    await handler(ctx as any);

    expect(ctx.reply).toHaveBeenCalledWith(
      "Session: my-project | OpenCode: ❌ unreachable | Model: unknown | State: unknown"
    );
  });

  it("shows default session name when no sessions exist", async () => {
    mockCheckHealth.mockResolvedValue({ healthy: true, version: "1.3.3" });
    const registry = makeRegistry("default", null);
    const manager = makeManager(false);
    const handler = makeCmdStatusHandler(registry as any, manager as any, "http://localhost:4096");
    const ctx = makeCtx();

    await handler(ctx as any);

    const reply: string = ctx.reply.mock.calls[0][0];
    expect(reply).toContain("Session: default");
    expect(reply).toContain("Model: unknown");
  });

  it("shows unknown model when no sessionId exists", async () => {
    mockCheckHealth.mockResolvedValue({ healthy: true, version: "1.3.3" });
    const registry = makeRegistry("default", null);
    const manager = makeManager(false);
    const handler = makeCmdStatusHandler(registry as any, manager as any, "http://localhost:4096");
    const ctx = makeCtx();

    await handler(ctx as any);

    const reply: string = ctx.reply.mock.calls[0][0];
    expect(reply).toContain("Model: unknown");
  });
});
