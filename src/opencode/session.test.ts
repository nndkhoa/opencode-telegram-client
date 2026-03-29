import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../persist/last-model.js", () => ({
  getPersistedModelRef: vi.fn(() => undefined),
}));

import { getPersistedModelRef } from "../persist/last-model.js";
import {
  createSession,
  sendPromptAsync,
  sendPromptAsyncWithPhoto,
  abortSession,
} from "./session.js";

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
    vi.mocked(getPersistedModelRef).mockReturnValue(undefined);
  });

  it("POSTs to /session/:id/prompt_async with parts payload", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as Response);

    await sendPromptAsync("http://localhost:4096", "ses_abc123", "Hello");
    expect(fetch).toHaveBeenNthCalledWith(1, "http://localhost:4096/config");
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "http://localhost:4096/session/ses_abc123/prompt_async",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ parts: [{ type: "text", text: "Hello" }] }),
      })
    );
  });

  it("uses persisted /model ref on prompt_async without GET /config", async () => {
    vi.mocked(getPersistedModelRef).mockReturnValue("github-copilot/gpt-5-mini");
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 204,
    } as Response);

    await sendPromptAsync("http://localhost:4096", "ses_abc123", "Hello");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:4096/session/ses_abc123/prompt_async",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          parts: [{ type: "text", text: "Hello" }],
          model: { providerID: "github-copilot", modelID: "gpt-5-mini" },
        }),
      })
    );
  });

  it("includes model on prompt_async when GET /config exposes provider/model", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ model: "github-copilot/gpt-5-mini" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as Response);

    await sendPromptAsync("http://localhost:4096", "ses_abc123", "Hello");
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "http://localhost:4096/session/ses_abc123/prompt_async",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          parts: [{ type: "text", text: "Hello" }],
          model: { providerID: "github-copilot", modelID: "gpt-5-mini" },
        }),
      })
    );
  });

  it("throws if prompt_async returns non-2xx and non-204", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response);

    await expect(
      sendPromptAsync("http://localhost:4096", "ses_abc123", "Hello")
    ).rejects.toThrow("prompt_async failed: HTTP 500");
  });

  it("resolves successfully on 204 No Content", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 204,
      } as Response);

    await expect(
      sendPromptAsync("http://localhost:4096", "ses_abc123", "Hello")
    ).resolves.toBeUndefined();
  });
});

describe("sendPromptAsyncWithPhoto", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.mocked(getPersistedModelRef).mockReturnValue(undefined);
  });

  it("POSTs a single file part (data URL) and no text part — no caption in JSON (D-02)", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as Response);

    const buf = Buffer.from([0xff, 0xd8, 0xff]);
    await sendPromptAsyncWithPhoto("http://localhost:4096", "ses_x", buf, "image/jpeg", {
      filename: "photo.jpg",
    });

    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "http://localhost:4096/session/ses_x/prompt_async",
      expect.objectContaining({ method: "POST" })
    );
    const raw = vi.mocked(fetch).mock.calls[1]![1] as { body: string };
    const body = JSON.parse(raw.body) as {
      parts: Array<{ type: string; mime?: string; url?: string; text?: string; filename?: string }>;
    };
    expect(body.parts).toHaveLength(1);
    expect(body.parts[0]).toMatchObject({
      type: "file",
      mime: "image/jpeg",
      filename: "photo.jpg",
    });
    expect(body.parts[0].url).toMatch(/^data:image\/jpeg;base64,/);
    expect(body.parts.some((p) => p.type === "text")).toBe(false);
    expect(JSON.stringify(body).toLowerCase()).not.toContain("caption");
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
