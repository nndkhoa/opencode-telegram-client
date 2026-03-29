/**
 * OpenCode HTTP clients for interactive question/permission replies.
 * Paths: POST /question/{requestID}/reply, POST /permission/{requestID}/reply
 */

export type QuestionReplyBody = {
  /** One string[] per sub-question, in question order (SDK QuestionAnswer[]). */
  answers: string[][];
};

export type PermissionReplyBody = {
  reply: "once" | "always" | "reject";
  message?: string;
};

export async function postQuestionReply(
  openCodeUrl: string,
  requestID: string,
  body: QuestionReplyBody
): Promise<void> {
  const url = new URL(
    `/question/${encodeURIComponent(requestID)}/reply`,
    openCodeUrl
  ).toString();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers: body.answers }),
  });
  if (!res.ok) {
    throw new Error(`POST /question/${requestID}/reply failed: HTTP ${res.status}`);
  }
}

export async function postPermissionReply(
  openCodeUrl: string,
  requestID: string,
  body: PermissionReplyBody
): Promise<void> {
  const url = new URL(
    `/permission/${encodeURIComponent(requestID)}/reply`,
    openCodeUrl
  ).toString();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`POST /permission/${requestID}/reply failed: HTTP ${res.status}`);
  }
}
