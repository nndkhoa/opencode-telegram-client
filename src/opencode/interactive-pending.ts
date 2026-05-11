import type { SessionRegistry } from "../session/registry.js";
import type { QuestionInfo } from "./events.js";

export type PendingKind = "question" | "permission";

/**
 * Single authoritative pending interactive prompt per Telegram chat (D-10).
 * Multi-select indices per sub-question (D-06); keyboard pagination offset (D-07).
 */
export type PendingInteractiveRecord = {
  kind: PendingKind;
  requestID: string;
  sessionID: string;
  telegramMessageId?: number;
  /** questionIndex -> selected option indices */
  selectedOptionIndicesByQuestion: Map<number, Set<number>>;
  optionsPageOffset: number;
  /** Open-ended or multi-question numbered fallback — submit in 05-03 */
  awaitingFreeText?: boolean;
  /** Snapshot for building answers[][] on submit */
  questionInfos?: QuestionInfo[];
};

/**
 * In-memory pending state for MCP questions/permissions (MCP-06 clear hooks).
 * Full Telegram wiring lives in later plans (05-02/05-03).
 */
export class PendingInteractiveState {
  private readonly byChat = new Map<number, PendingInteractiveRecord>();
  /** Reverse lookup: OpenCode sessionID → Telegram chat (for SSE routing). */
  private readonly sessionToChat = new Map<string, number>();
  private readonly callbackByToken = new Map<
    string,
    { chatId: number; kind: PendingKind; role: string; payload?: string }
  >();
  private seq = 0;

  /** Call whenever we know both IDs (message path, interactive sends). */
  rememberSessionChat(sessionID: string, chatId: number): void {
    this.sessionToChat.set(sessionID, chatId);
  }

  getChatForSession(sessionID: string): number | undefined {
    return this.sessionToChat.get(sessionID);
  }

  get(chatId: number): PendingInteractiveRecord | undefined {
    return this.byChat.get(chatId);
  }

  /** D-10: replaces any prior pending record for this chat. */
  setQuestionAsked(
    chatId: number,
    input: Omit<
      PendingInteractiveRecord,
      "kind" | "selectedOptionIndicesByQuestion" | "optionsPageOffset"
    > & {
      selectedOptionIndicesByQuestion?: Map<number, Set<number>>;
      optionsPageOffset?: number;
      awaitingFreeText?: boolean;
      questionInfos?: QuestionInfo[];
    }
  ): void {
    this.byChat.set(chatId, {
      kind: "question",
      requestID: input.requestID,
      sessionID: input.sessionID,
      telegramMessageId: input.telegramMessageId,
      selectedOptionIndicesByQuestion:
        input.selectedOptionIndicesByQuestion ?? new Map(),
      optionsPageOffset: input.optionsPageOffset ?? 0,
      awaitingFreeText: input.awaitingFreeText,
      questionInfos: input.questionInfos,
    });
  }

  /** D-10: replaces any prior pending record for this chat. */
  setPermissionAsked(
    chatId: number,
    input: Omit<
      PendingInteractiveRecord,
      "kind" | "selectedOptionIndicesByQuestion" | "optionsPageOffset"
    >
  ): void {
    this.byChat.set(chatId, {
      kind: "permission",
      requestID: input.requestID,
      sessionID: input.sessionID,
      telegramMessageId: input.telegramMessageId,
      selectedOptionIndicesByQuestion: new Map(),
      optionsPageOffset: 0,
    });
  }

  /**
   * D-11: handle only events for the chat's active OpenCode session.
   * When false, callers should log at debug and skip pending mutation.
   */
  shouldHandleForChat(
    chatId: number,
    eventSessionId: string,
    registry: SessionRegistry
  ): boolean {
    const active = registry.getActiveSessionId(chatId);
    if (active === undefined) return false;
    return eventSessionId === active;
  }

  /** MCP-02 / D-09: open-ended question — next plain text message is the answer (not a new prompt). */
  isAwaitingFreeTextAnswer(chatId: number): boolean {
    const p = this.byChat.get(chatId);
    return p?.kind === "question" && p.awaitingFreeText === true;
  }

  /** MCP-06 / lifecycle: drop all pending state for a chat. */
  clear(chatId: number): void {
    this.byChat.delete(chatId);
  }

  /**
   * Remove the reverse sessionID→chatId mapping when a session is deleted or
   * becomes stale. Prevents stale SSE events from being routed to the wrong chat.
   */
  forgetSession(sessionID: string): void {
    this.sessionToChat.delete(sessionID);
  }

  /** Clear if the pending question matches this requestID (after SSE or local submit). */
  clearOnQuestionReplied(chatId: number, requestID: string): void {
    const p = this.byChat.get(chatId);
    if (!p || p.kind !== "question") return;
    if (p.requestID === requestID) this.byChat.delete(chatId);
  }

  clearOnQuestionRejected(chatId: number, requestID: string): void {
    const p = this.byChat.get(chatId);
    if (!p || p.kind !== "question") return;
    if (p.requestID === requestID) this.byChat.delete(chatId);
  }

  clearOnPermissionReplied(chatId: number, requestID: string): void {
    const p = this.byChat.get(chatId);
    if (!p || p.kind !== "permission") return;
    if (p.requestID === requestID) this.byChat.delete(chatId);
  }

  setTelegramMessageId(chatId: number, telegramMessageId: number): void {
    const p = this.byChat.get(chatId);
    if (p) p.telegramMessageId = telegramMessageId;
  }

  setOptionsPageOffset(chatId: number, offset: number): void {
    const p = this.byChat.get(chatId);
    if (p) p.optionsPageOffset = offset;
  }

  /** D-06: toggle multi-select membership for an option index under a question index. */
  toggleQuestionOption(chatId: number, questionIndex: number, optionIndex: number): void {
    const p = this.byChat.get(chatId);
    if (!p || p.kind !== "question") return;
    let set = p.selectedOptionIndicesByQuestion.get(questionIndex);
    if (!set) {
      set = new Set<number>();
      p.selectedOptionIndicesByQuestion.set(questionIndex, set);
    }
    if (set.has(optionIndex)) set.delete(optionIndex);
    else set.add(optionIndex);
  }

  /**
   * Short opaque callback tokens for Telegram 64-byte callback_data (D-01–D-04).
   * role examples: "p:once" | "p:always" | "p:reject" | "q:opt:0:1"
   */
  registerCallbackToken(
    chatId: number,
    kind: PendingKind,
    role: string,
    payload?: string
  ): string {
    const token = `t${(++this.seq).toString(36)}`;
    this.callbackByToken.set(token, { chatId, kind, role, payload });
    return token;
  }

  resolveCallbackToken(token: string):
    | { chatId: number; kind: PendingKind; role: string; payload?: string }
    | undefined {
    return this.callbackByToken.get(token);
  }

  unregisterCallbackToken(token: string): void {
    this.callbackByToken.delete(token);
  }

  /**
   * Transition a keyboard-mode question to free-text mode (q:custom button).
   * Sets awaitingFreeText and updates the stored message ID to the new prompt message.
   */
  switchToFreeText(chatId: number, telegramMessageId: number): void {
    const p = this.byChat.get(chatId);
    if (!p || p.kind !== "question") return;
    p.awaitingFreeText = true;
    p.telegramMessageId = telegramMessageId;
  }
}
