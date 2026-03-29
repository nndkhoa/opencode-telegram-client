import { describe, it, expect, vi, beforeEach } from "vitest";
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

vi.mock("../../opencode/replies.js", () => ({
  postQuestionReply: vi.fn().mockResolvedValue(undefined),
}));

import { sendPromptAsync } from "../../opencode/session.js";
import { ensurePersistedModelApplied } from "../../persist/last-model.js";
import { postQuestionReply } from "../../opencode/replies.js";
import { PendingInteractiveState } from "../../opencode/interactive-pending.js";
import { buildFreeTextQuestionAnswers, makeMessageHandler } from "./message.js";

function makeMockPending(): PendingInteractiveState {
  return {
    rememberSessionChat: vi.fn(),
    isAwaitingFreeTextAnswer: vi.fn().mockReturnValue(false),
    get: vi.fn(),
    clear: vi.fn(),
  } as unknown as PendingInteractiveState;
}

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
  let pending: PendingInteractiveState;
  const openCodeUrl = "http://localhost:4096";

  beforeEach(() => {
    registry = makeMockRegistry();
    pending = makeMockPending();
    manager = new StreamingStateManager(registry, openCodeUrl);
    vi.mocked(sendPromptAsync).mockResolvedValue(undefined);
  });

  describe("MSG-02: typing action", () => {
    it("sends typing chat action before doing anything else", async () => {
      const ctx = makeCtx();
      const handler = makeMessageHandler(registry, manager, openCodeUrl, pending);
      await handler(ctx as never);
      expect(ctx.replyWithChatAction).toHaveBeenCalledWith("typing");
    });
  });

  describe("D-08: concurrency guard", () => {
    it("rejects with ⏳ message if chatId is busy", async () => {
      manager.startTurn("ses_existing", 100, 1);

      const ctx = makeCtx();
      const handler = makeMessageHandler(registry, manager, openCodeUrl, pending);
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
      const handler = makeMessageHandler(registry, manager, openCodeUrl, pending);
      await handler(ctx as never);
      expect(registry.getOrCreateDefault).toHaveBeenCalledWith(100, openCodeUrl);
    });

    it("replies with error if getOrCreateDefault throws", async () => {
      vi.mocked(registry.getOrCreateDefault as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("ECONNREFUSED")
      );
      const ctx = makeCtx();
      const handler = makeMessageHandler(registry, manager, openCodeUrl, pending);
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
      const handler = makeMessageHandler(registry, manager, openCodeUrl, pending);
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
      const handler = makeMessageHandler(registry, manager, openCodeUrl, pending);
      await handler(ctx as never);
      expect(ctx.reply).toHaveBeenCalledWith("⏳ Thinking...");
    });

    it("calls sendPromptAsync with sessionId and user text", async () => {
      const ctx = makeCtx({ text: "What is 2+2?" });
      const handler = makeMessageHandler(registry, manager, openCodeUrl, pending);
      await handler(ctx as never);
      expect(sendPromptAsync).toHaveBeenCalledWith(
        openCodeUrl,
        "ses_new123",
        "What is 2+2?"
      );
    });

    it("applies persisted model before sendPromptAsync", async () => {
      const ctx = makeCtx();
      const handler = makeMessageHandler(registry, manager, openCodeUrl, pending);
      await handler(ctx as never);
      expect(ensurePersistedModelApplied).toHaveBeenCalledWith(openCodeUrl);
      expect(ensurePersistedModelApplied).toHaveBeenCalledBefore(sendPromptAsync as never);
    });
  });

  describe("MCP-02: awaiting free-text answer", () => {
    it("posts question reply and clears pending without starting a stream turn", async () => {
      const realPending = new PendingInteractiveState();
      realPending.setQuestionAsked(100, {
        requestID: "req-1",
        sessionID: "ses-a",
        questionInfos: [{ question: "q", header: "", options: [] }],
        awaitingFreeText: true,
      });
      const ctx = makeCtx({ text: "my answer" });
      const handler = makeMessageHandler(registry, manager, openCodeUrl, realPending);
      await handler(ctx as never);
      expect(postQuestionReply).toHaveBeenCalledWith(openCodeUrl, "req-1", {
        answers: [["my answer"]],
      });
      expect(realPending.get(100)).toBeUndefined();
      expect(ctx.reply).toHaveBeenCalledWith("✅ Answer sent.");
      expect(sendPromptAsync).not.toHaveBeenCalled();
      expect(ctx.replyWithChatAction).not.toHaveBeenCalled();
    });

    it("blocks with busy message when awaiting but chat is busy", async () => {
      const realPending = new PendingInteractiveState();
      realPending.setQuestionAsked(100, {
        requestID: "req-1",
        sessionID: "ses-a",
        questionInfos: [{ question: "q", header: "", options: [] }],
        awaitingFreeText: true,
      });
      manager.startTurn("ses_existing", 100, 1);
      const ctx = makeCtx({ text: "my answer" });
      const handler = makeMessageHandler(registry, manager, openCodeUrl, realPending);
      await handler(ctx as never);
      expect(postQuestionReply).not.toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith(
        "⏳ Still working on your last message. Please wait."
      );
    });
  });
});

describe("buildFreeTextQuestionAnswers", () => {
  it("wraps a single answer when one or zero question infos", () => {
    expect(buildFreeTextQuestionAnswers("hello", undefined)).toEqual([["hello"]]);
    expect(
      buildFreeTextQuestionAnswers("hello", [{ question: "q", header: "", options: [] }])
    ).toEqual([["hello"]]);
  });

  it("splits multiple sub-questions on blank lines", () => {
    const infos = [
      { question: "a", header: "", options: [] },
      { question: "b", header: "", options: [] },
    ];
    expect(buildFreeTextQuestionAnswers("one\n\ntwo", infos)).toEqual([["one"], ["two"]]);
  });
});
