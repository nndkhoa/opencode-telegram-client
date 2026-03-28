import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeCmdCancelHandler } from "./cmd-cancel.js";

vi.mock("../../opencode/session.js", () => ({
  abortSession: vi.fn(),
}));

import { abortSession } from "../../opencode/session.js";

const mockAbortSession = vi.mocked(abortSession);

function makeRegistry(sessionId: string = "sess-123") {
  return {
    getActiveSessionId: vi.fn().mockReturnValue(sessionId),
  };
}

function makeManager(busy = false, turn?: { chatId: number; messageId: number; buffer: string; lastEditAt: number }) {
  return {
    isBusy: vi.fn().mockReturnValue(busy),
    getTurn: vi.fn().mockReturnValue(turn),
    endTurn: vi.fn(),
  };
}

function makeCtx(chatId = 42) {
  return {
    chat: { id: chatId },
    reply: vi.fn().mockResolvedValue(undefined),
    api: {
      editMessageText: vi.fn().mockResolvedValue(undefined),
    },
  };
}

describe("makeCmdCancelHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("replies with nothing-in-progress when not busy (D-11)", async () => {
    const registry = makeRegistry();
    const manager = makeManager(false);
    const handler = makeCmdCancelHandler(registry as any, manager as any, "http://localhost:4096");
    const ctx = makeCtx();

    await handler(ctx as any);

    expect(ctx.reply).toHaveBeenCalledWith("ℹ️ Nothing in progress to cancel.");
    expect(mockAbortSession).not.toHaveBeenCalled();
  });

  it("replies with nothing-in-progress when busy but no sessionId", async () => {
    // Note: explicitly passing undefined triggers JS default param ("sess-123"); use null instead
    const registry = {
      getActiveSessionId: vi.fn().mockReturnValue(null),
    };
    const manager = makeManager(true);
    const handler = makeCmdCancelHandler(registry as any, manager as any, "http://localhost:4096");
    const ctx = makeCtx();

    await handler(ctx as any);

    expect(ctx.reply).toHaveBeenCalledWith("ℹ️ Nothing in progress to cancel.");
    expect(mockAbortSession).not.toHaveBeenCalled();
  });

  it("executes full cancel flow when active turn exists (D-12)", async () => {
    const turnData = { chatId: 42, messageId: 100, buffer: "hello", lastEditAt: Date.now() };
    const registry = makeRegistry("sess-123");
    const manager = makeManager(true, turnData);
    mockAbortSession.mockResolvedValue(undefined);
    const handler = makeCmdCancelHandler(registry as any, manager as any, "http://localhost:4096");
    const ctx = makeCtx(42);

    await handler(ctx as any);

    expect(mockAbortSession).toHaveBeenCalledWith("http://localhost:4096", "sess-123");
    expect(manager.endTurn).toHaveBeenCalledWith("sess-123");
    expect(ctx.api.editMessageText).toHaveBeenCalledWith(42, 100, "🚫 Cancelled.");
    expect(ctx.reply).toHaveBeenCalledWith("✅ Cancelled.");
  });

  it("captures turn BEFORE calling endTurn (race prevention - D-12)", async () => {
    const callOrder: string[] = [];
    const turnData = { chatId: 42, messageId: 100, buffer: "hello", lastEditAt: Date.now() };
    const registry = makeRegistry("sess-123");
    const manager = {
      isBusy: vi.fn().mockReturnValue(true),
      getTurn: vi.fn().mockImplementation(() => { callOrder.push("getTurn"); return turnData; }),
      endTurn: vi.fn().mockImplementation(() => { callOrder.push("endTurn"); }),
    };
    mockAbortSession.mockResolvedValue(undefined);
    const handler = makeCmdCancelHandler(registry as any, manager as any, "http://localhost:4096");
    const ctx = makeCtx(42);

    await handler(ctx as any);

    expect(callOrder.indexOf("getTurn")).toBeLessThan(callOrder.indexOf("endTurn"));
  });

  it("swallows abortSession error and proceeds with cleanup (non-fatal)", async () => {
    const turnData = { chatId: 42, messageId: 100, buffer: "hello", lastEditAt: Date.now() };
    const registry = makeRegistry("sess-123");
    const manager = makeManager(true, turnData);
    mockAbortSession.mockRejectedValue(new Error("abort failed"));
    const handler = makeCmdCancelHandler(registry as any, manager as any, "http://localhost:4096");
    const ctx = makeCtx(42);

    await handler(ctx as any);

    // Despite abort failure, cleanup continues
    expect(manager.endTurn).toHaveBeenCalledWith("sess-123");
    expect(ctx.api.editMessageText).toHaveBeenCalledWith(42, 100, "🚫 Cancelled.");
    expect(ctx.reply).toHaveBeenCalledWith("✅ Cancelled.");
  });

  it("does not crash when no turn data exists (no streaming message to edit)", async () => {
    const registry = makeRegistry("sess-123");
    const manager = makeManager(true, undefined);
    mockAbortSession.mockResolvedValue(undefined);
    const handler = makeCmdCancelHandler(registry as any, manager as any, "http://localhost:4096");
    const ctx = makeCtx(42);

    await handler(ctx as any);

    expect(manager.endTurn).toHaveBeenCalledWith("sess-123");
    expect(ctx.api.editMessageText).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith("✅ Cancelled.");
  });
});
