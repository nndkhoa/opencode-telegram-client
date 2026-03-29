import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  dispatchInteractiveOpenCodeEvent,
  shouldDispatchForSession,
  buildQuestionKeyboardForChat,
  QUESTION_OPTIONS_PAGE_SIZE,
} from "./interactive-dispatch.js";
import { PendingInteractiveState } from "./interactive-pending.js";
import type { SessionRegistry } from "../session/registry.js";
import type { OpenCodeEvent } from "./events.js";

function makeRegistry(activeSession?: string): SessionRegistry {
  return {
    getActiveSessionId: vi.fn().mockReturnValue(activeSession),
  } as unknown as SessionRegistry;
}

function makeApi() {
  return {
    sendMessage: vi.fn().mockResolvedValue({ message_id: 500 }),
    deleteMessage: vi.fn().mockResolvedValue({}),
  };
}

describe("interactive-dispatch", () => {
  describe("shouldDispatchForSession (D-11)", () => {
    it("returns true when registry active session matches event session", () => {
      const reg = makeRegistry("s1");
      expect(shouldDispatchForSession(1, "s1", reg)).toBe(true);
      expect(reg.getActiveSessionId).toHaveBeenCalledWith(1);
    });

    it("returns false when active session differs", () => {
      const reg = makeRegistry("s1");
      expect(shouldDispatchForSession(1, "s2", reg)).toBe(false);
    });

    it("returns false when chat has no active session", () => {
      const reg = makeRegistry(undefined);
      expect(shouldDispatchForSession(1, "s1", reg)).toBe(false);
    });
  });

  describe("dispatchInteractiveOpenCodeEvent", () => {
    let pending: PendingInteractiveState;
    let registry: SessionRegistry;
    const api = makeApi();

    beforeEach(() => {
      pending = new PendingInteractiveState();
      registry = makeRegistry("sess-a");
      pending.rememberSessionChat("sess-a", 42);
    });

    it("skips question.asked when no session→chat mapping", async () => {
      const p = new PendingInteractiveState();
      const ev: OpenCodeEvent = {
        type: "question.asked",
        properties: {
          id: "req1",
          sessionID: "orphan",
          questions: [{ question: "Q", header: "", options: [{ label: "A", description: "" }] }],
        },
      };
      await dispatchInteractiveOpenCodeEvent(ev, api as never, { registry, pending: p });
      expect(api.sendMessage).not.toHaveBeenCalled();
    });

    it("sends permission keyboard with Once / Always / Reject callbacks", async () => {
      const ev: OpenCodeEvent = {
        type: "permission.asked",
        properties: {
          id: "perm1",
          sessionID: "sess-a",
          permission: "Read files",
          patterns: ["*.ts"],
          metadata: {},
          always: [],
        },
      };
      await dispatchInteractiveOpenCodeEvent(ev, api as never, { registry, pending });
      expect(api.sendMessage).toHaveBeenCalledTimes(1);
      const call = vi.mocked(api.sendMessage).mock.calls[0]!;
      expect(call[0]).toBe(42);
      expect(call[1]).toContain("Permission");
      expect(call[1]).toContain("Read files");
      const markup = call[2] as { reply_markup?: { inline_keyboard?: { text: string }[][] } };
      const row = markup.reply_markup?.inline_keyboard?.[0] ?? [];
      expect(row.map((b) => b.text)).toEqual(["Once", "Always", "Reject"]);
    });

    it("clears pending on question.replied for mapped chat", async () => {
      pending.setQuestionAsked(42, {
        requestID: "r1",
        sessionID: "sess-a",
        telegramMessageId: 1,
        questionInfos: [
          { question: "Q", header: "", options: [{ label: "a", description: "" }] },
        ],
      });
      const ev: OpenCodeEvent = {
        type: "question.replied",
        properties: {
          sessionID: "sess-a",
          requestID: "r1",
          answers: [["a"]],
        },
      };
      await dispatchInteractiveOpenCodeEvent(ev, api as never, { registry, pending });
      expect(pending.get(42)).toBeUndefined();
    });
  });

  describe("buildQuestionKeyboardForChat (D-05–D-07)", () => {
    it("paginates when options exceed QUESTION_OPTIONS_PAGE_SIZE", () => {
      const pending = new PendingInteractiveState();
      const options = Array.from({ length: QUESTION_OPTIONS_PAGE_SIZE + 3 }, (_, i) => ({
        label: `Opt ${i}`,
        description: "",
      }));
      pending.setQuestionAsked(7, {
        requestID: "q1",
        sessionID: "s",
        telegramMessageId: 1,
        questionInfos: [{ question: "Pick", header: "", options, multiple: false }],
        optionsPageOffset: 0,
      });
      const built = buildQuestionKeyboardForChat(pending, 7);
      expect(built).toBeDefined();
      const rows = built!.reply_markup.inline_keyboard;
      const texts = rows.flat().map((b) => b.text);
      expect(texts.some((t) => t.includes("Next"))).toBe(true);
    });
  });
});
