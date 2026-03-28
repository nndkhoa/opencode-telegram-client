import { describe, it, expect, vi, beforeEach } from "vitest";
import { StreamingStateManager } from "./streaming-state.js";
import type { Api } from "grammy";

function makeMockBot(): Api {
  return {
    editMessageText: vi.fn().mockResolvedValue({}),
    sendMessage: vi.fn().mockResolvedValue({}),
  } as unknown as Api;
}

describe("StreamingStateManager", () => {
  let manager: StreamingStateManager;
  let bot: Api;

  beforeEach(() => {
    manager = new StreamingStateManager();
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
      manager.setSession(123, "ses_abc");
      manager.startTurn("ses_abc", 123, 456);
      expect(manager.isBusy(123)).toBe(true);
    });

    it("is not busy after endTurn", () => {
      manager.setSession(123, "ses_abc");
      manager.startTurn("ses_abc", 123, 456);
      manager.endTurn("ses_abc");
      expect(manager.isBusy(123)).toBe(false);
    });
  });

  describe("handleEvent — message.part.delta", () => {
    it("appends delta to buffer", async () => {
      manager.setSession(123, "ses_abc");
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
        "⏳ Thinking...\n\nHello world!"
      );
    });

    it("ignores non-text field deltas", async () => {
      manager.setSession(123, "ses_abc");
      manager.startTurn("ses_abc", 123, 456);

      await manager.handleEvent(
        { type: "message.part.delta", properties: { sessionID: "ses_abc", messageID: "m1", partID: "p1", field: "thinking", delta: "internal thought" } },
        bot
      );

      // Force throttle window open
      const turn = (manager as unknown as { turns: Map<string, { lastEditAt: number }> }).turns.get("ses_abc");
      if (turn) turn.lastEditAt = 0;

      expect(bot.editMessageText).not.toHaveBeenCalled();
    });

    it("throttles edits to 500ms intervals", async () => {
      manager.setSession(123, "ses_abc");
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
      manager.setSession(123, "ses_abc");
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
        "⏳ Thinking...\n\n&lt;b&gt;hello&lt;/b&gt; &amp; world"
      );
    });
  });

  describe("handleEvent — session.idle", () => {
    it("sends final clean message without ⏳ prefix and ends turn", async () => {
      manager.setSession(123, "ses_abc");
      manager.startTurn("ses_abc", 123, 456);

      await manager.handleEvent(
        { type: "message.part.delta", properties: { sessionID: "ses_abc", messageID: "m1", partID: "p1", field: "text", delta: "Final answer" } },
        bot
      );

      vi.mocked(bot.editMessageText).mockClear();

      await manager.handleEvent({ type: "session.idle", properties: { sessionID: "ses_abc" } }, bot);

      expect(bot.editMessageText).toHaveBeenCalledWith(
        123, 456,
        expect.stringContaining("Final answer"),
        { parse_mode: "HTML" }
      );
      expect(manager.isBusy(123)).toBe(false);
    });

    it("clears turn before sending final edit (prevents race with throttled edit)", async () => {
      manager.setSession(123, "ses_abc");
      manager.startTurn("ses_abc", 123, 456);

      await manager.handleEvent({ type: "session.idle", properties: { sessionID: "ses_abc" } }, bot);

      // After endTurn, isBusy must be false before editMessageText resolves
      expect(manager.isBusy(123)).toBe(false);
    });

    it("uses '(empty response)' if buffer is empty on session.idle", async () => {
      manager.setSession(123, "ses_abc");
      manager.startTurn("ses_abc", 123, 456);

      await manager.handleEvent({ type: "session.idle", properties: { sessionID: "ses_abc" } }, bot);

      expect(bot.editMessageText).toHaveBeenCalledWith(
        123, 456, "(empty response)", { parse_mode: "HTML" }
      );
    });

    it("sends subsequent chunks as new sendMessage calls when buffer splits", async () => {
      manager.setSession(123, "ses_abc");
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
      manager.setSession(123, "ses_abc");
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
