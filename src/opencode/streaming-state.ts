import type { Api } from "grammy";
import type { OpenCodeEvent, MessagePartDeltaEvent, SessionIdleEvent } from "./events.js";

const THROTTLE_MS = 500;

type TurnState = {
  chatId: number;
  messageId: number;
  buffer: string;
  lastEditAt: number;
};

export class StreamingStateManager {
  private sessions = new Map<number, string>();
  private busy = new Map<number, boolean>();
  // Exposed as non-private for test access via type assertion
  turns = new Map<string, TurnState>();

  getSession(chatId: number): string | undefined {
    return this.sessions.get(chatId);
  }

  setSession(chatId: number, sessionId: string): void {
    this.sessions.set(chatId, sessionId);
  }

  isBusy(chatId: number): boolean {
    return this.busy.get(chatId) === true;
  }

  startTurn(sessionId: string, chatId: number, messageId: number): void {
    this.busy.set(chatId, true);
    this.turns.set(sessionId, {
      chatId,
      messageId,
      buffer: "",
      lastEditAt: Date.now(),
    });
  }

  endTurn(sessionId: string): void {
    const turn = this.turns.get(sessionId);
    if (turn) {
      this.busy.set(turn.chatId, false);
      this.turns.delete(sessionId);
    }
  }

  async endAllTurnsWithError(api: Api, errorText: string): Promise<void> {
    const edits: Promise<unknown>[] = [];
    for (const [sessionId, turn] of this.turns.entries()) {
      this.busy.set(turn.chatId, false);
      edits.push(
        api.editMessageText(turn.chatId, turn.messageId, errorText).catch(() => {})
      );
      this.turns.delete(sessionId);
    }
    await Promise.all(edits);
  }

  handleEvent(event: OpenCodeEvent, bot: Api): void {
    if (event.type === "message.part.delta") {
      const { sessionID, field, delta } = (event as MessagePartDeltaEvent).properties;
      if (field !== "text" || !delta) return;

      const turn = this.turns.get(sessionID);
      if (!turn) return;

      turn.buffer += delta;

      const now = Date.now();
      if (now - turn.lastEditAt >= THROTTLE_MS) {
        turn.lastEditAt = now;
        const interim = `⏳ Thinking...\n\n${turn.buffer}`;
        bot
          .editMessageText(turn.chatId, turn.messageId, interim)
          .catch(() => {});
      }
      return;
    }

    if (event.type === "session.idle") {
      const { sessionID } = (event as SessionIdleEvent).properties;
      const turn = this.turns.get(sessionID);
      if (!turn) return;

      const finalText = turn.buffer || "(empty response)";
      const { chatId, messageId } = turn;
      // endTurn BEFORE editMessageText to prevent race with throttled edits
      this.endTurn(sessionID);

      bot
        .editMessageText(chatId, messageId, finalText)
        .catch(() => {});
    }
  }
}
