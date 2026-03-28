import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the fetchEventSource module before importing sse.ts
vi.mock("@microsoft/fetch-event-source", () => ({
  fetchEventSource: vi.fn(),
}));

import { fetchEventSource } from "@microsoft/fetch-event-source";
import { startSseLoop } from "./sse.js";

const mockFetch = fetchEventSource as ReturnType<typeof vi.fn>;

describe("backoffDelay (internal logic)", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("reconnects after stream error (attempt increment observable via log)", async () => {
    let callCount = 0;
    const ac = new AbortController();
    mockFetch.mockImplementation(async (_url: string, opts: { onopen: Function; onerror: Function; signal: AbortSignal }) => {
      callCount++;
      if (callCount === 1) {
        // First call: simulate error after open
        await opts.onopen({ ok: true, status: 200 });
        throw new Error("simulated disconnect");
      }
      // Second call: wait until aborted so the test can check callCount
      return new Promise<void>((resolve) => {
        opts.signal?.addEventListener("abort", () => resolve(), { once: true });
      });
    });

    const loopPromise = startSseLoop({
      baseUrl: "http://localhost:4096",
      signal: ac.signal,
      onEvent: vi.fn(),
    });

    // Wait for reconnect attempt (backoff ~1000ms base)
    await new Promise((r) => setTimeout(r, 1200));
    expect(callCount).toBeGreaterThanOrEqual(2);

    ac.abort();
    await loopPromise.catch(() => {});
  }, 10000);

  it("delivers parsed event to onEvent callback", async () => {
    const onEvent = vi.fn();
    mockFetch.mockImplementation(async (_url: string, opts: { onopen: Function; onmessage: Function }) => {
      await opts.onopen({ ok: true, status: 200 });
      opts.onmessage({ data: '{"type":"part.delta","sessionID":"session-1"}', id: "", event: "" });
      return new Promise(() => {}); // hang
    });

    const ac = new AbortController();
    startSseLoop({ baseUrl: "http://localhost:4096", signal: ac.signal, onEvent });

    await new Promise((r) => setTimeout(r, 50));
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "part.delta", sessionID: "session-1" })
    );
    ac.abort();
  });

  it("stops the loop when signal is aborted", async () => {
    let callCount = 0;
    const ac = new AbortController();
    mockFetch.mockImplementation(async (_url: string, opts: { signal: AbortSignal }) => {
      callCount++;
      // Resolve when the signal is aborted so fetchEventSource doesn't hang
      return new Promise<void>((resolve) => {
        opts.signal?.addEventListener("abort", () => resolve(), { once: true });
      });
    });

    const loopPromise = startSseLoop({
      baseUrl: "http://localhost:4096",
      signal: ac.signal,
    });

    await new Promise((r) => setTimeout(r, 50));
    ac.abort();
    await loopPromise.catch(() => {});

    // Should have only attempted once — abort before reconnect
    expect(callCount).toBe(1);
  });
});
