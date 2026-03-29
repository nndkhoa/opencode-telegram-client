import type { Api } from "grammy";
import type {
  OpenCodeEvent,
  MessagePartDeltaEvent,
  MessagePartUpdatedEvent,
  SessionIdleEvent,
} from "./events.js";
import {
  appendHtmlFooterToChunks,
  renderFinalMessage,
  telegramHtmlToFallbackPlain,
} from "../rendering/markdown.js";
import {
  formatAssistantFooterHtml,
  resolveAssistantFooterLines,
} from "./assistant-meta.js";
import type { SessionRegistry } from "../session/registry.js";
import { extractOpenCodeErrorMessage } from "./open-errors.js";

const THROTTLE_MS = 500;
const MAX_TELEGRAM_ERROR_BODY = 3800;

function tryGetMessageUpdated(
  event: OpenCodeEvent
): { sessionID: string; info: unknown } | undefined {
  if (event.type === "message.updated") {
    const p = (event as { properties?: { sessionID?: string; info?: unknown } }).properties;
    if (p?.sessionID && p.info !== undefined) return { sessionID: p.sessionID, info: p.info };
  }
  if (event.type === "message.updated.1") {
    const d = (event as { data?: { sessionID?: string; info?: unknown } }).data;
    if (d?.sessionID && d.info !== undefined) return { sessionID: d.sessionID, info: d.info };
  }
  return undefined;
}

/** OpenCode / LiteLLM may use `thinking` or SDK `reasoning_content` | `reasoning_details` (see types.gen.ts `interleaved.field`). */
const REASONING_DELTA_FIELDS = new Set([
  "thinking",
  "reasoning",
  "reasoning_content",
  "reasoning_details",
]);

type PartStreamKind = "reasoning" | "text";

/** OpenCode `Session.updatePartDelta` uses `field: "text"` for both reasoning and answer parts; part kind comes from `message.part.updated`. */
function tryGetPartUpdated(
  event: OpenCodeEvent
): { sessionID: string; partId: string; kind: PartStreamKind } | undefined {
  if (event.type !== "message.part.updated" && event.type !== "message.part.updated.1") {
    return undefined;
  }
  const raw = event as Record<string, unknown>;
  const payload = (raw.properties ?? raw.data) as
    | MessagePartUpdatedEvent["properties"]
    | { sessionID: string; part: { id: string; type: string } }
    | undefined;
  if (!payload?.part?.id || typeof payload.part.type !== "string") return undefined;
  const t = payload.part.type;
  if (t === "reasoning" || t === "text") {
    return { sessionID: payload.sessionID, partId: payload.part.id, kind: t };
  }
  return undefined;
}

/**
 * Some providers still stream reasoning inside the `text` field (e.g. `</think>` blocks).
 * Strip before final render so the delivered message is answer-only.
 */
function stripReasoningArtifactsFromAnswer(text: string): string {
  let s = text;
  // DeepSeek / MiniMax-style fenced reasoning (when it leaks into `text`)
  s = s.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "");
  s = s.replace(/<thinking\b[^>]*>[\s\S]*?<\/thinking>/gi, "");
  return s.replace(/\n{3,}/g, "\n\n").trim();
}

export type TurnState = {
  chatId: number;
  messageId: number;
  /** Assistant answer text (`message.part.delta` field `text`). */
  buffer: string;
  /** Reasoning deltas (`thinking`, `reasoning_*`, …); shown only while streaming, never in final. */
  thinkingBuffer: string;
  lastEditAt: number;
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Plain-text interim update: reasoning vs answer preview are labeled and escaped. */
function formatInterimStreamingMessage(thinking: string, text: string): string {
  const parts: string[] = ["⏳ …", ""];
  if (thinking.trim()) {
    parts.push("💭 Reasoning", escapeHtml(thinking), "");
  }
  parts.push("✍️ Answer", escapeHtml(text));
  return parts.join("\n");
}

export class StreamingStateManager {
  private busy = new Map<number, boolean>();
  /** Per OpenCode session: partID → stream kind (reasoning deltas share `field: "text"` with answer parts). */
  private partKindsBySession = new Map<string, Map<string, PartStreamKind>>();
  // Exposed as non-private for test access via type assertion
  turns = new Map<string, TurnState>();

  constructor(
    private registry: SessionRegistry,
    private openCodeUrl: string
  ) {}

  isBusy(chatId: number): boolean {
    return this.busy.get(chatId) === true;
  }

  startTurn(sessionId: string, chatId: number, messageId: number): void {
    this.busy.set(chatId, true);
    this.partKindsBySession.set(sessionId, new Map());
    this.turns.set(sessionId, {
      chatId,
      messageId,
      buffer: "",
      thinkingBuffer: "",
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

  private async finishTurnWithOpenCodeError(
    bot: Api,
    sessionId: string,
    errorMessage: string
  ): Promise<void> {
    const turn = this.turns.get(sessionId);
    if (!turn) return;
    const { chatId, messageId } = turn;
    this.endTurn(sessionId);
    const body =
      errorMessage.length > MAX_TELEGRAM_ERROR_BODY
        ? `${errorMessage.slice(0, MAX_TELEGRAM_ERROR_BODY)}…`
        : errorMessage;
    await bot.editMessageText(chatId, messageId, `❌ ${body}`).catch(() => {});
  }

  async handleEvent(event: OpenCodeEvent, bot: Api): Promise<void> {
    const partUpdated = tryGetPartUpdated(event);
    if (partUpdated) {
      let m = this.partKindsBySession.get(partUpdated.sessionID);
      if (!m) {
        m = new Map();
        this.partKindsBySession.set(partUpdated.sessionID, m);
      }
      m.set(partUpdated.partId, partUpdated.kind);
      return;
    }

    if (event.type === "session.error") {
      const props = (event as { properties?: { sessionID?: string; error?: unknown } }).properties;
      const sessionID = props?.sessionID;
      if (!sessionID) return;
      const msg = extractOpenCodeErrorMessage(props?.error);
      if (!msg) return;
      await this.finishTurnWithOpenCodeError(bot, sessionID, msg);
      return;
    }

    const messageUpdated = tryGetMessageUpdated(event);
    if (messageUpdated) {
      const info = messageUpdated.info;
      if (info && typeof info === "object" && info !== null && "role" in info) {
        const role = (info as { role: string }).role;
        const err = (info as { error?: unknown }).error;
        if (role === "assistant" && err !== undefined) {
          const msg = extractOpenCodeErrorMessage(err);
          if (msg) {
            await this.finishTurnWithOpenCodeError(bot, messageUpdated.sessionID, msg);
            return;
          }
        }
      }
    }

    if (event.type === "message.part.delta") {
      const { sessionID, partID, field, delta } = (event as MessagePartDeltaEvent).properties;
      if (!delta) return;

      const turn = this.turns.get(sessionID);
      if (!turn) return;

      if (REASONING_DELTA_FIELDS.has(field)) {
        turn.thinkingBuffer += delta;
      } else if (field === "text") {
        const kind = this.partKindsBySession.get(sessionID)?.get(partID);
        if (kind === "reasoning") {
          turn.thinkingBuffer += delta;
        } else {
          // kind === "text" or unknown (legacy tests / missed part.updated) → answer buffer
          turn.buffer += delta;
        }
      } else {
        return;
      }

      const now = Date.now();
      if (now - turn.lastEditAt >= THROTTLE_MS) {
        turn.lastEditAt = now;
        const interim = formatInterimStreamingMessage(turn.thinkingBuffer, turn.buffer);
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

      const rawBuffer = stripReasoningArtifactsFromAnswer(turn.buffer);
      const { chatId, messageId } = turn;
      // endTurn BEFORE async work to prevent race with throttled edits
      this.endTurn(sessionID);

      const { modelRef, agentLabel } = await resolveAssistantFooterLines(this.openCodeUrl, sessionID);
      const footerHtml = formatAssistantFooterHtml(modelRef, agentLabel);
      let chunks = renderFinalMessage(rawBuffer);
      chunks = appendHtmlFooterToChunks(chunks, footerHtml);

      // Send first chunk by editing the interim message
      try {
        await bot.editMessageText(chatId, messageId, chunks[0]!, { parse_mode: "HTML" });
      } catch {
        // D-08: HTML rejected — retry with body as escaped HTML + same italic footer as success path.
        const sep = "\n\n";
        const maxPlain = Math.max(0, 4096 - sep.length - footerHtml.length);
        const rendered = renderFinalMessage(rawBuffer || "(empty response)");
        const plainFirst = telegramHtmlToFallbackPlain(rendered[0] ?? "(empty response)").slice(
          0,
          maxPlain
        );
        const bodyHtml = escapeHtml(plainFirst).replace(/\n/g, "<br>");
        let fallback = `${bodyHtml}${sep}${footerHtml}`;
        if (fallback.length > 4096) {
          fallback = fallback.slice(0, 4096);
        }
        await bot.editMessageText(chatId, messageId, fallback, { parse_mode: "HTML" }).catch(() => {});
        return;
      }

      // Send subsequent chunks as new messages
      for (const chunk of chunks.slice(1)) {
        await bot.sendMessage(chatId, chunk, { parse_mode: "HTML" });
      }
    }
  }
}
