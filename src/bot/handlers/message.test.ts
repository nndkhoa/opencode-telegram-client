import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMessageHandler } from "./message.js";
import { StreamingStateManager } from "../../opencode/streaming-state.js";
import type { SessionRegistry } from "../../session/registry.js";

// Mock session module
vi.mock("../../opencode/session.js", () => ({
  createSession: vi.fn(),
  sendPromptAsync: vi.fn(),
}));

vi.mock("../../persist/last-model.js", () => ({
  ensurePersistedModelApplied: vi.fn().mockResolvedValue(undefined),
}));

import { sendPromptAsync } from "../../opencode/session.js";
import { ensurePersistedModelApplied } from "../../persist/last-model.js";

function makeMockRegistry(sessionId = "ses_new123"): SessionRegistry {
  return {
    getActiveSessionId: vi.fn(),
    getActiveName: vi.fn(),
    getOrCreateDefault: vi.fn().mockResolvedValue(sessionId),
    createNamed: vi.fn(),
    switchTo: vi.fn(),
    hasNamed: vi.fn(),
    getNamedId: vi.fn(),
    list: vi.fn(),
  } as unknown as SessionRegistry;
}

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
  let registry: SessionRegistry;
  const openCodeUrl = "http://localhost:4096";

  beforeEach(() => {
    registry = makeMockRegistry();
    manager = new StreamingStateManager(registry);
    vi.mocked(sendPromptAsync).mockResolvedValue(undefined);
  });

  describe("MSG-02: typing action", () => {
    it("sends typing chat action before doing anything else", async () => {
      const ctx = makeCtx();
      const handler = makeMessageHandler(registry, manager, openCodeUrl);
      await handler(ctx as never);
      expect(ctx.replyWithChatAction).toHaveBeenCalledWith("typing");
    });
  });

  describe("D-08: concurrency guard", () => {
    it("rejects with ⏳ message if chatId is busy", async () => {
      manager.startTurn("ses_existing", 100, 1);

      const ctx = makeCtx();
      const handler = makeMessageHandler(registry, manager, openCodeUrl);
      await handler(ctx as never);

      expect(ctx.reply).toHaveBeenCalledWith(
        "⏳ Still working on your last message. Please wait."
      );
      expect(ctx.replyWithChatAction).not.toHaveBeenCalled();
    });
  });

  describe("D-01: session auto-creation via registry", () => {
    it("calls registry.getOrCreateDefault to get/create session", async () => {
      const ctx = makeCtx();
      const handler = makeMessageHandler(registry, manager, openCodeUrl);
      await handler(ctx as never);
      expect(registry.getOrCreateDefault).toHaveBeenCalledWith(100, openCodeUrl);
    });

    it("replies with error if getOrCreateDefault throws", async () => {
      vi.mocked(registry.getOrCreateDefault as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("ECONNREFUSED")
      );
      const ctx = makeCtx();
      const handler = makeMessageHandler(registry, manager, openCodeUrl);
      await handler(ctx as never);
      expect(ctx.reply).toHaveBeenCalledWith(
        "❌ OpenCode is unreachable. Make sure it's running at localhost:4096."
      );
    });
  });

  describe("MSG-07: error handling", () => {
    it("edits thinking message with error if sendPromptAsync throws (D-06)", async () => {
      vi.mocked(sendPromptAsync).mockRejectedValueOnce(new Error("HTTP 503"));
      const ctx = makeCtx();
      const handler = makeMessageHandler(registry, manager, openCodeUrl);
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
      const handler = makeMessageHandler(registry, manager, openCodeUrl);
      await handler(ctx as never);
      expect(ctx.reply).toHaveBeenCalledWith("⏳ Thinking...");
    });

    it("calls sendPromptAsync with sessionId and user text", async () => {
      const ctx = makeCtx({ text: "What is 2+2?" });
      const handler = makeMessageHandler(registry, manager, openCodeUrl);
      await handler(ctx as never);
      expect(sendPromptAsync).toHaveBeenCalledWith(
        openCodeUrl,
        "ses_new123",
        "What is 2+2?"
      );
    });

    it("applies persisted model before sendPromptAsync", async () => {
      const ctx = makeCtx();
      const handler = makeMessageHandler(registry, manager, openCodeUrl);
      await handler(ctx as never);
      expect(ensurePersistedModelApplied).toHaveBeenCalledWith(openCodeUrl);
      expect(ensurePersistedModelApplied).toHaveBeenCalledBefore(sendPromptAsync as never);
    });
  });
});
