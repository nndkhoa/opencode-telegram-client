import { describe, it, expect } from "vitest";
import { parseEnv } from "./parse-env.js";

describe("parseEnv", () => {
  const valid = {
    BOT_TOKEN: "abc123",
    ALLOWED_USER_IDS: "123456,789012",
    OPENCODE_URL: "http://localhost:4096",
  };

  it("returns typed config from valid env", () => {
    const cfg = parseEnv(valid);
    expect(cfg.botToken).toBe("abc123");
    expect(cfg.openCodeUrl).toBe("http://localhost:4096");
    expect(cfg.allowedUserIds).toEqual(new Set([123456, 789012]));
  });

  it("defaults OPENCODE_URL to http://localhost:4096", () => {
    const cfg = parseEnv({ BOT_TOKEN: "tok", ALLOWED_USER_IDS: "1" });
    expect(cfg.openCodeUrl).toBe("http://localhost:4096");
  });

  it("throws when BOT_TOKEN is missing", () => {
    expect(() => parseEnv({ ALLOWED_USER_IDS: "1" })).toThrow();
  });

  it("throws when ALLOWED_USER_IDS is empty string", () => {
    expect(() => parseEnv({ BOT_TOKEN: "tok", ALLOWED_USER_IDS: "" })).toThrow();
  });

  it("throws when ALLOWED_USER_IDS contains non-numeric value", () => {
    expect(() => parseEnv({ BOT_TOKEN: "tok", ALLOWED_USER_IDS: "abc" })).toThrow();
  });

  it("parses comma-separated user IDs into Set", () => {
    const cfg = parseEnv({ BOT_TOKEN: "tok", ALLOWED_USER_IDS: "100,200,300" });
    expect(cfg.allowedUserIds).toEqual(new Set([100, 200, 300]));
  });
});
