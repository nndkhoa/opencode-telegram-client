import { describe, it, expect, vi, beforeEach } from "vitest";
import { StreamingStateManager } from "./streaming-state.js";
import type { Api } from "grammy";

function makeMockBot(): Api {
  return {
    editMessageText: vi.fn().mockResolvedValue({}),
  } as unknown as Api;
}

describe("StreamingStateManager", () => {
  let manager: StreamingStateManager;
  let bot: Api;

  beforeEach(() => {
    manager = new StreamingStateManager();
    bot = makeMockBot();
  });

  describe("session management", () => {
    it("returns undefined for unknown chatId", () => {
      expect(manager.getSession(123)).toBeUndefined();
    });

    it("stores and retrieves session for chatId", () => {
      manager.setSession(123, "ses_abc");
      expect(manager.getSession(123)).toBe("ses_abc");
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
    it("appends delta to buffer", () => {
      manager.setSession(123, "ses_abc");
      manager.startTurn("ses_abc", 123, 456);

      manager.handleEvent(
        { type: "message.part.delta", properties: { sessionID: "ses_abc", messageID: "m1", partID: "p1", field: "text", delta: "Hello " } },
        bot
      );
      manager.handleEvent(
        { type: "message.part.delta", properties: { sessionID: "ses_abc", messageID: "m1", partID: "p2", field: "text", delta: "world" } },
        bot
      );

      // Force an edit by making lastEditAt old
      const turn = (manager as unknown as { turns: Map<string, { lastEditAt: number }> }).turns.get("ses_abc");
      if (turn) turn.lastEditAt = 0;

      manager.handleEvent(
        { type: "message.part.delta", properties: { sessionID: "ses_abc", messageID: "m1", partID: "p3", field: "text", delta: "!" } },
        bot
      );

      expect(bot.editMessageText).toHaveBeenCalledWith(
        123,
        456,
        "⏳ Thinking...\n\nHello world!"
      );
    });

    it("ignores non-text field deltas", () => {
      manager.setSession(123, "ses_abc");
      manager.startTurn("ses_abc", 123, 456);

      manager.handleEvent(
        { type: "message.part.delta", properties: { sessionID: "ses_abc", messageID: "m1", partID: "p1", field: "thinking", delta: "internal thought" } },
        bot
      );

      // Force throttle window open
      const turn = (manager as unknown as { turns: Map<string, { lastEditAt: number }> }).turns.get("ses_abc");
      if (turn) turn.lastEditAt = 0;

      expect(bot.editMessageText).not.toHaveBeenCalled();
    });

    it("throttles edits to 500ms intervals", () => {
      manager.setSession(123, "ses_abc");
      manager.startTurn("ses_abc", 123, 456);

      // Two rapid deltas — only one edit should fire (throttle)
      manager.handleEvent(
        { type: "message.part.delta", properties: { sessionID: "ses_abc", messageID: "m1", partID: "p1", field: "text", delta: "A" } },
        bot
      );
      manager.handleEvent(
        { type: "message.part.delta", properties: { sessionID: "ses_abc", messageID: "m1", partID: "p2", field: "text", delta: "B" } },
        bot
      );

      // editMessageText should be called at most once (first delta triggers, second is throttled)
      expect(vi.mocked(bot.editMessageText).mock.calls.length).toBeLessThanOrEqual(1);
    });
  });

  describe("handleEvent — session.idle", () => {
    it("sends final clean message without ⏳ prefix and ends turn", () => {
      manager.setSession(123, "ses_abc");
      manager.startTurn("ses_abc", 123, 456);

      manager.handleEvent(
        { type: "message.part.delta", properties: { sessionID: "ses_abc", messageID: "m1", partID: "p1", field: "text", delta: "Final answer" } },
        bot
      );

      vi.mocked(bot.editMessageText).mockClear();

      manager.handleEvent({ type: "session.idle", properties: { sessionID: "ses_abc" } }, bot);

      expect(bot.editMessageText).toHaveBeenCalledWith(123, 456, "Final answer");
      expect(manager.isBusy(123)).toBe(false);
    });

    it("clears turn before sending final edit (prevents race with throttled edit)", () => {
      manager.setSession(123, "ses_abc");
      manager.startTurn("ses_abc", 123, 456);

      manager.handleEvent({ type: "session.idle", properties: { sessionID: "ses_abc" } }, bot);

      // After endTurn, isBusy must be false before editMessageText resolves
      expect(manager.isBusy(123)).toBe(false);
    });

    it("uses '(empty response)' if buffer is empty on session.idle", () => {
      manager.setSession(123, "ses_abc");
      manager.startTurn("ses_abc", 123, 456);

      manager.handleEvent({ type: "session.idle", properties: { sessionID: "ses_abc" } }, bot);

      expect(bot.editMessageText).toHaveBeenCalledWith(123, 456, "(empty response)");
    });
  });
});
