import { describe, it, expect, vi, beforeEach } from "vitest";
import { StreamingStateManager } from "./streaming-state.js";
import type { Api } from "grammy";
import type { SessionRegistry } from "../session/registry.js";

vi.mock("./assistant-meta.js", () => ({
  formatAssistantFooterHtml: (m: string, a: string) => `<i>${m} · ${a}</i>`,
  resolveAssistantFooterLines: vi.fn().mockResolvedValue({ modelRef: "anthropic/x", agentLabel: "build" }),
}));

function makeMockBot(): Api {
  return {
    editMessageText: vi.fn().mockResolvedValue({}),
    sendMessage: vi.fn().mockResolvedValue({}),
  } as unknown as Api;
}

function makeMockRegistry(): SessionRegistry {
  return {
    getActiveSessionId: vi.fn(),
    getActiveName: vi.fn(),
    getOrCreateDefault: vi.fn(),
    createNamed: vi.fn(),
    switchTo: vi.fn(),
    hasNamed: vi.fn(),
    getNamedId: vi.fn(),
    list: vi.fn(),
  } as unknown as SessionRegistry;
}

describe("StreamingStateManager", () => {
  let manager: StreamingStateManager;
  let bot: Api;
  let registry: SessionRegistry;

  beforeEach(() => {
    registry = makeMockRegistry();
    manager = new StreamingStateManager(registry, "http://localhost:4096");
    bot = makeMockBot();
  });

  describe("getTurn", () => {
    it("returns TurnState for an active session", () => {
      manager.startTurn("ses_abc", 123, 456);
      const turn = manager.getTurn("ses_abc");
      expect(turn).toBeDefined();
      expect(turn?.chatId).toBe(123);
      expect(turn?.messageId).toBe(456);
    });

    it("returns undefined for a non-existent session", () => {
      expect(manager.getTurn("missing")).toBeUndefined();
    });
  });

  describe("busy state", () => {
    it("is not busy initially", () => {
      expect(manager.isBusy(123)).toBe(false);
    });

    it("is busy after startTurn", () => {
      manager.startTurn("ses_abc", 123, 456);
      expect(manager.isBusy(123)).toBe(true);
    });

    it("is not busy after endTurn", () => {
      manager.startTurn("ses_abc", 123, 456);
      manager.endTurn("ses_abc");
      expect(manager.isBusy(123)).toBe(false);
    });
  });

  describe("handleEvent — message.part.delta", () => {
    it("appends delta to buffer", async () => {
      manager.startTurn("ses_abc", 123, 456);

      await manager.handleEvent(
        { type: "message.part.delta", properties: { sessionID: "ses_abc", messageID: "m1", partID: "p1", field: "text", delta: "Hello " } },
        bot
      );
      await manager.handleEvent(
        { type: "message.part.delta", properties: { sessionID: "ses_abc", messageID: "m1", partID: "p2", field: "text", delta: "world" } },
        bot
      );

      // Force an edit by making lastEditAt old
      const turn = (manager as unknown as { turns: Map<string, { lastEditAt: number }> }).turns.get("ses_abc");
      if (turn) turn.lastEditAt = 0;

      await manager.handleEvent(
        { type: "message.part.delta", properties: { sessionID: "ses_abc", messageID: "m1", partID: "p3", field: "text", delta: "!" } },
        bot
      );

      expect(bot.editMessageText).toHaveBeenCalledWith(
        123,
        456,
        "⏳ …\n\n✍️ Answer\nHello world!"
      );
    });

    it("routes field text to reasoning when part was message.part.updated type reasoning (OpenCode processor)", async () => {
      manager.startTurn("ses_abc", 123, 456);

      await manager.handleEvent(
        {
          type: "message.part.updated",
          properties: {
            sessionID: "ses_abc",
            time: Date.now(),
            part: { id: "part_r", type: "reasoning" },
          },
        },
        bot
      );
      await manager.handleEvent(
        {
          type: "message.part.updated",
          properties: {
            sessionID: "ses_abc",
            time: Date.now(),
            part: { id: "part_a", type: "text" },
          },
        },
        bot
      );

      await manager.handleEvent(
        {
          type: "message.part.delta",
          properties: {
            sessionID: "ses_abc",
            messageID: "m1",
            partID: "part_r",
            field: "text",
            delta: "internal only",
          },
        },
        bot
      );
      await manager.handleEvent(
        {
          type: "message.part.delta",
          properties: {
            sessionID: "ses_abc",
            messageID: "m1",
            partID: "part_a",
            field: "text",
            delta: "visible",
          },
        },
        bot
      );

      const turn = (manager as unknown as { turns: Map<string, { lastEditAt: number }> }).turns.get("ses_abc");
      if (turn) turn.lastEditAt = 0;

      await manager.handleEvent(
        {
          type: "message.part.delta",
          properties: {
            sessionID: "ses_abc",
            messageID: "m1",
            partID: "part_a",
            field: "text",
            delta: " answer",
          },
        },
        bot
      );

      expect(bot.editMessageText).toHaveBeenCalledWith(
        123,
        456,
        "⏳ …\n\n💭 Reasoning\ninternal only\n\n✍️ Answer\nvisible answer"
      );
    });

    it("treats reasoning_content like thinking (OpenCode interleaved reasoning)", async () => {
      manager.startTurn("ses_abc", 123, 456);

      await manager.handleEvent(
        { type: "message.part.delta", properties: { sessionID: "ses_abc", messageID: "m1", partID: "p1", field: "reasoning_content", delta: "internal" } },
        bot
      );

      const turn = (manager as unknown as { turns: Map<string, { lastEditAt: number }> }).turns.get("ses_abc");
      if (turn) turn.lastEditAt = 0;

      await manager.handleEvent(
        { type: "message.part.delta", properties: { sessionID: "ses_abc", messageID: "m1", partID: "p2", field: "reasoning_content", delta: " notes" } },
        bot
      );

      expect(bot.editMessageText).toHaveBeenCalledWith(
        123,
        456,
        "⏳ …\n\n💭 Reasoning\ninternal notes\n\n✍️ Answer\n"
      );
    });

    it("appends thinking field to reasoning section (separate from text)", async () => {
      manager.startTurn("ses_abc", 123, 456);

      await manager.handleEvent(
        { type: "message.part.delta", properties: { sessionID: "ses_abc", messageID: "m1", partID: "p1", field: "thinking", delta: "step one" } },
        bot
      );

      // Force throttle window open
      const turn = (manager as unknown as { turns: Map<string, { lastEditAt: number }> }).turns.get("ses_abc");
      if (turn) turn.lastEditAt = 0;

      await manager.handleEvent(
        { type: "message.part.delta", properties: { sessionID: "ses_abc", messageID: "m1", partID: "p2", field: "thinking", delta: " done" } },
        bot
      );

      expect(bot.editMessageText).toHaveBeenCalledWith(
        123,
        456,
        "⏳ …\n\n💭 Reasoning\nstep one done\n\n✍️ Answer\n"
      );
    });

    it("throttles edits to 500ms intervals", async () => {
      manager.startTurn("ses_abc", 123, 456);

      // Two rapid deltas — only one edit should fire (throttle)
      await manager.handleEvent(
        { type: "message.part.delta", properties: { sessionID: "ses_abc", messageID: "m1", partID: "p1", field: "text", delta: "A" } },
        bot
      );
      await manager.handleEvent(
        { type: "message.part.delta", properties: { sessionID: "ses_abc", messageID: "m1", partID: "p2", field: "text", delta: "B" } },
        bot
      );

      // editMessageText should be called at most once (first delta triggers, second is throttled)
      expect(vi.mocked(bot.editMessageText).mock.calls.length).toBeLessThanOrEqual(1);
    });

    it("HTML-escapes < > & in interim buffer display", async () => {
      manager.startTurn("ses_abc", 123, 456);

      // Force throttle open
      const turn = (manager as any).turns.get("ses_abc")!;
      turn.lastEditAt = 0;

      await manager.handleEvent(
        { type: "message.part.delta", properties: { sessionID: "ses_abc", messageID: "m1", partID: "p1", field: "text", delta: "<b>hello</b> & world" } },
        bot
      );

      expect(bot.editMessageText).toHaveBeenCalledWith(
        123, 456,
        "⏳ …\n\n✍️ Answer\n&lt;b&gt;hello&lt;/b&gt; &amp; world"
      );
    });
  });

  describe("handleEvent — session.error / message.updated", () => {
    it("session.error edits active turn with OpenCode error text", async () => {
      manager.startTurn("ses_abc", 123, 456);
      await manager.handleEvent(
        {
          type: "session.error",
          properties: {
            sessionID: "ses_abc",
            error: { name: "APIError", data: { message: "Rate limit exceeded" } },
          },
        },
        bot
      );
      expect(bot.editMessageText).toHaveBeenCalledWith(123, 456, "❌ Rate limit exceeded");
      expect(manager.isBusy(123)).toBe(false);
    });

    it("message.updated with assistant error shows user-facing message", async () => {
      manager.startTurn("ses_abc", 123, 456);
      await manager.handleEvent(
        {
          type: "message.updated",
          properties: {
            sessionID: "ses_abc",
            info: {
              role: "assistant",
              error: { name: "UnknownError", data: { message: "insufficient funds" } },
            },
          },
        },
        bot
      );
      expect(bot.editMessageText).toHaveBeenCalledWith(123, 456, "❌ insufficient funds");
      expect(manager.isBusy(123)).toBe(false);
    });

    it("does nothing on session.error without sessionID", async () => {
      manager.startTurn("ses_abc", 123, 456);
      vi.mocked(bot.editMessageText).mockClear();
      await manager.handleEvent(
        { type: "session.error", properties: { error: { name: "UnknownError", data: { message: "x" } } } },
        bot
      );
      expect(bot.editMessageText).not.toHaveBeenCalled();
    });
  });

  describe("handleEvent — session.idle", () => {
    it("sends final clean message without ⏳ prefix and ends turn", async () => {
      manager.startTurn("ses_abc", 123, 456);

      await manager.handleEvent(
        { type: "message.part.delta", properties: { sessionID: "ses_abc", messageID: "m1", partID: "p1", field: "text", delta: "Final answer" } },
        bot
      );

      vi.mocked(bot.editMessageText).mockClear();

      await manager.handleEvent({ type: "session.idle", properties: { sessionID: "ses_abc" } }, bot);

      expect(bot.editMessageText).toHaveBeenCalledWith(
        123, 456,
        expect.stringMatching(/Final answer[\s\S]*<i>anthropic\/x · build<\/i>/),
        { parse_mode: "HTML" }
      );
      expect(manager.isBusy(123)).toBe(false);
    });

    it("session.idle final uses only answer text when reasoning used field text + part.updated (OpenCode)", async () => {
      manager.startTurn("ses_abc", 123, 456);

      await manager.handleEvent(
        {
          type: "message.part.updated",
          properties: {
            sessionID: "ses_abc",
            time: Date.now(),
            part: { id: "part_r", type: "reasoning" },
          },
        },
        bot
      );
      await manager.handleEvent(
        {
          type: "message.part.updated",
          properties: {
            sessionID: "ses_abc",
            time: Date.now(),
            part: { id: "part_a", type: "text" },
          },
        },
        bot
      );

      await manager.handleEvent(
        {
          type: "message.part.delta",
          properties: {
            sessionID: "ses_abc",
            messageID: "m1",
            partID: "part_r",
            field: "text",
            delta: "secret chain of thought",
          },
        },
        bot
      );
      await manager.handleEvent(
        {
          type: "message.part.delta",
          properties: {
            sessionID: "ses_abc",
            messageID: "m1",
            partID: "part_a",
            field: "text",
            delta: "Hello user",
          },
        },
        bot
      );

      vi.mocked(bot.editMessageText).mockClear();

      await manager.handleEvent({ type: "session.idle", properties: { sessionID: "ses_abc" } }, bot);

      expect(bot.editMessageText).toHaveBeenCalledWith(
        123,
        456,
        expect.stringMatching(/Hello user[\s\S]*<i>anthropic\/x · build<\/i>/),
        { parse_mode: "HTML" }
      );
      expect(bot.editMessageText).not.toHaveBeenCalledWith(
        123,
        456,
        expect.stringMatching(/secret chain of thought/),
        expect.anything()
      );
    });

    it("strips </think> blocks from text before final render (reasoning leaked into text field)", async () => {
      manager.startTurn("ses_abc", 123, 456);

      await manager.handleEvent(
        {
          type: "message.part.delta",
          properties: {
            sessionID: "ses_abc",
            messageID: "m1",
            partID: "p1",
            field: "text",
            delta: "</think>reasoning here</think>\n\nUser-facing reply",
          },
        },
        bot
      );

      vi.mocked(bot.editMessageText).mockClear();

      await manager.handleEvent({ type: "session.idle", properties: { sessionID: "ses_abc" } }, bot);

      expect(bot.editMessageText).toHaveBeenCalledWith(
        123,
        456,
        expect.stringMatching(/User-facing reply[\s\S]*<i>anthropic\/x · build<\/i>/),
        { parse_mode: "HTML" }
      );
    });

    it("clears turn before sending final edit (prevents race with throttled edit)", async () => {
      manager.startTurn("ses_abc", 123, 456);

      await manager.handleEvent({ type: "session.idle", properties: { sessionID: "ses_abc" } }, bot);

      // After endTurn, isBusy must be false before editMessageText resolves
      expect(manager.isBusy(123)).toBe(false);
    });

    it("uses '(empty response)' if buffer is empty on session.idle", async () => {
      manager.startTurn("ses_abc", 123, 456);

      await manager.handleEvent({ type: "session.idle", properties: { sessionID: "ses_abc" } }, bot);

      expect(bot.editMessageText).toHaveBeenCalledWith(
        123,
        456,
        expect.stringMatching(/\(empty response\)[\s\S]*<i>anthropic\/x · build<\/i>/),
        { parse_mode: "HTML" }
      );
    });

    it("sends subsequent chunks as new sendMessage calls when buffer splits", async () => {
      manager.startTurn("ses_abc", 123, 456);

      // Create a buffer that will produce 2+ chunks after conversion
      const chunk1 = "a".repeat(4090);
      const chunk2 = "b".repeat(100);
      const bigBuffer = `${chunk1}\n${chunk2}`;

      (manager as any).turns.get("ses_abc")!.buffer = bigBuffer;
      vi.mocked(bot.editMessageText).mockClear();

      await manager.handleEvent({ type: "session.idle", properties: { sessionID: "ses_abc" } }, bot);

      expect(bot.editMessageText).toHaveBeenCalledWith(
        123, 456, expect.any(String), { parse_mode: "HTML" }
      );
      expect(bot.sendMessage).toHaveBeenCalledWith(
        123, expect.any(String), { parse_mode: "HTML" }
      );
    });

    it("falls back to plain text when Telegram rejects HTML parse_mode", async () => {
      manager.startTurn("ses_abc", 123, 456);
      (manager as any).turns.get("ses_abc")!.buffer = "**bold**";

      // First call (HTML) rejects, second call (fallback) should succeed
      vi.mocked(bot.editMessageText)
        .mockRejectedValueOnce(new Error("Bad Request: can't parse entities"))
        .mockResolvedValueOnce({} as any);

      await manager.handleEvent({ type: "session.idle", properties: { sessionID: "ses_abc" } }, bot);

      // Called twice: first with parse_mode: "HTML", then fallback without
      expect(bot.editMessageText).toHaveBeenCalledTimes(2);
      const secondCall = vi.mocked(bot.editMessageText).mock.calls[1];
      // Second call has no parse_mode option (or undefined)
      expect(secondCall[3]).toBeUndefined();
    });
  });
});
