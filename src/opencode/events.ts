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

/** A single text part inside a message (for out-of-band message rendering). */
export type MessageTextPart = {
  type: "text";
  text: string;
};

/** Minimal shape of an OpenCode UserMessage or AssistantMessage (SDK: Message). */
export type OpenCodeMessage = {
  id: string;
  role: "user" | "assistant";
  parts?: Array<{ type: string; text?: string; [key: string]: unknown }>;
  error?: unknown;
  modelID?: string;
  providerID?: string;
  agent?: string;
  mode?: string;
  [key: string]: unknown;
};

/**
 * Fired when a message is created OR updated in a session (SDK: Event.message.updated).
 * Used for both initial creation and subsequent edits — there is no separate message.added event.
 */
export type MessageUpdatedEvent = {
  type: "message.updated";
  properties: {
    sessionID: string;
    info: OpenCodeMessage;
  };
};

/** Sync-event stream variant of message.updated (versioned). */
export type MessageUpdatedSyncEvent = {
  type: "message.updated.1";
  data: {
    sessionID: string;
    info: OpenCodeMessage;
  };
};

/** Fired when a session is deleted on the OpenCode server (SDK: Event.session.deleted). */
export type SessionDeletedEvent = {
  type: "session.deleted";
  properties: {
    sessionID: string;
    info: Record<string, unknown>;
  };
};

/** Sync-event stream variant of session.deleted (versioned). */
export type SessionDeletedSyncEvent = {
  type: "session.deleted.1";
  data: {
    sessionID: string;
    info: Record<string, unknown>;
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

/** New-style streaming events from /global/event (v1.14+). */
export type SessionNextTextDeltaEvent = {
  type: "session.next.text.delta";
  properties: {
    sessionID: string;
    delta: string;
    timestamp: number;
  };
};

export type SessionNextTextEndedEvent = {
  type: "session.next.text.ended";
  properties: {
    sessionID: string;
    text: string;
    timestamp: number;
  };
};

export type SessionNextReasoningDeltaEvent = {
  type: "session.next.reasoning.delta";
  properties: {
    sessionID: string;
    reasoningID: string;
    delta: string;
    timestamp: number;
  };
};

export type OpenCodeEvent =
  | MessagePartDeltaEvent
  | MessagePartUpdatedEvent
  | MessageUpdatedEvent
  | MessageUpdatedSyncEvent
  | SessionIdleEvent
  | SessionDeletedEvent
  | SessionDeletedSyncEvent
  | SessionNextTextDeltaEvent
  | SessionNextTextEndedEvent
  | SessionNextReasoningDeltaEvent
  | QuestionAskedEvent
  | PermissionAskedEvent
  | QuestionRepliedEvent
  | QuestionRejectedEvent
  | PermissionRepliedEvent
  | { type: string; properties?: Record<string, unknown> };

export function parseEvent(raw: string): OpenCodeEvent | null {
  try {
    const parsed = JSON.parse(raw);
    // /global/event wraps each event as { directory, project?, workspace?, payload: <Event> }
    // /event (project-scoped) emits events directly. Handle both formats.
    if (parsed && typeof parsed === "object" && "payload" in parsed) {
      return parsed.payload as OpenCodeEvent;
    }
    return parsed as OpenCodeEvent;
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

export function isSessionDeleted(
  event: OpenCodeEvent
): event is SessionDeletedEvent | SessionDeletedSyncEvent {
  return event.type === "session.deleted" || event.type === "session.deleted.1";
}

export function isMessageUpdated(
  event: OpenCodeEvent
): event is MessageUpdatedEvent | MessageUpdatedSyncEvent {
  return event.type === "message.updated" || event.type === "message.updated.1";
}

/** Extract the normalized payload from a message.updated or message.updated.1 event. */
export function getMessageUpdatedPayload(
  event: MessageUpdatedEvent | MessageUpdatedSyncEvent
): { sessionID: string; info: OpenCodeMessage } {
  if (event.type === "message.updated") {
    return event.properties;
  }
  return event.data;
}

/** Extract the sessionID from a session.deleted or session.deleted.1 event. */
export function getSessionDeletedId(
  event: SessionDeletedEvent | SessionDeletedSyncEvent
): string {
  if (event.type === "session.deleted") {
    return event.properties.sessionID;
  }
  return event.data.sessionID;
}
