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

describe("parseEnv — BOT_MODE / WEBHOOK fields", () => {
  const base = {
    BOT_TOKEN: "abc123",
    ALLOWED_USER_IDS: "123456",
  };

  it("defaults botMode to 'dev' when BOT_MODE is not set", () => {
    const cfg = parseEnv(base);
    expect(cfg.botMode).toBe("dev");
  });

  it("defaults webhookUrl to undefined when BOT_MODE=dev", () => {
    const cfg = parseEnv(base);
    expect(cfg.webhookUrl).toBeUndefined();
  });

  it("defaults webhookPort to 3000", () => {
    const cfg = parseEnv(base);
    expect(cfg.webhookPort).toBe(3000);
  });

  it("accepts BOT_MODE=dev explicitly", () => {
    const cfg = parseEnv({ ...base, BOT_MODE: "dev" });
    expect(cfg.botMode).toBe("dev");
  });

  it("accepts BOT_MODE=pro with WEBHOOK_URL and WEBHOOK_PORT", () => {
    const cfg = parseEnv({
      ...base,
      BOT_MODE: "pro",
      WEBHOOK_URL: "https://example.com/bot",
      WEBHOOK_PORT: "8080",
    });
    expect(cfg.botMode).toBe("pro");
    expect(cfg.webhookUrl).toBe("https://example.com/bot");
    expect(cfg.webhookPort).toBe(8080);
  });

  it("throws when BOT_MODE=pro but WEBHOOK_URL is missing", () => {
    expect(() => parseEnv({ ...base, BOT_MODE: "pro" })).toThrow(
      "WEBHOOK_URL is required when BOT_MODE=pro"
    );
  });

  it("throws when BOT_MODE has an invalid value", () => {
    expect(() => parseEnv({ ...base, BOT_MODE: "bad" })).toThrow();
  });

  it("parses WEBHOOK_PORT as a positive integer", () => {
    const cfg = parseEnv({
      ...base,
      BOT_MODE: "pro",
      WEBHOOK_URL: "https://example.com/bot",
      WEBHOOK_PORT: "4000",
    });
    expect(cfg.webhookPort).toBe(4000);
  });
});
