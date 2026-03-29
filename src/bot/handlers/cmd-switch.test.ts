import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeCmdSwitchHandler } from "./cmd-switch.js";

function makePending() {
  return {
    clear: vi.fn(),
    rememberSessionChat: vi.fn(),
  };
}

function makeRegistry(switchResult: boolean, activeSessionId = "sess-after-switch") {
  return {
    switchTo: vi.fn().mockReturnValue(switchResult),
    getActiveSessionId: vi.fn().mockReturnValue(activeSessionId),
  };
}

function makeCtx(match: string | undefined, chatId = 42) {
  return {
    chat: { id: chatId },
    match,
    reply: vi.fn().mockResolvedValue(undefined),
  };
}

describe("makeCmdSwitchHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("switches to session when it exists", async () => {
    const registry = makeRegistry(true);
    const pending = makePending();
    const handler = makeCmdSwitchHandler(registry as any, pending as any);
    const ctx = makeCtx("my-project");

    await handler(ctx as any);

    expect(registry.switchTo).toHaveBeenCalledWith(42, "my-project");
    expect(pending.clear).toHaveBeenCalledWith(42);
    expect(pending.rememberSessionChat).toHaveBeenCalledWith("sess-after-switch", 42);
    expect(ctx.reply).toHaveBeenCalledWith('✅ Switched to session "my-project".');
  });

  it("normalizes uppercase argument to lowercase before switching", async () => {
    const registry = makeRegistry(true);
    const pending = makePending();
    const handler = makeCmdSwitchHandler(registry as any, pending as any);
    const ctx = makeCtx("My-Project");

    await handler(ctx as any);

    expect(registry.switchTo).toHaveBeenCalledWith(42, "my-project");
    expect(pending.clear).toHaveBeenCalledWith(42);
    expect(ctx.reply).toHaveBeenCalledWith('✅ Switched to session "my-project".');
  });

  it("replies with not found error when session does not exist", async () => {
    const registry = makeRegistry(false);
    const pending = makePending();
    const handler = makeCmdSwitchHandler(registry as any, pending as any);
    const ctx = makeCtx("unknown");

    await handler(ctx as any);

    expect(pending.clear).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(
      '❌ Session "unknown" not found. Use /sessions to see available sessions.'
    );
  });

  it("replies with usage error when no argument provided", async () => {
    const registry = makeRegistry(false);
    const pending = makePending();
    const handler = makeCmdSwitchHandler(registry as any, pending as any);
    const ctx = makeCtx("");

    await handler(ctx as any);

    expect(registry.switchTo).not.toHaveBeenCalled();
    expect(pending.clear).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith("❌ Usage: /switch <name>");
  });

  it("clears pending when switching with an existing prompt (MCP-06)", async () => {
    const registry = makeRegistry(true);
    const pending = makePending();
    const handler = makeCmdSwitchHandler(registry as any, pending as any);
    const ctx = makeCtx("foo");

    await handler(ctx as any);

    expect(pending.clear).toHaveBeenCalledTimes(1);
    expect(pending.clear).toHaveBeenCalledWith(42);
  });
});
