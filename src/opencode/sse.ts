import { logger } from "../logger.js";
import { parseEvent, type OpenCodeEvent, type MessagePartDeltaEvent } from "./events.js";

/** Set `OPENCODE_SSE_VERBOSE=1` to log full parsed payloads at info (deep debug; default is eventType + sessionID only). */
function isOpenCodeSseVerbose(): boolean {
  const v = process.env.OPENCODE_SSE_VERBOSE;
  return v === "1" || /^true$/i.test(v ?? "");
}

const MAX_VERBOSE_DELTA_LOG_CHARS = 8_000;

/** OpenCode may emit frequent keep-alive JSON events — avoid info-level log spam. */
function shouldLogSseEventAtInfo(eventType: string): boolean {
  const t = eventType.toLowerCase();
  if (t === "heartbeat" || t === "ping" || t.endsWith(".heartbeat")) return false;
  return true;
}

/** Avoid huge log lines; keep structure for `message.part.delta`. */
function openCodeEventForVerboseLog(event: OpenCodeEvent): unknown {
  if (event.type !== "message.part.delta") return event;
  const p = (event as MessagePartDeltaEvent).properties;
  const d = p.delta ?? "";
  if (d.length <= MAX_VERBOSE_DELTA_LOG_CHARS) return event;
  return {
    type: event.type,
    properties: {
      ...p,
      delta: `${d.slice(0, MAX_VERBOSE_DELTA_LOG_CHARS)}… [+${d.length - MAX_VERBOSE_DELTA_LOG_CHARS} more chars]`,
    },
  };
}

export type SseOptions = {
  baseUrl: string;
  signal: AbortSignal;
  onEvent?: (event: OpenCodeEvent) => void | Promise<void>;
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
  onEvent: ((event: OpenCodeEvent) => void | Promise<void>) | undefined,
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
          const sessionID = (props as { sessionID?: string } | undefined)?.sessionID;
          if (shouldLogSseEventAtInfo(event.type)) {
            logger.info({ eventType: event.type, sessionID }, "OpenCode SSE event");
          }
          if (event.type === "message.part.delta") {
            logger.debug(
              {
                eventType: event.type,
                sessionID,
                field: (event as MessagePartDeltaEvent).properties.field,
                messageID: (event as MessagePartDeltaEvent).properties.messageID,
                partID: (event as MessagePartDeltaEvent).properties.partID,
                deltaChars: (event as MessagePartDeltaEvent).properties.delta?.length ?? 0,
              },
              "SSE delta detail",
            );
          }
          if (isOpenCodeSseVerbose() && shouldLogSseEventAtInfo(event.type)) {
            logger.info(
              {
                opencodeEvent: openCodeEventForVerboseLog(event),
                rawLineChars: data.length,
              },
              "OpenCode SSE (verbose)",
            );
          }
          await Promise.resolve(onEvent?.(event));
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
        const err = new Error(`SSE open failed: HTTP ${res.status}`);
        logger.error(
          { err, method: "GET", path: new URL(url).pathname },
          "OpenCode HTTP error",
        );
        throw err;
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
