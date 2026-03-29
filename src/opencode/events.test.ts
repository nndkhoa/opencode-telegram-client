import { describe, expect, it } from "vitest";
import {
  isPermissionAsked,
  isPermissionReplied,
  isQuestionAsked,
  isQuestionRejected,
  isQuestionReplied,
  parseEvent,
  type OpenCodeEvent,
} from "./events.js";

describe("parseEvent + interactive SSE fixtures", () => {
  it("parses question.asked with nested sessionID in properties", () => {
    const raw = JSON.stringify({
      type: "question.asked",
      properties: {
        id: "q-req-1",
        sessionID: "sess-abc",
        questions: [
          {
            question: "Pick one",
            header: "Pick",
            options: [{ label: "A", description: "opt a" }],
            multiple: false,
            custom: true,
          },
        ],
      },
    });
    const ev = parseEvent(raw);
    expect(ev).not.toBeNull();
    expect(isQuestionAsked(ev as OpenCodeEvent)).toBe(true);
    if (isQuestionAsked(ev as OpenCodeEvent)) {
      expect(ev.properties.sessionID).toBe("sess-abc");
      expect(ev.properties.id).toBe("q-req-1");
      expect(ev.properties.questions[0]?.header).toBe("Pick");
    }
  });

  it("parses permission.asked with nested sessionID", () => {
    const raw = JSON.stringify({
      type: "permission.asked",
      properties: {
        id: "p-req-1",
        sessionID: "sess-xyz",
        permission: "bash",
        patterns: ["*"],
        metadata: {},
        always: [],
      },
    });
    const ev = parseEvent(raw);
    expect(ev).not.toBeNull();
    expect(isPermissionAsked(ev as OpenCodeEvent)).toBe(true);
    if (isPermissionAsked(ev as OpenCodeEvent)) {
      expect(ev.properties.sessionID).toBe("sess-xyz");
      expect(ev.properties.id).toBe("p-req-1");
    }
  });

  it("parses question.replied", () => {
    const raw = JSON.stringify({
      type: "question.replied",
      properties: {
        sessionID: "s1",
        requestID: "r1",
        answers: [["yes"], ["a", "b"]],
      },
    });
    const ev = parseEvent(raw);
    expect(isQuestionReplied(ev as OpenCodeEvent)).toBe(true);
    if (isQuestionReplied(ev as OpenCodeEvent)) {
      expect(ev.properties.requestID).toBe("r1");
      expect(ev.properties.answers).toEqual([["yes"], ["a", "b"]]);
    }
  });

  it("parses question.rejected", () => {
    const raw = JSON.stringify({
      type: "question.rejected",
      properties: { sessionID: "s1", requestID: "r9" },
    });
    const ev = parseEvent(raw);
    expect(isQuestionRejected(ev as OpenCodeEvent)).toBe(true);
  });

  it("parses permission.replied", () => {
    const raw = JSON.stringify({
      type: "permission.replied",
      properties: {
        sessionID: "s1",
        requestID: "pr1",
        reply: "once",
      },
    });
    const ev = parseEvent(raw);
    expect(isPermissionReplied(ev as OpenCodeEvent)).toBe(true);
    if (isPermissionReplied(ev as OpenCodeEvent)) {
      expect(ev.properties.reply).toBe("once");
    }
  });
});
