import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeCallbackInteractiveHandler } from "./callback-interactive.js";
import { PendingInteractiveState } from "../../opencode/interactive-pending.js";
import type { SessionRegistry } from "../../session/registry.js";
import { postPermissionReply, postQuestionReply } from "../../opencode/replies.js";

vi.mock("../../opencode/replies.js", () => ({
  postPermissionReply: vi.fn().mockResolvedValue(undefined),
  postQuestionReply: vi.fn().mockResolvedValue(undefined),
}));

function makeRegistry(activeSessionId: string | undefined): SessionRegistry {
  return {
    getActiveSessionId: vi.fn().mockReturnValue(activeSessionId),
  } as unknown as SessionRegistry;
}

function makeCtx(overrides: {
  chatId?: number;
  data?: string;
  answerCallbackQuery?: ReturnType<typeof vi.fn>;
} = {}) {
  const chatId = overrides.chatId ?? 100;
  const answerCallbackQuery = overrides.answerCallbackQuery ?? vi.fn().mockResolvedValue(true);
  return {
    chat: { id: chatId },
    callbackQuery: { data: overrides.data ?? "t1" },
    answerCallbackQuery,
    api: {
      editMessageText: vi.fn().mockResolvedValue({}),
      deleteMessage: vi.fn().mockResolvedValue(true),
    },
  };
}

describe("makeCallbackInteractiveHandler", () => {
  const openCodeUrl = "http://localhost:4096";
  let pending: PendingInteractiveState;
  let registry: SessionRegistry;

  beforeEach(() => {
    vi.mocked(postPermissionReply).mockClear();
    vi.mocked(postQuestionReply).mockClear();
    pending = new PendingInteractiveState();
    registry = makeRegistry("sess-1");
  });

  it("posts permission once and clears pending", async () => {
    pending.rememberSessionChat("sess-1", 100);
    const token = pending.registerCallbackToken(100, "permission", "p:once");
    pending.setPermissionAsked(100, {
      requestID: "perm-req",
      sessionID: "sess-1",
      telegramMessageId: 50,
    });

    const answerCallbackQuery = vi.fn().mockResolvedValue(true);
    const ctx = makeCtx({ data: token, answerCallbackQuery });
    const handler = makeCallbackInteractiveHandler(pending, openCodeUrl, registry);

    await handler(ctx as never);

    expect(postPermissionReply).toHaveBeenCalledWith(openCodeUrl, "perm-req", { reply: "once" });
    expect(ctx.api.deleteMessage).toHaveBeenCalledWith(100, 50);
    expect(pending.get(100)).toBeUndefined();
    expect(answerCallbackQuery).toHaveBeenCalledTimes(1);
  });

  it("posts question single-select answer on pick", async () => {
    pending.rememberSessionChat("sess-1", 100);
    pending.setQuestionAsked(100, {
      requestID: "q-req",
      sessionID: "sess-1",
      telegramMessageId: 51,
      questionInfos: [
        {
          question: "Pick",
          header: "",
          options: [{ label: "Alpha", description: "" }],
          multiple: false,
        },
      ],
    });
    const token = pending.registerCallbackToken(100, "question", "q:pick", "0:0");

    const answerCallbackQuery = vi.fn().mockResolvedValue(true);
    const ctx = makeCtx({ data: token, answerCallbackQuery });
    await makeCallbackInteractiveHandler(pending, openCodeUrl, registry)(ctx as never);

    expect(postQuestionReply).toHaveBeenCalledWith(openCodeUrl, "q-req", {
      answers: [["Alpha"]],
    });
    expect(ctx.api.deleteMessage).toHaveBeenCalledWith(100, 51);
    expect(pending.get(100)).toBeUndefined();
    expect(answerCallbackQuery).toHaveBeenCalledTimes(1);
  });

  it("does not POST when active session does not match pending", async () => {
    pending.rememberSessionChat("sess-1", 100);
    const token = pending.registerCallbackToken(100, "permission", "p:once");
    pending.setPermissionAsked(100, {
      requestID: "perm-req",
      sessionID: "sess-1",
      telegramMessageId: 50,
    });

    const reg = makeRegistry("other-sess");
    const answerCallbackQuery = vi.fn().mockResolvedValue(true);
    const ctx = makeCtx({ data: token, answerCallbackQuery });
    await makeCallbackInteractiveHandler(pending, openCodeUrl, reg)(ctx as never);

    expect(postPermissionReply).not.toHaveBeenCalled();
    expect(answerCallbackQuery).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining("session") })
    );
  });
});
