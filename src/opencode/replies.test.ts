import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postPermissionReply, postQuestionReply } from "./replies.js";

describe("replies HTTP clients", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("postQuestionReply POSTs JSON answers to /question/{id}/reply", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    await postQuestionReply("http://localhost:4096", "req-q1", {
      answers: [["optA"], ["x", "y"]],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:4096/question/req-q1/reply");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual({
      answers: [["optA"], ["x", "y"]],
    });
  });

  it("postPermissionReply sends once", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    await postPermissionReply("http://127.0.0.1:4096/", "perm-1", {
      reply: "once",
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/permission/perm-1/reply");
    expect(JSON.parse(init.body as string)).toEqual({ reply: "once" });
  });

  it("postPermissionReply sends always and optional message", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    await postPermissionReply("http://localhost:4096", "p2", {
      reply: "always",
      message: "ok",
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      reply: "always",
      message: "ok",
    });
  });

  it("postPermissionReply sends reject", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    await postPermissionReply("http://localhost:4096", "p3", { reply: "reject" });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ reply: "reject" });
  });

  it("throws on non-OK response", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 400,
    } as Response);
    await expect(
      postQuestionReply("http://localhost:4096", "bad", { answers: [[]] })
    ).rejects.toThrow(/HTTP 400/);
  });
});
