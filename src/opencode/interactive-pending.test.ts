import { describe, expect, it, vi } from "vitest";
import { PendingInteractiveState } from "./interactive-pending.js";
import type { SessionRegistry } from "../session/registry.js";

function makeRegistry(activeSessionId: string | undefined): SessionRegistry {
  return {
    getActiveSessionId: vi.fn().mockReturnValue(activeSessionId),
  } as unknown as SessionRegistry;
}

describe("PendingInteractiveState", () => {
  it("D-10: two sequential setQuestionAsked for same chat keeps only latest requestID", () => {
    const s = new PendingInteractiveState();
    s.setQuestionAsked(42, {
      requestID: "old-req",
      sessionID: "sess-a",
    });
    s.setQuestionAsked(42, {
      requestID: "new-req",
      sessionID: "sess-a",
    });
    expect(s.get(42)?.requestID).toBe("new-req");
  });

  it("D-11: shouldHandleForChat is false when event session differs from registry active", () => {
    const s = new PendingInteractiveState();
    const reg = makeRegistry("active-sess");
    expect(s.shouldHandleForChat(1, "other-sess", reg)).toBe(false);
    expect(s.shouldHandleForChat(1, "active-sess", reg)).toBe(true);
  });

  it("D-11: shouldHandleForChat is false when chat has no active session", () => {
    const s = new PendingInteractiveState();
    const reg = makeRegistry(undefined);
    expect(s.shouldHandleForChat(99, "any", reg)).toBe(false);
  });

  it("clear removes pending state", () => {
    const s = new PendingInteractiveState();
    s.setPermissionAsked(3, { requestID: "p1", sessionID: "s" });
    s.clear(3);
    expect(s.get(3)).toBeUndefined();
  });

  it("clearOnQuestionReplied clears only matching requestID", () => {
    const s = new PendingInteractiveState();
    s.setQuestionAsked(7, { requestID: "r1", sessionID: "s" });
    s.clearOnQuestionReplied(7, "other");
    expect(s.get(7)).toBeDefined();
    s.clearOnQuestionReplied(7, "r1");
    expect(s.get(7)).toBeUndefined();
  });

  it("toggleQuestionOption updates selection sets", () => {
    const s = new PendingInteractiveState();
    s.setQuestionAsked(1, { requestID: "r", sessionID: "s" });
    s.toggleQuestionOption(1, 0, 2);
    s.toggleQuestionOption(1, 0, 2);
    expect(s.get(1)?.selectedOptionIndicesByQuestion.get(0)?.size).toBe(0);
    s.toggleQuestionOption(1, 0, 1);
    expect(s.get(1)?.selectedOptionIndicesByQuestion.get(0)?.has(1)).toBe(true);
  });

  it("registerCallbackToken round-trips", () => {
    const s = new PendingInteractiveState();
    const t = s.registerCallbackToken(5, "permission", "p:once");
    expect(s.resolveCallbackToken(t)).toEqual({
      chatId: 5,
      kind: "permission",
      role: "p:once",
      payload: undefined,
    });
    s.unregisterCallbackToken(t);
    expect(s.resolveCallbackToken(t)).toBeUndefined();
  });
});
