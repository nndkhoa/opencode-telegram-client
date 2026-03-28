import type { Api } from "grammy";
import type { OpenCodeEvent, MessagePartDeltaEvent, SessionIdleEvent } from "./events.js";
import { renderFinalMessage } from "../rendering/markdown.js";
import type { SessionRegistry } from "../session/registry.js";

const THROTTLE_MS = 500;

export type TurnState = {
  chatId: number;
  messageId: number;
  buffer: string;
  lastEditAt: number;
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export class StreamingStateManager {
  private busy = new Map<number, boolean>();
  // Exposed as non-private for test access via type assertion
  turns = new Map<string, TurnState>();

  constructor(private registry: SessionRegistry) {}

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

  getTurn(sessionId: string): TurnState | undefined {
    return this.turns.get(sessionId);
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

  async handleEvent(event: OpenCodeEvent, bot: Api): Promise<void> {
    if (event.type === "message.part.delta") {
      const { sessionID, field, delta } = (event as MessagePartDeltaEvent).properties;
      if (field !== "text" || !delta) return;

      const turn = this.turns.get(sessionID);
      if (!turn) return;

      turn.buffer += delta;

      const now = Date.now();
      if (now - turn.lastEditAt >= THROTTLE_MS) {
        turn.lastEditAt = now;
        const interim = `⏳ Thinking...\n\n${escapeHtml(turn.buffer)}`;
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

      const rawBuffer = turn.buffer;
      const { chatId, messageId } = turn;
      // endTurn BEFORE async work to prevent race with throttled edits
      this.endTurn(sessionID);

      const chunks = renderFinalMessage(rawBuffer);

      // Send first chunk by editing the interim message
      try {
        await bot.editMessageText(chatId, messageId, chunks[0], { parse_mode: "HTML" });
      } catch {
        // D-08: HTML rejected — retry with plain escaped text (no parse_mode)
        const fallback = escapeHtml(rawBuffer || "(empty response)").slice(0, 4096);
        bot.editMessageText(chatId, messageId, fallback).catch(() => {});
        return;
      }

      // Send subsequent chunks as new messages
      for (const chunk of chunks.slice(1)) {
        await bot.sendMessage(chatId, chunk, { parse_mode: "HTML" });
      }
    }
  }
}
