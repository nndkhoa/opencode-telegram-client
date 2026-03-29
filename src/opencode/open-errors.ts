/**
 * Extract a user-facing string from OpenCode structured errors (SSE `session.error`, assistant `error`, etc.).
 * Aligns with anomalyco/opencode SDK error shapes in `types.gen.ts`.
 */
export function extractOpenCodeErrorMessage(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as { name?: string; data?: unknown };
  const data = e.data;
  if (!data || typeof data !== "object") return undefined;
  const d = data as Record<string, unknown>;

  if (typeof d.message === "string" && d.message.trim()) {
    let msg = d.message.trim();
    if (e.name === "APIError" && typeof d.responseBody === "string" && d.responseBody.trim()) {
      msg = `${msg}\n\n${d.responseBody.trim().slice(0, 1500)}`;
    }
    return msg;
  }

  return undefined;
}
