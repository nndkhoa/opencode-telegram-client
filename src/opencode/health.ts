import { logger } from "../logger.js";
import { logOpenCodeHttpError, openCodePathname } from "./http-log.js";

export type HealthResponse = {
  healthy: boolean;
  version: string;
};

export async function checkHealth(baseUrl: string): Promise<HealthResponse> {
  const url = new URL("/global/health", baseUrl).toString();
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    logOpenCodeHttpError({ err, method: "GET", url });
    throw err;
  }
  if (!res.ok) {
    const err = new Error(`OpenCode health check failed: HTTP ${res.status} from ${url}`);
    logOpenCodeHttpError({ err, method: "GET", url });
    throw err;
  }
  const body = (await res.json()) as HealthResponse;
  logger.info(
    { method: "GET", path: openCodePathname(url), healthy: body.healthy, version: body.version },
    "OpenCode HTTP",
  );
  return body;
}
