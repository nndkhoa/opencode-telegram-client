import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeCmdHelpHandler } from "./cmd-help.js";

function makeCtx() {
  return {
    reply: vi.fn().mockResolvedValue(undefined),
  };
}

describe("makeCmdHelpHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("replies with help text containing all 6 commands", async () => {
    const handler = makeCmdHelpHandler();
    const ctx = makeCtx();

    await handler(ctx as any);

    expect(ctx.reply).toHaveBeenCalledOnce();
    const text: string = ctx.reply.mock.calls[0][0];
    expect(text).toContain("/new");
    expect(text).toContain("/switch");
    expect(text).toContain("/sessions");
    expect(text).toContain("/status");
    expect(text).toContain("/cancel");
    expect(text).toContain("/help");
  });

  it("includes descriptions for each command", async () => {
    const handler = makeCmdHelpHandler();
    const ctx = makeCtx();

    await handler(ctx as any);

    const text: string = ctx.reply.mock.calls[0][0];
    expect(text).toContain("Available commands:");
    expect(text).toContain("named session");
  });
});
