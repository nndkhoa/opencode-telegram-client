import { logger } from "../logger.js";

export function openCodePathname(urlStr: string): string {
  try {
    return new URL(urlStr).pathname;
  } catch {
    return urlStr;
  }
}

export function logOpenCodeHttpOk(args: {
  method: string;
  url: string;
  sessionId?: string;
}): void {
  logger.info(
    {
      method: args.method,
      path: openCodePathname(args.url),
      ...(args.sessionId !== undefined ? { sessionId: args.sessionId } : {}),
    },
    "OpenCode HTTP",
  );
}

export function logOpenCodeHttpError(args: {
  err: unknown;
  method: string;
  url: string;
  sessionId?: string;
}): void {
  logger.error(
    {
      err: args.err,
      method: args.method,
      path: openCodePathname(args.url),
      ...(args.sessionId !== undefined ? { sessionId: args.sessionId } : {}),
    },
    "OpenCode HTTP error",
  );
}
