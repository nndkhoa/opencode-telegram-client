import { logger } from "../logger.js";
import { parseEvent, type OpenCodeEvent } from "./events.js";

export type SseOptions = {
  baseUrl: string;
  signal: AbortSignal;
  onEvent?: (event: OpenCodeEvent) => void;
  onError?: (err: unknown) => void | Promise<void>;
};

const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 60_000;
const BACKOFF_JITTER = 0.2;

function backoffDelay(attempt: number): number {
  const base = Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_MAX_MS);
  const jitter = base * BACKOFF_JITTER * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(base + jitter));
}

async function readSseStream(
  res: Response,
  signal: AbortSignal,
  onEvent: ((event: OpenCodeEvent) => void) | undefined,
): Promise<void> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      const lines = buf.split("\n");
      buf = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data) continue;
        const event = parseEvent(data);
        if (event) {
          const props = "properties" in event ? event.properties : undefined;
          logger.debug(
            { eventType: event.type, sessionID: (props as { sessionID?: string } | undefined)?.sessionID },
            "SSE event received",
          );
          onEvent?.(event);
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

export async function startSseLoop(opts: SseOptions): Promise<void> {
  const { baseUrl, signal, onEvent, onError } = opts;
  const url = new URL("/event", baseUrl).toString();
  let attempt = 0;

  while (!signal.aborted) {
    try {
      logger.info({ url, attempt }, "SSE connecting");
      const res = await fetch(url, {
        signal,
        headers: { Accept: "text/event-stream" },
      });

      if (!res.ok) {
        throw new Error(`SSE open failed: HTTP ${res.status}`);
      }
      if (!res.body) {
        throw new Error("SSE response has no body");
      }

      attempt = 0;
      logger.info({ url }, "SSE connected");
      await readSseStream(res, signal, onEvent);
      if (!signal.aborted) {
        logger.warn({ url }, "SSE connection closed by server");
      }
    } catch (err) {
      if (signal.aborted) break;
      if (onError) {
        await Promise.resolve(onError(err)).catch(() => {});
      }
      const delay = backoffDelay(attempt);
      attempt++;
      logger.warn({ err, delay, attempt }, `SSE disconnected — reconnecting in ${delay}ms`);
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, delay);
        signal.addEventListener("abort", () => {
          clearTimeout(t);
          reject(new DOMException("Aborted", "AbortError"));
        }, { once: true });
      }).catch(() => {/* aborted during wait — outer loop condition will break */});
    }
  }

  logger.info({ url }, "SSE loop stopped (signal aborted)");
}
