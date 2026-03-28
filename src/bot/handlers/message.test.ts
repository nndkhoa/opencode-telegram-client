import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMessageHandler } from "./message.js";
import { StreamingStateManager } from "../../opencode/streaming-state.js";

// Mock session module
vi.mock("../../opencode/session.js", () => ({
  createSession: vi.fn(),
  sendPromptAsync: vi.fn(),
}));

import { createSession, sendPromptAsync } from "../../opencode/session.js";

function makeCtx(overrides: Partial<{
  chatId: number;
  fromId: number;
  text: string;
  messageId: number;
}> = {}) {
  const { chatId = 100, fromId = 1, text = "Hello", messageId = 42 } = overrides;
  return {
    chat: { id: chatId },
    from: { id: fromId },
    message: { text, message_id: messageId },
    reply: vi.fn().mockResolvedValue({ message_id: 99 }),
    replyWithChatAction: vi.fn().mockResolvedValue({}),
    api: {
      editMessageText: vi.fn().mockResolvedValue({}),
    },
  };
}

describe("makeMessageHandler", () => {
  let manager: StreamingStateManager;
  const openCodeUrl = "http://localhost:4096";

  beforeEach(() => {
    manager = new StreamingStateManager();
    vi.mocked(createSession).mockResolvedValue("ses_new123");
    vi.mocked(sendPromptAsync).mockResolvedValue(undefined);
  });

  describe("MSG-02: typing action", () => {
    it("sends typing chat action before doing anything else", async () => {
      const ctx = makeCtx();
      const handler = makeMessageHandler(manager, openCodeUrl);
      await handler(ctx as never);
      expect(ctx.replyWithChatAction).toHaveBeenCalledWith("typing");
    });
  });

  describe("D-08: concurrency guard", () => {
    it("rejects with ⏳ message if chatId is busy", async () => {
      manager.setSession(100, "ses_existing");
      manager.startTurn("ses_existing", 100, 1);

      const ctx = makeCtx();
      const handler = makeMessageHandler(manager, openCodeUrl);
      await handler(ctx as never);

      expect(ctx.reply).toHaveBeenCalledWith(
        "⏳ Still working on your last message. Please wait."
      );
      expect(ctx.replyWithChatAction).not.toHaveBeenCalled();
    });
  });

  describe("D-01: session auto-creation", () => {
    it("creates a new session if none exists for chatId", async () => {
      const ctx = makeCtx();
      const handler = makeMessageHandler(manager, openCodeUrl);
      await handler(ctx as never);
      expect(createSession).toHaveBeenCalledWith(openCodeUrl);
      expect(manager.getSession(100)).toBe("ses_new123");
    });

    it("reuses existing session for chatId", async () => {
      manager.setSession(100, "ses_existing");
      const ctx = makeCtx();
      const handler = makeMessageHandler(manager, openCodeUrl);
      await handler(ctx as never);
      expect(createSession).not.toHaveBeenCalled();
      expect(manager.getSession(100)).toBe("ses_existing");
    });
  });

  describe("MSG-07: error handling", () => {
    it("replies with error if createSession throws (D-06)", async () => {
      vi.mocked(createSession).mockRejectedValueOnce(new Error("ECONNREFUSED"));
      const ctx = makeCtx();
      const handler = makeMessageHandler(manager, openCodeUrl);
      await handler(ctx as never);
      expect(ctx.reply).toHaveBeenCalledWith(
        "❌ OpenCode is unreachable. Make sure it's running at localhost:4096."
      );
    });

    it("edits thinking message with error if sendPromptAsync throws (D-06)", async () => {
      vi.mocked(sendPromptAsync).mockRejectedValueOnce(new Error("HTTP 503"));
      const ctx = makeCtx();
      const handler = makeMessageHandler(manager, openCodeUrl);
      await handler(ctx as never);
      expect(ctx.api.editMessageText).toHaveBeenCalledWith(
        100,
        99,
        "❌ OpenCode is unreachable. Make sure it's running at localhost:4096."
      );
    });
  });

  describe("MSG-01: prompt flow", () => {
    it("sends initial ⏳ Thinking... message", async () => {
      const ctx = makeCtx();
      const handler = makeMessageHandler(manager, openCodeUrl);
      await handler(ctx as never);
      expect(ctx.reply).toHaveBeenCalledWith("⏳ Thinking...");
    });

    it("calls sendPromptAsync with sessionId and user text", async () => {
      const ctx = makeCtx({ text: "What is 2+2?" });
      const handler = makeMessageHandler(manager, openCodeUrl);
      await handler(ctx as never);
      expect(sendPromptAsync).toHaveBeenCalledWith(
        openCodeUrl,
        "ses_new123",
        "What is 2+2?"
      );
    });
  });
});
