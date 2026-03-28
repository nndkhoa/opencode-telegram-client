import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeCmdSwitchHandler } from "./cmd-switch.js";

function makeRegistry(switchResult: boolean) {
  return {
    switchTo: vi.fn().mockReturnValue(switchResult),
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
    const handler = makeCmdSwitchHandler(registry as any);
    const ctx = makeCtx("my-project");

    await handler(ctx as any);

    expect(registry.switchTo).toHaveBeenCalledWith(42, "my-project");
    expect(ctx.reply).toHaveBeenCalledWith('✅ Switched to session "my-project".');
  });

  it("normalizes uppercase argument to lowercase before switching", async () => {
    const registry = makeRegistry(true);
    const handler = makeCmdSwitchHandler(registry as any);
    const ctx = makeCtx("My-Project");

    await handler(ctx as any);

    expect(registry.switchTo).toHaveBeenCalledWith(42, "my-project");
    expect(ctx.reply).toHaveBeenCalledWith('✅ Switched to session "my-project".');
  });

  it("replies with not found error when session does not exist", async () => {
    const registry = makeRegistry(false);
    const handler = makeCmdSwitchHandler(registry as any);
    const ctx = makeCtx("unknown");

    await handler(ctx as any);

    expect(ctx.reply).toHaveBeenCalledWith(
      '❌ Session "unknown" not found. Use /sessions to see available sessions.'
    );
  });

  it("replies with usage error when no argument provided", async () => {
    const registry = makeRegistry(false);
    const handler = makeCmdSwitchHandler(registry as any);
    const ctx = makeCtx("");

    await handler(ctx as any);

    expect(registry.switchTo).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith("❌ Usage: /switch <name>");
  });
});
