import { describe, it, expect, vi, beforeEach } from "vitest";
import { StreamingStateManager } from "./streaming-state.js";
import type { Api } from "grammy";
import type { SessionRegistry } from "../session/registry.js";
import type { PendingInteractiveState } from "./interactive-pending.js";
import * as assistantMeta from "./assistant-meta.js";

vi.mock("./assistant-meta.js", () => ({
  formatAssistantFooterHtml: (m: string, a: string) => `<em>${m} · ${a}</em>`,
  resolveAssistantFooterLines: vi.fn().mockResolvedValue({ modelRef: "anthropic/x", agentLabel: "build" }),
  fetchLastAssistantMessage: vi.fn().mockResolvedValue(null),
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
    removeSession: vi.fn(),
  } as unknown as SessionRegistry;
}

function makeMockPending(): PendingInteractiveState {
  return {
    getChatForSession: vi.fn().mockReturnValue(undefined),
    rememberSessionChat: vi.fn(),
    forgetSession: vi.fn(),
  } as unknown as PendingInteractiveState;
}

describe("StreamingStateManager", () => {
  let manager: StreamingStateManager;
  let bot: Api;
  let registry: SessionRegistry;

  beforeEach(() => {
    registry = makeMockRegistry();
    manager = new StreamingStateManager(registry, "http://localhost:4096", makeMockPending());
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
        expect.stringMatching(/Final answer[\s\S]*<em>anthropic\/x · build<\/em>/),
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
        expect.stringMatching(/Hello user[\s\S]*<em>anthropic\/x · build<\/em>/),
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
        expect.stringMatching(/User-facing reply[\s\S]*<em>anthropic\/x · build<\/em>/),
        { parse_mode: "HTML" }
      );
    });

    it("clears turn before sending final edit (prevents race with throttled edit)", async () => {
      manager.startTurn("ses_abc", 123, 456);

      await manager.handleEvent({ type: "session.idle", properties: { sessionID: "ses_abc" } }, bot);

      // After endTurn, isBusy must be false before editMessageText resolves
      expect(manager.isBusy(123)).toBe(false);
    });

    it("awaits in-flight interim edit before sending final HTML (race condition fix)", async () => {
      manager.startTurn("ses_abc", 123, 456);

      // Simulate an in-flight interim edit that resolves after a microtask delay
      const callOrder: string[] = [];
      let resolveInterim!: () => void;
      const interimPromise = new Promise<void>((res) => { resolveInterim = res; });

      vi.mocked(bot.editMessageText)
        // First call: interim edit — returns a delayed promise
        .mockImplementationOnce(() => {
          return interimPromise.then(() => { callOrder.push("interim"); return {} as any; });
        })
        // Second call: final edit
        .mockImplementationOnce(() => { callOrder.push("final"); return Promise.resolve({} as any); });

      // Force throttle open so interim fires
      const turn = (manager as any).turns.get("ses_abc")!;
      turn.lastEditAt = 0;

      // Dispatch a delta so the interim edit is scheduled
      await manager.handleEvent(
        { type: "message.part.delta", properties: { sessionID: "ses_abc", messageID: "m1", partID: "p1", field: "text", delta: "hi" } },
        bot
      );

      // Now dispatch session.idle — it must await the pending interim before the final edit
      const idlePromise = manager.handleEvent(
        { type: "session.idle", properties: { sessionID: "ses_abc" } },
        bot
      );

      // Resolve the interim edit mid-flight
      resolveInterim();
      await idlePromise;

      // interim must have settled before final was sent
      expect(callOrder).toEqual(["interim", "final"]);
    });

    it("uses '(empty response)' if buffer is empty on session.idle", async () => {
      manager.startTurn("ses_abc", 123, 456);

      await manager.handleEvent({ type: "session.idle", properties: { sessionID: "ses_abc" } }, bot);

      expect(bot.editMessageText).toHaveBeenCalledWith(
        123,
        456,
        expect.stringMatching(/\(empty response\)[\s\S]*<em>anthropic\/x · build<\/em>/),
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

    it("falls back to escaped HTML body with italic footer when Telegram rejects first HTML edit", async () => {
      manager.startTurn("ses_abc", 123, 456);
      (manager as any).turns.get("ses_abc")!.buffer = "**bold**";

      vi.mocked(bot.editMessageText)
        .mockRejectedValueOnce(new Error("Bad Request: can't parse entities"))
        .mockResolvedValueOnce({} as any);

      await manager.handleEvent({ type: "session.idle", properties: { sessionID: "ses_abc" } }, bot);

      expect(bot.editMessageText).toHaveBeenCalledTimes(2);
      const secondCall = vi.mocked(bot.editMessageText).mock.calls[1];
      expect(secondCall[3]).toEqual({ parse_mode: "HTML" });
      expect(secondCall[2]).toMatch(/bold[\s\S]*<em>anthropic\/x · build<\/em>/);
      // fallback must not contain <br> — Telegram HTML mode rejects standalone <br> outside <pre>
      expect(secondCall[2]).not.toMatch(/<br/i);
    });

    it("fallback body uses newlines not <br> for multiline content", async () => {
      manager.startTurn("ses_abc", 123, 456);
      (manager as any).turns.get("ses_abc")!.buffer = "line one\n\nline two\n\nline three";

      vi.mocked(bot.editMessageText)
        .mockRejectedValueOnce(new Error("Bad Request: can't parse entities: Unsupported start tag \"br\" at byte offset 11"))
        .mockResolvedValueOnce({} as any);

      await manager.handleEvent({ type: "session.idle", properties: { sessionID: "ses_abc" } }, bot);

      const secondCall = vi.mocked(bot.editMessageText).mock.calls[1];
      expect(secondCall[2]).not.toMatch(/<br/i);
      expect(secondCall[2]).toMatch(/line one[\s\S]*line two[\s\S]*line three/);
    });
  });

  describe("session.idle — out-of-band (no active turn)", () => {
    let pending: PendingInteractiveState;

    beforeEach(() => {
      // Reset fetchLastAssistantMessage mock to null default before each test
      vi.mocked(assistantMeta.fetchLastAssistantMessage).mockReset();
      vi.mocked(assistantMeta.fetchLastAssistantMessage).mockResolvedValue(null);
      pending = {
        getChatForSession: vi.fn().mockReturnValue(42),
        rememberSessionChat: vi.fn(),
        forgetSession: vi.fn(),
      } as unknown as PendingInteractiveState;
      manager = new StreamingStateManager(registry, "http://localhost:4096", pending);
      bot = makeMockBot();
    });

    it("forwards assistant message via sendMessage when no active turn and chatId known", async () => {
      vi.mocked(assistantMeta.fetchLastAssistantMessage).mockResolvedValueOnce({
        id: "msg_oob_1",
        text: "Response from webUI",
        footerInfo: { modelRef: "openai/gpt-4o", agentLabel: "build" },
      });

      await manager.handleEvent({ type: "session.idle", properties: { sessionID: "ses_oob" } }, bot);

      expect(bot.sendMessage).toHaveBeenCalledWith(
        42,
        expect.stringMatching(/Response from webUI[\s\S]*<em>openai\/gpt-4o · build<\/em>/),
        { parse_mode: "HTML" }
      );
      expect(bot.editMessageText).not.toHaveBeenCalled();
    });

    it("does not forward when chatId is not known", async () => {
      vi.mocked(pending.getChatForSession as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
      vi.mocked(assistantMeta.fetchLastAssistantMessage).mockResolvedValueOnce({
        id: "msg_oob_2",
        text: "Response",
        footerInfo: { modelRef: "openai/gpt-4o", agentLabel: "build" },
      });

      await manager.handleEvent({ type: "session.idle", properties: { sessionID: "ses_oob" } }, bot);

      expect(bot.sendMessage).not.toHaveBeenCalled();
    });

    it("does not forward when fetchLastAssistantMessage returns null", async () => {
      vi.mocked(assistantMeta.fetchLastAssistantMessage).mockResolvedValueOnce(null);

      await manager.handleEvent({ type: "session.idle", properties: { sessionID: "ses_oob" } }, bot);

      expect(bot.sendMessage).not.toHaveBeenCalled();
    });

    it("deduplicates: does not forward the same messageId twice", async () => {
      vi.mocked(assistantMeta.fetchLastAssistantMessage).mockResolvedValueOnce({
        id: "msg_oob_3",
        text: "Unique response",
        footerInfo: { modelRef: "openai/gpt-4o", agentLabel: "build" },
      }).mockResolvedValueOnce({
        id: "msg_oob_3",
        text: "Unique response",
        footerInfo: { modelRef: "openai/gpt-4o", agentLabel: "build" },
      });

      await manager.handleEvent({ type: "session.idle", properties: { sessionID: "ses_oob" } }, bot);
      await manager.handleEvent({ type: "session.idle", properties: { sessionID: "ses_oob" } }, bot);

      // sendMessage should be called only once (dedup prevents second forward)
      expect(bot.sendMessage).toHaveBeenCalledTimes(1);
    });

    it("falls back to plain text when HTML sendMessage fails", async () => {
      vi.mocked(assistantMeta.fetchLastAssistantMessage).mockResolvedValueOnce({
        id: "msg_oob_4",
        text: "Plain text fallback",
        footerInfo: { modelRef: "openai/gpt-4o", agentLabel: "build" },
      });

      vi.mocked(bot.sendMessage)
        .mockRejectedValueOnce(new Error("Bad Request: can't parse entities"))
        .mockResolvedValueOnce({} as any);

      await manager.handleEvent({ type: "session.idle", properties: { sessionID: "ses_oob" } }, bot);

      expect(bot.sendMessage).toHaveBeenCalledTimes(2);
      const fallbackCall = vi.mocked(bot.sendMessage).mock.calls[1];
      expect(fallbackCall[2]).toEqual({ parse_mode: "HTML" });
      expect(fallbackCall[1]).toMatch(/Plain text fallback/);
    });
  });
});
