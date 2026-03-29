import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createStream } from "rotating-file-stream";
import pino from "pino";

const logsDir = path.join(process.cwd(), "logs");
fs.mkdirSync(logsDir, { recursive: true });

/** Daily-rotating JSON log files under `logs/` (e.g. `app-2026-03-29.log`). */
const fileStream = createStream(
  (time) => {
    if (!time) return "app.log";
    const d = typeof time === "number" ? new Date(time) : time;
    return `app-${d.toISOString().slice(0, 10)}.log`;
  },
  { interval: "1d", path: logsDir },
);

const isProd = process.env.NODE_ENV === "production";

/** Human-readable console in dev; structured JSON on stdout in production. `pino-pretty` is dev-only. */
const stdoutStream = isProd
  ? process.stdout
  : createRequire(import.meta.url)("pino-pretty")({ colorize: true });

export const logger = pino(
  { level: process.env.LOG_LEVEL ?? "info" },
  pino.multistream([
    { level: "info", stream: stdoutStream },
    { level: "info", stream: fileStream },
  ]),
);
