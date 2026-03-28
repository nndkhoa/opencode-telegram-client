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

export type OpenCodeEvent =
  | MessagePartDeltaEvent
  | SessionIdleEvent
  | { type: string; properties?: Record<string, unknown> };

export function parseEvent(raw: string): OpenCodeEvent | null {
  try {
    return JSON.parse(raw) as OpenCodeEvent;
  } catch {
    return null;
  }
}
