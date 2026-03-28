import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { startSseLoop } from "./sse.js";

function makeStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    async pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i++]));
      } else {
        controller.close();
      }
    },
  });
}

function makeHangingStream(signal: AbortSignal): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      signal.addEventListener("abort", () => controller.close(), { once: true });
    },
  });
}

describe("startSseLoop", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("delivers parsed event to onEvent callback", async () => {
    const onEvent = vi.fn();
    const ac = new AbortController();

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(makeStream(['data: {"type":"message.part.delta","properties":{"sessionID":"s1","contentID":"c1","part":{"type":"text","text":"hello"}}}\n\n']), {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );

    startSseLoop({ baseUrl: "http://localhost:4096", signal: ac.signal, onEvent });
    await new Promise((r) => setTimeout(r, 50));

    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "message.part.delta" }),
    );
    ac.abort();
  });

  it("reconnects after stream error (attempt increment observable)", async () => {
    let callCount = 0;
    const ac = new AbortController();

    vi.mocked(fetch).mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new Error("simulated disconnect"));
            },
          }),
          { status: 200, headers: { "content-type": "text/event-stream" } },
        );
      }
      // Second call: hang until aborted
      return new Response(makeHangingStream(ac.signal), {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    });

    const loopPromise = startSseLoop({
      baseUrl: "http://localhost:4096",
      signal: ac.signal,
      onEvent: vi.fn(),
    });

    // Wait longer than the ~1000ms base backoff
    await new Promise((r) => setTimeout(r, 1200));
    expect(callCount).toBeGreaterThanOrEqual(2);

    ac.abort();
    await loopPromise.catch(() => {});
  }, 10000);

  it("stops the loop when signal is aborted", async () => {
    let callCount = 0;
    const ac = new AbortController();

    vi.mocked(fetch).mockImplementation(async () => {
      callCount++;
      return new Response(makeHangingStream(ac.signal), {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    });

    const loopPromise = startSseLoop({
      baseUrl: "http://localhost:4096",
      signal: ac.signal,
    });

    await new Promise((r) => setTimeout(r, 50));
    ac.abort();
    await loopPromise.catch(() => {});

    expect(callCount).toBe(1);
  });
});
