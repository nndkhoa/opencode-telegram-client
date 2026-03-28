import { logger } from "../logger.js";

export type HealthResponse = {
  healthy: boolean;
  version: string;
};

export async function checkHealth(baseUrl: string): Promise<HealthResponse> {
  const url = new URL("/global/health", baseUrl).toString();
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`OpenCode health check failed: HTTP ${res.status} from ${url}`);
  }
  const body = (await res.json()) as HealthResponse;
  logger.info({ health: body }, "OpenCode health check passed");
  return body;
}
