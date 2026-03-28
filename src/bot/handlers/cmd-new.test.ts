import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeCmdNewHandler } from "./cmd-new.js";

vi.mock("../../opencode/session.js", () => ({
  createSession: vi.fn(),
}));

import { createSession } from "../../opencode/session.js";

const mockCreateSession = vi.mocked(createSession);

function makeRegistry(hasNamed = false) {
  return {
    hasNamed: vi.fn().mockReturnValue(hasNamed),
    createNamed: vi.fn(),
  };
}

function makeCtx(match: string | undefined, chatId = 42) {
  return {
    chat: { id: chatId },
    match,
    reply: vi.fn().mockResolvedValue(undefined),
  };
}

describe("makeCmdNewHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a named session when name is valid and unique", async () => {
    const registry = makeRegistry(false);
    mockCreateSession.mockResolvedValue("sess-123");
    const handler = makeCmdNewHandler(registry as any, "http://localhost:4096");
    const ctx = makeCtx("my-project");

    await handler(ctx as any);

    expect(registry.hasNamed).toHaveBeenCalledWith(42, "my-project");
    expect(mockCreateSession).toHaveBeenCalledWith("http://localhost:4096");
    expect(registry.createNamed).toHaveBeenCalledWith(42, "my-project", "sess-123");
    expect(ctx.reply).toHaveBeenCalledWith('✅ Created and switched to session "my-project".');
  });

  it("normalizes uppercase name to lowercase", async () => {
    const registry = makeRegistry(false);
    mockCreateSession.mockResolvedValue("sess-456");
    const handler = makeCmdNewHandler(registry as any, "http://localhost:4096");
    const ctx = makeCtx("My-Project");

    await handler(ctx as any);

    expect(registry.hasNamed).toHaveBeenCalledWith(42, "my-project");
    expect(registry.createNamed).toHaveBeenCalledWith(42, "my-project", "sess-456");
    expect(ctx.reply).toHaveBeenCalledWith('✅ Created and switched to session "my-project".');
  });

  it("auto-generates timestamp name when no argument provided", async () => {
    const registry = makeRegistry(false);
    mockCreateSession.mockResolvedValue("sess-789");
    const handler = makeCmdNewHandler(registry as any, "http://localhost:4096");
    const ctx = makeCtx("");

    await handler(ctx as any);

    expect(mockCreateSession).toHaveBeenCalled();
    expect(registry.createNamed).toHaveBeenCalled();
    const replyArg: string = ctx.reply.mock.calls[1][0];
    expect(replyArg).toMatch(/✅ Created and switched to session "session-\d+"\./);
  });

  it("replies with error when name already exists (D-04)", async () => {
    const registry = makeRegistry(true);
    const handler = makeCmdNewHandler(registry as any, "http://localhost:4096");
    const ctx = makeCtx("my-project");

    await handler(ctx as any);

    expect(mockCreateSession).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(
      '❌ Session "my-project" already exists. Use /switch my-project to switch to it.'
    );
  });

  it("replies with error when name is invalid (D-03)", async () => {
    const registry = makeRegistry(false);
    const handler = makeCmdNewHandler(registry as any, "http://localhost:4096");
    const ctx = makeCtx("invalid name!");

    await handler(ctx as any);

    expect(mockCreateSession).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(
      '❌ Invalid session name "invalid name!". Use only lowercase letters, digits, hyphens, underscores.'
    );
  });

  it("replies with unreachable error when createSession throws", async () => {
    const registry = makeRegistry(false);
    mockCreateSession.mockRejectedValue(new Error("connect ECONNREFUSED"));
    const handler = makeCmdNewHandler(registry as any, "http://localhost:4096");
    const ctx = makeCtx("my-project");

    await handler(ctx as any);

    expect(ctx.reply).toHaveBeenCalledWith(
      "❌ OpenCode is unreachable. Make sure it's running at localhost:4096."
    );
  });
});
