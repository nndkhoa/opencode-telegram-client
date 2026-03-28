import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeCmdSessionsHandler } from "./cmd-sessions.js";

function makeRegistry(sessions: Array<{ name: string; sessionId: string; active: boolean }>) {
  return {
    list: vi.fn().mockReturnValue(sessions),
  };
}

function makeCtx(chatId = 42) {
  return {
    chat: { id: chatId },
    reply: vi.fn().mockResolvedValue(undefined),
  };
}

describe("makeCmdSessionsHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists multiple sessions with active marker and no usage hint (D-06)", async () => {
    const registry = makeRegistry([
      { name: "default", sessionId: "s1", active: false },
      { name: "my-project", sessionId: "s2", active: true },
      { name: "work-spike", sessionId: "s3", active: false },
    ]);
    const handler = makeCmdSessionsHandler(registry as any);
    const ctx = makeCtx();

    await handler(ctx as any);

    expect(ctx.reply).toHaveBeenCalledWith(
      "Sessions:\n• default\n• my-project (active)\n• work-spike"
    );
  });

  it("shows usage hint when only default session exists (D-07)", async () => {
    const registry = makeRegistry([
      { name: "default", sessionId: "s1", active: true },
    ]);
    const handler = makeCmdSessionsHandler(registry as any);
    const ctx = makeCtx();

    await handler(ctx as any);

    expect(ctx.reply).toHaveBeenCalledWith(
      "Sessions:\n• default (active)\n\nUse /new <name> to create a named session."
    );
  });

  it("replies with no sessions message when list is empty", async () => {
    const registry = makeRegistry([]);
    const handler = makeCmdSessionsHandler(registry as any);
    const ctx = makeCtx();

    await handler(ctx as any);

    expect(ctx.reply).toHaveBeenCalledWith(
      "No sessions yet. Use /new <name> to create a named session."
    );
  });

  it("marks the correct session as active", async () => {
    const registry = makeRegistry([
      { name: "default", sessionId: "s1", active: false },
      { name: "feature-x", sessionId: "s2", active: true },
    ]);
    const handler = makeCmdSessionsHandler(registry as any);
    const ctx = makeCtx();

    await handler(ctx as any);

    const reply: string = ctx.reply.mock.calls[0][0];
    expect(reply).toContain("• default\n");
    expect(reply).toContain("• feature-x (active)");
  });
});
