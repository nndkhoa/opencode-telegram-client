export async function createSession(baseUrl: string): Promise<string> {
  const res = await fetch(new URL("/session", baseUrl).toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`POST /session failed: HTTP ${res.status}`);
  const data = (await res.json()) as { id: string };
  return data.id;
}

export async function sendPromptAsync(
  baseUrl: string,
  sessionId: string,
  text: string
): Promise<void> {
  const url = new URL(`/session/${sessionId}/prompt_async`, baseUrl).toString();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      parts: [{ type: "text", text }],
    }),
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`prompt_async failed: HTTP ${res.status}`);
  }
}

export async function abortSession(baseUrl: string, sessionId: string): Promise<void> {
  const url = new URL(`/session/${sessionId}/abort`, baseUrl).toString();
  const res = await fetch(url, { method: "POST" });
  if (!res.ok && res.status !== 404) {
    throw new Error(`abort failed: HTTP ${res.status}`);
  }
}
