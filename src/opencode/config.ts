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

export type OpenCodeConfig = {
  model?: string;
};

export async function patchConfig(baseUrl: string, model: string): Promise<void> {
  const res = await fetch(new URL("/config", baseUrl).toString(), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model }),
  });
  if (res.status === 400) throw new Error("unknown_model");
  if (!res.ok) throw new Error(`PATCH /config failed: HTTP ${res.status}`);
}

export async function getConfigProviders(baseUrl: string): Promise<Record<string, ProviderInfo>> {
  const res = await fetch(new URL("/config/providers", baseUrl).toString());
  if (!res.ok) throw new Error(`GET /config/providers failed: HTTP ${res.status}`);
  return (await res.json()) as Record<string, ProviderInfo>;
}

export async function getConfig(baseUrl: string): Promise<OpenCodeConfig> {
  const res = await fetch(new URL("/config", baseUrl).toString());
  if (!res.ok) throw new Error(`GET /config failed: HTTP ${res.status}`);
  return (await res.json()) as OpenCodeConfig;
}
