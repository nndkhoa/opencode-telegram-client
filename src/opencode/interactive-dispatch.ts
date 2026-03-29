import { InlineKeyboard } from "grammy";
import type { Api } from "grammy";
import { logger } from "../logger.js";
import type { SessionRegistry } from "../session/registry.js";
import {
  getSessionIdFromAsked,
  isPermissionAsked,
  isPermissionReplied,
  isQuestionAsked,
  isQuestionRejected,
  isQuestionReplied,
  type OpenCodeEvent,
  type PermissionAskedEvent,
  type QuestionAskedEvent,
  type QuestionInfo,
} from "./events.js";
import { PendingInteractiveState } from "./interactive-pending.js";

/** D-07: options per keyboard page before Next/Prev (Telegram UX + callback limits). */
export const QUESTION_OPTIONS_PAGE_SIZE = 8;

export type InteractiveDispatchDeps = {
  registry: SessionRegistry;
  pending: PendingInteractiveState;
};

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

/**
 * D-11: active session gate — exposed for tests.
 * Uses registry.getActiveSessionId (same rule as PendingInteractiveState.shouldHandleForChat).
 */
export function shouldDispatchForSession(
  chatId: number,
  eventSessionId: string,
  registry: SessionRegistry
): boolean {
  const active = registry.getActiveSessionId(chatId);
  if (active === undefined) return false;
  return eventSessionId === active;
}

async function deletePriorPromptMessage(
  api: Api,
  chatId: number,
  pending: PendingInteractiveState
): Promise<void> {
  const prev = pending.get(chatId);
  const mid = prev?.telegramMessageId;
  if (mid === undefined) return;
  await api.deleteMessage(chatId, mid).catch(() => {});
}

async function sendPermissionPrompt(
  api: Api,
  chatId: number,
  event: PermissionAskedEvent,
  pending: PendingInteractiveState
): Promise<void> {
  const { id: requestID, sessionID, permission, patterns } = event.properties;

  await deletePriorPromptMessage(api, chatId, pending);

  const tOnce = pending.registerCallbackToken(chatId, "permission", "p:once");
  const tAlways = pending.registerCallbackToken(chatId, "permission", "p:always");
  const tReject = pending.registerCallbackToken(chatId, "permission", "p:reject");

  const kb = new InlineKeyboard()
    .text("Once", tOnce)
    .text("Always", tAlways)
    .text("Reject", tReject);

  const lines = [
    "🔐 Permission required",
    "",
    truncate(permission, 3500),
    patterns.length ? `\nPatterns:\n${patterns.map((p) => `• ${p}`).join("\n")}` : "",
  ];
  const text = lines.filter(Boolean).join("\n");

  const sent = await api.sendMessage(chatId, text, { reply_markup: kb });
  pending.rememberSessionChat(sessionID, chatId);
  pending.setPermissionAsked(chatId, {
    requestID,
    sessionID,
    telegramMessageId: sent.message_id,
  });
}

/**
 * Build / refresh inline keyboard for the single-question keyboard path (D-05–D-07).
 * Used by SSE send path and callback_query edits.
 */
export function buildQuestionKeyboardForChat(
  pending: PendingInteractiveState,
  chatId: number
): { text: string; reply_markup: InlineKeyboard } | undefined {
  const rec = pending.get(chatId);
  if (!rec || rec.kind !== "question" || !rec.questionInfos?.length) return undefined;
  const q0 = rec.questionInfos[0];
  if (!q0 || !q0.options.length) return undefined;

  const offset = rec.optionsPageOffset;
  const options = q0.options;
  const page = options.slice(offset, offset + QUESTION_OPTIONS_PAGE_SIZE);
  const hasPrev = offset > 0;
  const hasNext = offset + QUESTION_OPTIONS_PAGE_SIZE < options.length;

  const kb = new InlineKeyboard();
  const qi = 0;

  if (q0.multiple) {
    for (let i = 0; i < page.length; i++) {
      const globalIdx = offset + i;
      const opt = page[i]!;
      const sel = rec.selectedOptionIndicesByQuestion.get(qi)?.has(globalIdx) ?? false;
      const prefix = sel ? "✓ " : "☐ ";
      const token = pending.registerCallbackToken(
        chatId,
        "question",
        "q:toggle",
        `${qi}:${globalIdx}`
      );
      kb.text(`${prefix}${truncate(opt.label, 28)}`, token).row();
    }
    const sub = pending.registerCallbackToken(chatId, "question", "q:submit", "");
    kb.text("✅ Submit", sub).row();
  } else {
    for (let i = 0; i < page.length; i++) {
      const globalIdx = offset + i;
      const opt = page[i]!;
      const token = pending.registerCallbackToken(
        chatId,
        "question",
        "q:pick",
        `${qi}:${globalIdx}`
      );
      kb.text(truncate(opt.label, 36), token).row();
    }
  }

  if (hasPrev || hasNext) {
    if (hasPrev) {
      const tp = pending.registerCallbackToken(chatId, "question", "q:page", "prev");
      kb.text("« Prev", tp);
    }
    if (hasNext) {
      const tn = pending.registerCallbackToken(chatId, "question", "q:page", "next");
      kb.text("Next »", tn);
    }
  }

  const header = q0.header ? `${q0.header}\n\n` : "";
  const body = truncate(q0.question, 3000);
  const text = `❓ ${header}${body}`;

  return { text, reply_markup: kb };
}

async function sendQuestionWithKeyboard(
  api: Api,
  chatId: number,
  event: QuestionAskedEvent,
  pending: PendingInteractiveState
): Promise<void> {
  const { id: requestID, sessionID, questions } = event.properties;

  await deletePriorPromptMessage(api, chatId, pending);

  pending.setQuestionAsked(chatId, {
    requestID,
    sessionID,
    questionInfos: questions,
    selectedOptionIndicesByQuestion: new Map(),
    optionsPageOffset: 0,
    awaitingFreeText: false,
  });

  const built = buildQuestionKeyboardForChat(pending, chatId);
  if (!built) return;

  const sent = await api.sendMessage(chatId, built.text, { reply_markup: built.reply_markup });
  pending.rememberSessionChat(sessionID, chatId);
  pending.setTelegramMessageId(chatId, sent.message_id);
}

async function sendQuestionPlainAwaitingText(
  api: Api,
  chatId: number,
  event: QuestionAskedEvent,
  pending: PendingInteractiveState,
  body: string
): Promise<void> {
  const { id: requestID, sessionID, questions } = event.properties;

  await deletePriorPromptMessage(api, chatId, pending);

  const sent = await api.sendMessage(chatId, body);
  pending.rememberSessionChat(sessionID, chatId);
  pending.setQuestionAsked(chatId, {
    requestID,
    sessionID,
    telegramMessageId: sent.message_id,
    questionInfos: questions,
    awaitingFreeText: true,
  });
}

function hasUsableSingleQuestionKeyboard(questions: QuestionInfo[]): boolean {
  if (questions.length !== 1) return false;
  return questions[0]!.options.length > 0;
}

/**
 * Fan-out from SSE: after StreamingStateManager.handleEvent, routes question/permission
 * and lifecycle events to Telegram + pending state (D-10, D-11).
 */
export async function dispatchInteractiveOpenCodeEvent(
  event: OpenCodeEvent,
  api: Api,
  deps: InteractiveDispatchDeps
): Promise<void> {
  const { registry, pending } = deps;

  if (isQuestionReplied(event)) {
    const { sessionID, requestID } = event.properties;
    const chatId = pending.getChatForSession(sessionID);
    if (chatId !== undefined) pending.clearOnQuestionReplied(chatId, requestID);
    return;
  }

  if (isQuestionRejected(event)) {
    const { sessionID, requestID } = event.properties;
    const chatId = pending.getChatForSession(sessionID);
    if (chatId !== undefined) pending.clearOnQuestionRejected(chatId, requestID);
    return;
  }

  if (isPermissionReplied(event)) {
    const { sessionID, requestID } = event.properties;
    const chatId = pending.getChatForSession(sessionID);
    if (chatId !== undefined) pending.clearOnPermissionReplied(chatId, requestID);
    return;
  }

  if (isQuestionAsked(event)) {
    const sessionID = getSessionIdFromAsked(event);
    const chatId = pending.getChatForSession(sessionID);
    if (chatId === undefined) {
      logger.debug({ sessionID }, "question.asked — no Telegram chat mapped yet; skip");
      return;
    }
    if (!pending.shouldHandleForChat(chatId, sessionID, registry)) {
      logger.debug({ chatId, sessionID }, "question.asked — not active session; skip");
      return;
    }
    const { questions } = event.properties;

    if (hasUsableSingleQuestionKeyboard(questions)) {
      await sendQuestionWithKeyboard(api, chatId, event, pending);
      return;
    }

    if (questions.length > 1) {
      const num = questions
        .map((q, i) => `${i + 1}. ${q.header ? `${q.header}: ` : ""}${q.question}`)
        .join("\n\n");
      const body = `❓ Multiple questions (reply with numbers per D-07 fallback until 05-03 submits):\n\n${truncate(num, 3800)}`;
      await sendQuestionPlainAwaitingText(api, chatId, event, pending, body);
      return;
    }

    const q0 = questions[0]!;
    const body = `❓ ${q0.header ? `${q0.header}\n\n` : ""}${truncate(q0.question, 3900)}\n\n_(Free-text answer — send your reply in 05-03.)_`;
    await sendQuestionPlainAwaitingText(api, chatId, event, pending, body);
    return;
  }

  if (isPermissionAsked(event)) {
    const sessionID = getSessionIdFromAsked(event);
    const chatId = pending.getChatForSession(sessionID);
    if (chatId === undefined) {
      logger.debug({ sessionID }, "permission.asked — no Telegram chat mapped yet; skip");
      return;
    }
    if (!pending.shouldHandleForChat(chatId, sessionID, registry)) {
      logger.debug({ chatId, sessionID }, "permission.asked — not active session; skip");
      return;
    }
    await sendPermissionPrompt(api, chatId, event, pending);
  }
}
