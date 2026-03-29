/**
 * OpenCode SSE event types aligned with anomalyco/opencode SDK `Event` union
 * (`packages/sdk/js/src/v2/gen/types.gen.ts`). Validate live payloads via GET /doc if needed.
 */

export type MessagePartDeltaEvent = {
  type: "message.part.delta";
  properties: {
    sessionID: string;
    messageID: string;
    partID: string;
    field: string;
    delta: string;
  };
};

export type SessionIdleEvent = {
  type: "session.idle";
  properties: {
    sessionID: string;
  };
};

/** Bus event: part created/updated — use `part.type` to tell reasoning vs text (`message.part.delta` uses `field: "text"` for both). */
export type MessagePartUpdatedEvent = {
  type: "message.part.updated";
  properties: {
    sessionID: string;
    part: { id: string; type: string };
    time: number;
  };
};

/** One option row for a structured question (SDK: QuestionOption). */
export type QuestionOption = {
  label: string;
  description: string;
};

/** One sub-question (SDK: QuestionInfo). */
export type QuestionInfo = {
  question: string;
  header: string;
  options: QuestionOption[];
  multiple?: boolean;
  custom?: boolean;
};

/** Payload embedded in `question.asked` (SDK: QuestionRequest). */
export type QuestionRequestPayload = {
  id: string;
  sessionID: string;
  questions: QuestionInfo[];
  tool?: { messageID: string; callID: string };
};

export type QuestionAskedEvent = {
  type: "question.asked";
  properties: QuestionRequestPayload;
};

/** Payload embedded in `permission.asked` (SDK: PermissionRequest). */
export type PermissionRequestPayload = {
  id: string;
  sessionID: string;
  permission: string;
  patterns: string[];
  metadata: Record<string, unknown>;
  always: string[];
  tool?: { messageID: string; callID: string };
};

export type PermissionAskedEvent = {
  type: "permission.asked";
  properties: PermissionRequestPayload;
};

/** Per-question answer lines in order (SDK: QuestionAnswer is string[] per question). */
export type QuestionAnswer = string[];

export type QuestionRepliedEvent = {
  type: "question.replied";
  properties: {
    sessionID: string;
    requestID: string;
    answers: QuestionAnswer[];
  };
};

export type QuestionRejectedEvent = {
  type: "question.rejected";
  properties: {
    sessionID: string;
    requestID: string;
  };
};

export type PermissionRepliedEvent = {
  type: "permission.replied";
  properties: {
    sessionID: string;
    requestID: string;
    reply: "once" | "always" | "reject";
  };
};

export type OpenCodeEvent =
  | MessagePartDeltaEvent
  | MessagePartUpdatedEvent
  | SessionIdleEvent
  | QuestionAskedEvent
  | PermissionAskedEvent
  | QuestionRepliedEvent
  | QuestionRejectedEvent
  | PermissionRepliedEvent
  | { type: string; properties?: Record<string, unknown> };

export function parseEvent(raw: string): OpenCodeEvent | null {
  try {
    return JSON.parse(raw) as OpenCodeEvent;
  } catch {
    return null;
  }
}

export function isQuestionAsked(event: OpenCodeEvent): event is QuestionAskedEvent {
  return event.type === "question.asked";
}

export function isPermissionAsked(event: OpenCodeEvent): event is PermissionAskedEvent {
  return event.type === "permission.asked";
}

export function isQuestionReplied(event: OpenCodeEvent): event is QuestionRepliedEvent {
  return event.type === "question.replied";
}

export function isQuestionRejected(event: OpenCodeEvent): event is QuestionRejectedEvent {
  return event.type === "question.rejected";
}

export function isPermissionReplied(event: OpenCodeEvent): event is PermissionRepliedEvent {
  return event.type === "permission.replied";
}

/** Narrow interactive asked events for sessionID comparison (D-11). */
export function getSessionIdFromAsked(
  event: QuestionAskedEvent | PermissionAskedEvent
): string {
  return event.properties.sessionID;
}
