import "dotenv/config";
import { logger } from "../logger.js";
import { parseEnv } from "./parse-env.js";

export type { Config } from "./parse-env.js";
export { parseEnv } from "./parse-env.js";

let _config: ReturnType<typeof parseEnv>;
try {
  _config = parseEnv(process.env);
} catch (err) {
  logger.fatal({ err }, "Invalid configuration — fix env vars and restart");
  process.exit(1);
}
export const config = _config;
