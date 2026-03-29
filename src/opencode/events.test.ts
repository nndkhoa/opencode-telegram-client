import { describe, expect, it } from "vitest";
import {
  isPermissionAsked,
  isPermissionReplied,
  isQuestionAsked,
  isQuestionRejected,
  isQuestionReplied,
  parseEvent,
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
    if (!ev) return;
    expect(isQuestionAsked(ev)).toBe(true);
    if (isQuestionAsked(ev)) {
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
    if (!ev) return;
    expect(isPermissionAsked(ev)).toBe(true);
    if (isPermissionAsked(ev)) {
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
    expect(ev).not.toBeNull();
    if (!ev) return;
    expect(isQuestionReplied(ev)).toBe(true);
    if (isQuestionReplied(ev)) {
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
    expect(ev).not.toBeNull();
    if (!ev) return;
    expect(isQuestionRejected(ev)).toBe(true);
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
    expect(ev).not.toBeNull();
    if (!ev) return;
    expect(isPermissionReplied(ev)).toBe(true);
    if (isPermissionReplied(ev)) {
      expect(ev.properties.reply).toBe("once");
    }
  });
});
