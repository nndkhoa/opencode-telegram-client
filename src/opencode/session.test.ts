import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSession, sendPromptAsync, abortSession } from "./session.js";

describe("createSession", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("POSTs to /session and returns the session id", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "ses_abc123", slug: "tidy-river" }),
    } as Response);

    const id = await createSession("http://localhost:4096");
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:4096/session",
      expect.objectContaining({ method: "POST" })
    );
    expect(id).toBe("ses_abc123");
  });

  it("throws if POST /session returns non-2xx", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 503,
    } as Response);

    await expect(createSession("http://localhost:4096")).rejects.toThrow(
      "POST /session failed: HTTP 503"
    );
  });
});

describe("sendPromptAsync", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("POSTs to /session/:id/prompt_async with parts payload", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 204,
    } as Response);

    await sendPromptAsync("http://localhost:4096", "ses_abc123", "Hello");
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:4096/session/ses_abc123/prompt_async",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ parts: [{ type: "text", text: "Hello" }] }),
      })
    );
  });

  it("throws if prompt_async returns non-2xx and non-204", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);

    await expect(
      sendPromptAsync("http://localhost:4096", "ses_abc123", "Hello")
    ).rejects.toThrow("prompt_async failed: HTTP 500");
  });

  it("resolves successfully on 204 No Content", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 204,
    } as Response);

    await expect(
      sendPromptAsync("http://localhost:4096", "ses_abc123", "Hello")
    ).resolves.toBeUndefined();
  });
});

describe("abortSession", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("POSTs to /session/:id/abort", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
    } as Response);

    await abortSession("http://localhost:4096", "sess-abc");
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:4096/session/sess-abc/abort",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("resolves on 200", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200 } as Response);
    await expect(abortSession("http://localhost:4096", "sess-abc")).resolves.toBeUndefined();
  });

  it("resolves on 404 (session already gone)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 404 } as Response);
    await expect(abortSession("http://localhost:4096", "sess-abc")).resolves.toBeUndefined();
  });

  it("throws on non-ok, non-404 response (e.g. 500)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500 } as Response);
    await expect(abortSession("http://localhost:4096", "sess-abc")).rejects.toThrow(
      "abort failed: HTTP 500"
    );
  });
});
