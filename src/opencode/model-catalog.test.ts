import { describe, it, expect } from "vitest";
import { buildFlatSelectableModelRefs } from "./model-catalog.js";
import type { ConfigProvidersPayload } from "./config.js";

const fixture: ConfigProvidersPayload = {
  providers: [
    {
      id: "anthropic",
      name: "Anthropic",
      models: {
        "claude-sonnet-4": {
          id: "claude-sonnet-4",
          providerID: "anthropic",
          name: "Claude Sonnet 4",
          status: "active",
        },
        "claude-opus-4": {
          id: "claude-opus-4",
          providerID: "anthropic",
          name: "Claude Opus 4",
          status: "active",
        },
      },
    },
    {
      id: "openai",
      name: "OpenAI",
      models: {
        "gpt-4o": { id: "gpt-4o", providerID: "openai", name: "GPT-4o", status: "active" },
      },
    },
  ],
  default: { anthropic: "claude-sonnet-4" },
};

describe("buildFlatSelectableModelRefs", () => {
  it("returns deterministic provider order, per-provider key sort, and full refs", () => {
    const golden: string[] = [
      "anthropic/claude-opus-4",
      "anthropic/claude-sonnet-4",
      "openai/gpt-4o",
    ];
    expect(buildFlatSelectableModelRefs(fixture)).toEqual(golden);
  });
});
