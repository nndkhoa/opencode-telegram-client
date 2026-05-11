import type { Api } from "grammy";
import type {
  OpenCodeEvent,
  MessagePartDeltaEvent,
  MessagePartUpdatedEvent,
  SessionIdleEvent,
  SessionNextTextDeltaEvent,
  SessionNextReasoningDeltaEvent,
} from "./events.js";
import {
  isSessionDeleted,
  isMessageUpdated,
  getSessionDeletedId,
  getMessageUpdatedPayload,
} from "./events.js";
import {
  appendHtmlFooterToChunks,
  renderFinalMessage,
  telegramHtmlToFallbackPlain,
} from "../rendering/markdown.js";
import {
  formatAssistantFooterHtml,
  resolveAssistantFooterLines,
  fetchLastAssistantMessage,
  fetchMessageTextById,
  type AssistantFooterInfo,
} from "./assistant-meta.js";
import type { SessionRegistry } from "../session/registry.js";
import type { PendingInteractiveState } from "./interactive-pending.js";
import { extractOpenCodeErrorMessage } from "./open-errors.js";
import { logger } from "../logger.js";

const THROTTLE_MS = 500;
const MAX_TELEGRAM_ERROR_BODY = 3800;

/** Extract text content from message parts for out-of-band delivery. */
function extractTextFromParts(
  parts?: Array<{ type: string; text?: string; [key: string]: unknown }>
): string {
  if (!parts) return "";
  return parts
    .filter((p) => p.type === "text" && typeof p.text === "string" && p.text.trim() !== "")
    .map((p) => p.text as string)
    .join("\n\n");
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
  /**
   * Promise of the most recently dispatched fire-and-forget interim edit.
   * session.idle awaits this before sending the final edit so an in-flight
   * interim cannot overwrite the final HTML message.
   */
  pendingInterimEdit: Promise<unknown>;
  /**
   * Footer info cached from `message.updated` SSE events (role=assistant).
   * Populated as soon as OpenCode emits model/agent info during streaming,
   * so session.idle can use it directly without an extra HTTP round-trip.
   */
  footerInfo: AssistantFooterInfo | null;
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
  /**
   * Track message IDs already forwarded to Telegram for out-of-band delivery
   * so that repeated message.updated events for the same message don't duplicate.
   * Scoped per session to allow cleanup when sessions are deleted.
   */
  private deliveredMessageIdsBySession = new Map<string, Set<string>>();

  constructor(
    private registry: SessionRegistry,
    private openCodeUrl: string,
    private pending: PendingInteractiveState
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
      pendingInterimEdit: Promise.resolve(),
      footerInfo: null,
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
    // ── session.deleted / session.deleted.1 ─────────────────────────────────
    if (isSessionDeleted(event)) {
      const sessionID = getSessionDeletedId(event);
      const chatId = this.pending.getChatForSession(sessionID);

      // If there was an active turn, end it with an error message
      const turn = this.turns.get(sessionID);
      if (turn && chatId !== undefined) {
        await this.finishTurnWithOpenCodeError(
          bot,
          sessionID,
          "Session was deleted by the OpenCode server."
        );
      } else if (turn) {
        this.endTurn(sessionID);
      }

      // Clean up registry and pending state
      if (chatId !== undefined) {
        // Only notify the user if this was their currently active session.
        // If the user already switched away (e.g. via /new or /switch), deleting
        // an inactive background session is silent — no confusing notification.
        const isActive = this.registry.getActiveSessionId(chatId) === sessionID;
        this.registry.removeSession(chatId, sessionID);
        logger.info({ sessionID, chatId, wasActive: isActive }, "session.deleted — removed from registry");

        if (isActive) {
          await bot
            .sendMessage(
              chatId,
              "⚠️ <b>Session deleted</b>\n\nThis session was deleted by the OpenCode server. A new session will be created automatically when you send your next message.",
              { parse_mode: "HTML" }
            )
            .catch((err) =>
              logger.warn({ err, chatId, sessionID }, "Failed to send session.deleted notification")
            );
        }
      } else {
        logger.warn({ sessionID }, "session.deleted — no chatId found in pending state, skipping registry cleanup");
      }

      // Always clean up pending interactive state and delivered message tracking
      this.pending.forgetSession(sessionID);
      this.deliveredMessageIdsBySession.delete(sessionID);
      this.partKindsBySession.delete(sessionID);
      return;
    }

    // ── message.part.updated / message.part.updated.1 ────────────────────────
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

    // ── session.error ─────────────────────────────────────────────────────────
    if (event.type === "session.error") {
      const props = (event as { properties?: { sessionID?: string; error?: unknown } }).properties;
      const sessionID = props?.sessionID;
      if (!sessionID) return;
      const msg = extractOpenCodeErrorMessage(props?.error);
      if (!msg) return;
      await this.finishTurnWithOpenCodeError(bot, sessionID, msg);
      return;
    }

    // ── message.updated / message.updated.1 ──────────────────────────────────
    if (isMessageUpdated(event)) {
      const { sessionID, info } = getMessageUpdatedPayload(event);

      const activeTurn = this.turns.get(sessionID);

      if (activeTurn) {
        // ── Active turn path: cache footer info and detect errors ────────────
        if (info.role === "assistant") {
          const err = info.error;
          if (err !== undefined) {
            const msg = extractOpenCodeErrorMessage(err);
            if (msg) {
              await this.finishTurnWithOpenCodeError(bot, sessionID, msg);
              return;
            }
          }
          // Cache model/agent from assistant message.updated so session.idle
          // can build the footer without an extra HTTP round-trip.
          if (info.modelID) {
            const modelRef = info.providerID
              ? `${info.providerID}/${info.modelID}`
              : info.modelID;
            const rawAgent = typeof info.agent === "string" ? info.agent.trim() : "";
            const rawMode = typeof info.mode === "string" ? info.mode.trim() : "";
            const agentLabel = rawAgent || rawMode || "—";
            activeTurn.footerInfo = { modelRef, agentLabel };
          }
        }
      } else {
        // ── Out-of-band path: message arrived without an active turn ─────────
        // Only deliver each message once (message.updated can fire multiple times)
        const messageId = info.id;
        if (!messageId) return;

        let delivered = this.deliveredMessageIdsBySession.get(sessionID);
        if (!delivered) {
          delivered = new Set();
          this.deliveredMessageIdsBySession.set(sessionID, delivered);
        }
        if (delivered.has(messageId)) return;

        const chatId = this.pending.getChatForSession(sessionID);
        if (chatId === undefined) {
          logger.debug({ sessionID, messageId }, "message.updated (out-of-band) — no chatId, skipping");
          return;
        }

        if (info.role === "assistant") {
          // Assistant messages are delivered exclusively via session.idle (out-of-band).
          // message.updated fires for every agent step (finish=stop), causing duplicates
          // if we forward here too. Only forward errors — content waits for session.idle.
          if (info.error !== undefined) {
            const msg = extractOpenCodeErrorMessage(info.error);
            if (msg) {
              delivered.add(messageId);
              await bot
                .sendMessage(chatId, `❌ ${escapeHtml(msg)}`, { parse_mode: "HTML" })
                .catch((err) => logger.warn({ err, chatId, sessionID }, "Failed to send out-of-band error"));
            }
          }
          return;
        } else if (info.role === "user") {
          // OpenCode emits trailing message.updated (with summary field) for the user message
          // after every turn completes — even for messages sent by this bot via prompt_async.
          // Only the initial event (no summary) represents a genuinely new webUI message.
          if ("summary" in info && info.summary !== undefined) return;

          // SSE message.updated never includes parts — fetch text via HTTP
          const text = await fetchMessageTextById(this.openCodeUrl, sessionID, messageId);
          if (!text) return;

          delivered.add(messageId);
          logger.info({ chatId, sessionID, messageId }, "message.updated (out-of-band user) — forwarding to Telegram");

          const preview = text.length > 300 ? `${text.slice(0, 300)}…` : text;
          await bot
            .sendMessage(
              chatId,
              `<i>[Message from another client]</i>\n${escapeHtml(preview)}`,
              { parse_mode: "HTML" }
            )
            .catch((err) => logger.warn({ err, chatId, sessionID }, "Failed to send out-of-band user message"));
        }
      }
      return;
    }

    // ── session.next.text.delta (new-style, v1.14+) ──────────────────────────
    if (event.type === "session.next.text.delta") {
      const { sessionID, delta } = (event as SessionNextTextDeltaEvent).properties;
      if (!delta) return;
      const turn = this.turns.get(sessionID);
      if (!turn) return;
      turn.buffer += delta;
      const now = Date.now();
      if (now - turn.lastEditAt >= THROTTLE_MS) {
        turn.lastEditAt = now;
        const interim = formatInterimStreamingMessage(turn.thinkingBuffer, turn.buffer);
        turn.pendingInterimEdit = bot
          .editMessageText(turn.chatId, turn.messageId, interim)
          .catch(() => {});
      }
      return;
    }

    // ── session.next.reasoning.delta (new-style, v1.14+) ─────────────────────
    if (event.type === "session.next.reasoning.delta") {
      const { sessionID, delta } = (event as SessionNextReasoningDeltaEvent).properties;
      if (!delta) return;
      const turn = this.turns.get(sessionID);
      if (!turn) return;
      turn.thinkingBuffer += delta;
      const now = Date.now();
      if (now - turn.lastEditAt >= THROTTLE_MS) {
        turn.lastEditAt = now;
        const interim = formatInterimStreamingMessage(turn.thinkingBuffer, turn.buffer);
        turn.pendingInterimEdit = bot
          .editMessageText(turn.chatId, turn.messageId, interim)
          .catch(() => {});
      }
      return;
    }

    // ── message.part.delta (legacy, kept for backward compat) ────────────────
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
        turn.pendingInterimEdit = bot
          .editMessageText(turn.chatId, turn.messageId, interim)
          .catch(() => {});
      }
      return;
    }

    // ── session.idle ──────────────────────────────────────────────────────────
    if (event.type === "session.idle") {
      const { sessionID } = (event as SessionIdleEvent).properties;
      const turn = this.turns.get(sessionID);

      if (!turn) {
        // Out-of-band: message was created from webUI (no active Telegram turn).
        // Fetch the last assistant message via HTTP and forward to Telegram.
        const chatId = this.pending.getChatForSession(sessionID);
        if (chatId === undefined) {
          logger.debug({ sessionID }, "session.idle (out-of-band) — no chatId, skipping");
          return;
        }

        let delivered = this.deliveredMessageIdsBySession.get(sessionID);
        if (!delivered) {
          delivered = new Set();
          this.deliveredMessageIdsBySession.set(sessionID, delivered);
        }

        const msg = await fetchLastAssistantMessage(this.openCodeUrl, sessionID);
        if (!msg) {
          logger.debug({ sessionID, chatId }, "session.idle (out-of-band) — no assistant message found");
          return;
        }

        if (delivered.has(msg.id)) {
          logger.debug({ sessionID, chatId, messageId: msg.id }, "session.idle (out-of-band) — already delivered");
          return;
        }

        delivered.add(msg.id);
        logger.info({ chatId, sessionID, messageId: msg.id }, "session.idle (out-of-band) — forwarding assistant message to Telegram");

        const footerHtml = formatAssistantFooterHtml(msg.footerInfo.modelRef, msg.footerInfo.agentLabel);
        let chunks = renderFinalMessage(msg.text);
        chunks = appendHtmlFooterToChunks(chunks, footerHtml);

        try {
          await bot.sendMessage(chatId, chunks[0]!, { parse_mode: "HTML" });
        } catch (err) {
          logger.warn({ err, chatId, sessionID }, "session.idle (out-of-band) — HTML send failed, falling back to plain");
          const sep = "\n\n";
          const maxPlain = Math.max(0, 4096 - sep.length - footerHtml.length);
          const plainText = (msg.text || "(empty response)").slice(0, maxPlain);
          const fallback = `${escapeHtml(plainText)}${sep}${footerHtml}`;
          await bot.sendMessage(chatId, fallback, { parse_mode: "HTML" }).catch((err2) => {
            logger.error({ err: err2, chatId, sessionID }, "session.idle (out-of-band) — fallback send also failed");
          });
          return;
        }

        for (const chunk of chunks.slice(1)) {
          await bot.sendMessage(chatId, chunk, { parse_mode: "HTML" });
        }
        logger.info({ chatId, sessionID, messageId: msg.id, chunks: chunks.length }, "session.idle (out-of-band) — all chunks sent");
        return;
      }

      const rawBuffer = stripReasoningArtifactsFromAnswer(turn.buffer);
      const { chatId, messageId, pendingInterimEdit } = turn;
      // endTurn BEFORE async work to prevent new throttled edits from being scheduled
      this.endTurn(sessionID);

      // Await any in-flight interim edit so it cannot overwrite the final HTML message
      await pendingInterimEdit;

      // Use footer info cached from SSE message.updated events (zero HTTP cost).
      // Fall back to HTTP only when the cache is empty (e.g. very short turns where
      // message.updated with modelID arrived after session.idle).
      const { modelRef, agentLabel } =
        turn.footerInfo ?? (await resolveAssistantFooterLines(this.openCodeUrl, sessionID));
      const footerHtml = formatAssistantFooterHtml(modelRef, agentLabel);
      let chunks = renderFinalMessage(rawBuffer);
      chunks = appendHtmlFooterToChunks(chunks, footerHtml);

      // Send first chunk by editing the interim message
      try {
        await bot.editMessageText(chatId, messageId, chunks[0]!, { parse_mode: "HTML" });
        logger.info({ chatId, messageId, sessionID, chunks: chunks.length }, "Final message sent (HTML)");
      } catch (err) {
        logger.warn({ err, chatId, messageId, sessionID }, "Final HTML edit rejected — falling back to plain");
        // D-08: HTML rejected — retry with body as escaped HTML + same italic footer as success path.
        const sep = "\n\n";
        const maxPlain = Math.max(0, 4096 - sep.length - footerHtml.length);
        const rendered = renderFinalMessage(rawBuffer || "(empty response)");
        const plainFirst = telegramHtmlToFallbackPlain(rendered[0] ?? "(empty response)").slice(
          0,
          maxPlain
        );
        const bodyHtml = escapeHtml(plainFirst);
        let fallback = `${bodyHtml}${sep}${footerHtml}`;
        if (fallback.length > 4096) {
          fallback = fallback.slice(0, 4096);
        }
        try {
          await bot.editMessageText(chatId, messageId, fallback, { parse_mode: "HTML" });
          logger.info({ chatId, messageId, sessionID }, "Final message sent (plain fallback)");
        } catch (err2) {
          logger.error({ err: err2, chatId, messageId, sessionID }, "Final fallback edit also failed");
        }
        return;
      }

      // Send subsequent chunks as new messages
      for (const chunk of chunks.slice(1)) {
        await bot.sendMessage(chatId, chunk, { parse_mode: "HTML" });
      }
      logger.info({ chatId, messageId, sessionID, extraChunks: chunks.length - 1 }, "All chunks sent");
    }
  }
}
