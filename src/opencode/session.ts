import { extractConfiguredModel, getConfig, parseModelRefToBodyModel } from "./config.js";
import { logger } from "../logger.js";
import { getPersistedModelRef } from "../persist/last-model.js";
import { logOpenCodeHttpError, openCodePathname } from "./http-log.js";

/**
 * Resolves `model` for `POST .../prompt_async` from persisted ref or GET /config.
 * Shape matches OpenAPI `SessionPromptAsyncData.body.model` (see GET /doc, `FilePartInput` / `TextPartInput`).
 */
async function resolveModelForPromptBody(
  baseUrl: string
): Promise<{ providerID: string; modelID: string } | undefined> {
  let ref: string | undefined = getPersistedModelRef();
  if (!ref) {
    try {
      const cfg = await getConfig(baseUrl);
      ref = extractConfiguredModel(cfg);
    } catch (err) {
      logger.warn({ err }, "GET /config failed before prompt_async — sending prompt without model");
    }
  }
  if (!ref) return undefined;
  return parseModelRefToBodyModel(ref);
}

export async function createSession(baseUrl: string): Promise<string> {
  const url = new URL("/session", baseUrl).toString();
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  } catch (err) {
    logOpenCodeHttpError({ err, method: "POST", url });
    throw err;
  }
  if (!res.ok) {
    const err = new Error(`POST /session failed: HTTP ${res.status}`);
    logOpenCodeHttpError({ err, method: "POST", url });
    throw err;
  }
  const data = (await res.json()) as { id: string };
  logger.info(
    { method: "POST", path: openCodePathname(url), sessionId: data.id },
    "OpenCode HTTP",
  );
  return data.id;
}

export async function sendPromptAsync(
  baseUrl: string,
  sessionId: string,
  text: string
): Promise<void> {
  const model = await resolveModelForPromptBody(baseUrl);

  const url = new URL(`/session/${sessionId}/prompt_async`, baseUrl).toString();
  const body: Record<string, unknown> = {
    parts: [{ type: "text", text }],
  };
  if (model) {
    body.model = model;
  }
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    logOpenCodeHttpError({ err, method: "POST", url, sessionId });
    throw err;
  }
  if (!res.ok && res.status !== 204) {
    const err = new Error(`prompt_async failed: HTTP ${res.status}`);
    logOpenCodeHttpError({ err, method: "POST", url, sessionId });
    throw err;
  }
  logger.info({ method: "POST", path: openCodePathname(url), sessionId }, "OpenCode HTTP");
}

/**
 * Sends a photo (or any file bytes) via `prompt_async` with a single **file** part — no text part (D-02: ignore caption).
 * OpenAPI `FilePartInput` (GET /doc → `SessionPromptAsyncData.body.parts`): `type: "file"`, `mime`, optional `filename`,
 * `url` (required). Inline bytes use a **data URL** (`data:<mime>;base64,...`).
 */
export async function sendPromptAsyncWithPhoto(
  baseUrl: string,
  sessionId: string,
  buffer: Buffer,
  mimeType: string,
  options?: { filename?: string }
): Promise<void> {
  const model = await resolveModelForPromptBody(baseUrl);
  const b64 = buffer.toString("base64");
  const dataUrl = `data:${mimeType};base64,${b64}`;
  const filePart: Record<string, unknown> = {
    type: "file",
    mime: mimeType,
    url: dataUrl,
  };
  if (options?.filename) {
    filePart.filename = options.filename;
  }

  const url = new URL(`/session/${sessionId}/prompt_async`, baseUrl).toString();
  const body: Record<string, unknown> = {
    parts: [filePart],
  };
  if (model) {
    body.model = model;
  }
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    logOpenCodeHttpError({ err, method: "POST", url, sessionId });
    throw err;
  }
  if (!res.ok && res.status !== 204) {
    const err = new Error(`prompt_async failed: HTTP ${res.status}`);
    logOpenCodeHttpError({ err, method: "POST", url, sessionId });
    throw err;
  }
  logger.info({ method: "POST", path: openCodePathname(url), sessionId }, "OpenCode HTTP");
}

export async function abortSession(baseUrl: string, sessionId: string): Promise<void> {
  const url = new URL(`/session/${sessionId}/abort`, baseUrl).toString();
  let res: Response;
  try {
    res = await fetch(url, { method: "POST" });
  } catch (err) {
    logOpenCodeHttpError({ err, method: "POST", url, sessionId });
    throw err;
  }
  if (!res.ok && res.status !== 404) {
    const err = new Error(`abort failed: HTTP ${res.status}`);
    logOpenCodeHttpError({ err, method: "POST", url, sessionId });
    throw err;
  }
  logger.info({ method: "POST", path: openCodePathname(url), sessionId }, "OpenCode HTTP");
}
