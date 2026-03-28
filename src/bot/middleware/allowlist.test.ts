import { describe, it, expect, vi } from "vitest";
import { dmOnlyMiddleware } from "./dm-only.js";
import { allowlistMiddleware } from "./allowlist.js";

function makeCtx(overrides: Record<string, unknown> = {}): any {
  return {
    chat: { type: "private" },
    from: { id: 12345 },
    callbackQuery: undefined,
    reply: vi.fn().mockResolvedValue(undefined),
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("dmOnlyMiddleware", () => {
  it("calls next() for private chats", async () => {
    const next = vi.fn().mockResolvedValue(undefined);
    await dmOnlyMiddleware(makeCtx({ chat: { type: "private" } }), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("does NOT call next() for group chats", async () => {
    const next = vi.fn();
    await dmOnlyMiddleware(makeCtx({ chat: { type: "group" } }), next);
    expect(next).not.toHaveBeenCalled();
  });

  it("does NOT call next() for channel updates", async () => {
    const next = vi.fn();
    await dmOnlyMiddleware(makeCtx({ chat: { type: "channel" } }), next);
    expect(next).not.toHaveBeenCalled();
  });
});

describe("allowlistMiddleware", () => {
  const allowed = new Set([100, 200]);
  const mw = allowlistMiddleware(allowed);

  it("calls next() for allowlisted user", async () => {
    const next = vi.fn().mockResolvedValue(undefined);
    const ctx = makeCtx({ from: { id: 100 } });
    await mw(ctx, next);
    expect(next).toHaveBeenCalledOnce();
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it("replies with rejection message and does NOT call next() for unlisted user", async () => {
    const next = vi.fn();
    const ctx = makeCtx({ from: { id: 999 } });
    await mw(ctx, next);
    expect(next).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith("You don't have access to this bot");
  });

  it("blocks when ctx.from is undefined", async () => {
    const next = vi.fn();
    const ctx = makeCtx({ from: undefined });
    await mw(ctx, next);
    expect(next).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith("You don't have access to this bot");
  });

  it("answers callback query and blocks for unlisted user (clears spinner)", async () => {
    const next = vi.fn();
    const ctx = makeCtx({
      from: { id: 999 },
      callbackQuery: { data: "some_action", message: { chat: { type: "private" } } },
    });
    await mw(ctx, next);
    expect(next).not.toHaveBeenCalled();
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(
      expect.objectContaining({ text: "You don't have access to this bot" })
    );
  });
});
