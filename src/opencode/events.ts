export type BaseEvent = {
  type: string;
  sessionID?: string;
};

// Known event types encountered in Phase 1 (extend in later phases)
export type OpenCodeEvent =
  | { type: "session.created"; sessionID: string; [key: string]: unknown }
  | { type: "session.deleted"; sessionID: string; [key: string]: unknown }
  | { type: "part.delta"; sessionID: string; [key: string]: unknown }
  | { type: "part.updated"; sessionID: string; [key: string]: unknown }
  | { type: string; sessionID?: string; [key: string]: unknown }; // catch-all

export function parseEvent(raw: string): OpenCodeEvent | null {
  try {
    return JSON.parse(raw) as OpenCodeEvent;
  } catch {
    return null;
  }
}
