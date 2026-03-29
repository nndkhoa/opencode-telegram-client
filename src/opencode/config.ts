import { logOpenCodeHttpError, logOpenCodeHttpOk } from "./http-log.js";

export type ProviderModel = {
  id: string;
  providerID: string;
  name: string;
  status: string;
};

export type ProviderInfo = {
  id: string;
  name: string;
  models: Record<string, ProviderModel>;
};

/** Normalized from GET /config/providers (OpenCode returns `{ providers, default }`). */
export type ConfigProvidersPayload = {
  providers: ProviderInfo[];
  default: Record<string, string>;
};

function isProviderInfo(value: unknown): value is ProviderInfo {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === "string" && typeof v.name === "string";
}

function normalizeConfigProvidersPayload(data: unknown): ConfigProvidersPayload {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return { providers: [], default: {} };
  }
  const obj = data as Record<string, unknown>;
  if (Array.isArray(obj.providers)) {
    const providers = obj.providers.filter(isProviderInfo);
    const def = obj.default;
    const defaultMap =
      def !== null && typeof def === "object" && !Array.isArray(def)
        ? Object.fromEntries(
            Object.entries(def as Record<string, unknown>).filter(
              (e): e is [string, string] => typeof e[1] === "string"
            )
          )
        : {};
    return { providers, default: defaultMap };
  }
  const legacyProviders = Object.values(obj).filter(isProviderInfo);
  return { providers: legacyProviders, default: {} };
}

export type OpenCodeConfig = {
  model?: string;
};

function readAgentModelBlock(sub: unknown): string | undefined {
  if (sub === null || typeof sub !== "object" || Array.isArray(sub)) return undefined;
  const m = (sub as Record<string, unknown>).model;
  return typeof m === "string" && m.trim() ? m.trim() : undefined;
}

/**
 * Reads `model` from GET /config JSON: top-level `model`, then `agent.<name>.model`
 * (OpenCode often leaves top-level unset while `agent.build.model` is set).
 */
/**
 * Splits `provider/model-id` (first `/`) into OpenCode prompt body `model` fields.
 * Returns undefined if the ref is not in `provider/model` form.
 */
export function parseModelRefToBodyModel(ref: string): { providerID: string; modelID: string } | undefined {
  const trimmed = ref.trim();
  const i = trimmed.indexOf("/");
  if (i <= 0 || i === trimmed.length - 1) return undefined;
  const providerID = trimmed.slice(0, i);
  const modelID = trimmed.slice(i + 1);
  if (!providerID || !modelID) return undefined;
  return { providerID, modelID };
}

export function extractConfiguredModel(cfg: unknown): string | undefined {
  if (cfg === null || typeof cfg !== "object") return undefined;
  const o = cfg as Record<string, unknown>;
  const top = o.model;
  if (typeof top === "string" && top.trim()) return top.trim();

  const agent = o.agent;
  if (agent === null || typeof agent !== "object" || Array.isArray(agent)) return undefined;
  const a = agent as Record<string, unknown>;
  const priority = ["build", "plan", "title", "summary", "compaction", "general", "explore"] as const;
  for (const key of priority) {
    const m = readAgentModelBlock(a[key]);
    if (m) return m;
  }
  for (const key of Object.keys(a).sort()) {
    if ((priority as readonly string[]).includes(key)) continue;
    const m = readAgentModelBlock(a[key]);
    if (m) return m;
  }
  return undefined;
}

/** `providerId/modelId` list from GET /config/providers `default` map (when global model is unset). */
export function defaultModelRefsFromPayload(payload: ConfigProvidersPayload): string[] {
  return Object.entries(payload.default)
    .filter(([, mid]) => typeof mid === "string" && mid.trim().length > 0)
    .map(([pid, mid]) => {
      const m = mid.trim();
      return m.includes("/") ? m : `${pid}/${m}`;
    })
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export async function patchConfig(baseUrl: string, model: string): Promise<void> {
  const url = new URL("/config", baseUrl).toString();
  let res: Response;
  try {
    res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
    });
  } catch (err) {
    logOpenCodeHttpError({ err, method: "PATCH", url });
    throw err;
  }
  if (res.status === 400) throw new Error("unknown_model");
  if (!res.ok) {
    const err = new Error(`PATCH /config failed: HTTP ${res.status}`);
    logOpenCodeHttpError({ err, method: "PATCH", url });
    throw err;
  }
  logOpenCodeHttpOk({ method: "PATCH", url });
}

export async function getConfigProviders(baseUrl: string): Promise<ConfigProvidersPayload> {
  const url = new URL("/config/providers", baseUrl).toString();
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    logOpenCodeHttpError({ err, method: "GET", url });
    throw err;
  }
  if (!res.ok) {
    const err = new Error(`GET /config/providers failed: HTTP ${res.status}`);
    logOpenCodeHttpError({ err, method: "GET", url });
    throw err;
  }
  logOpenCodeHttpOk({ method: "GET", url });
  return normalizeConfigProvidersPayload(await res.json());
}

export async function getConfig(baseUrl: string): Promise<OpenCodeConfig> {
  const url = new URL("/config", baseUrl).toString();
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    logOpenCodeHttpError({ err, method: "GET", url });
    throw err;
  }
  if (!res.ok) {
    const err = new Error(`GET /config failed: HTTP ${res.status}`);
    logOpenCodeHttpError({ err, method: "GET", url });
    throw err;
  }
  logOpenCodeHttpOk({ method: "GET", url });
  return (await res.json()) as OpenCodeConfig;
}
