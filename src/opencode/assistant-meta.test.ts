import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./display-model.js", () => ({
  resolveDisplayModel: vi.fn(),
}));

import { resolveDisplayModel } from "./display-model.js";
import {
  fetchLastAssistantFooterInfo,
  formatAssistantFooterHtml,
  resolveAssistantFooterLines,
} from "./assistant-meta.js";

describe("assistant-meta", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(resolveDisplayModel).mockReset();
  });

  it("fetchLastAssistantFooterInfo returns latest assistant from tail of list", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => [
        { info: { role: "user", agent: "x" } },
        {
          info: {
            role: "assistant",
            providerID: "anthropic",
            modelID: "claude-sonnet-4",
            agent: "build",
          },
        },
      ],
    } as Response);

    await expect(fetchLastAssistantFooterInfo("http://localhost:4096", "s1")).resolves.toEqual({
      modelRef: "anthropic/claude-sonnet-4",
      agentLabel: "build",
    });
  });

  it("fetchLastAssistantFooterInfo uses mode when agent empty", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => [
        {
          info: {
            role: "assistant",
            providerID: "openai",
            modelID: "gpt-4o",
            agent: "",
            mode: "plan",
          },
        },
      ],
    } as Response);

    await expect(fetchLastAssistantFooterInfo("http://x", "s1")).resolves.toEqual({
      modelRef: "openai/gpt-4o",
      agentLabel: "plan",
    });
  });

  it("resolveAssistantFooterLines falls back to resolveDisplayModel when no assistant rows", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => [] } as Response);
    vi.mocked(resolveDisplayModel).mockResolvedValue({ kind: "resolved", ref: "p/q" });

    await expect(resolveAssistantFooterLines("http://x", "s1")).resolves.toEqual({
      modelRef: "p/q",
      agentLabel: "—",
    });
  });

  it("formatAssistantFooterHtml escapes HTML", () => {
    expect(formatAssistantFooterHtml("a/b", "x")).toBe("<em>a/b · x</em>");
    expect(formatAssistantFooterHtml("<x>", "a&b")).toBe("<em>&lt;x&gt; · a&amp;b</em>");
  });
});
