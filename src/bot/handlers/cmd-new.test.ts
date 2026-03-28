import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeCmdNewHandler } from "./cmd-new.js";
import type { SessionRegistry } from "../../session/registry.js";

vi.mock("../../opencode/session.js", () => ({
  createSession: vi.fn(),
}));

import { createSession } from "../../opencode/session.js";

function makeMockRegistry(): SessionRegistry {
  return {
    getActiveSessionId: vi.fn(),
    getActiveName: vi.fn(),
    getOrCreateDefault: vi.fn(),
    createNamed: vi.fn(),
    switchTo: vi.fn(),
    hasNamed: vi.fn().mockReturnValue(false),
    getNamedId: vi.fn(),
    list: vi.fn(),
  } as unknown as SessionRegistry;
}

function makeCtx(match: string = "", chatId = 100) {
  return {
    chat: { id: chatId },
    match: match as string | undefined,
    reply: vi.fn().mockResolvedValue({}),
  };
}

describe("makeCmdNewHandler", () => {
  let registry: SessionRegistry;
  const openCodeUrl = "http://localhost:4096";

  beforeEach(() => {
    registry = makeMockRegistry();
    vi.mocked(createSession).mockResolvedValue("ses_abc123");
    vi.clearAllMocks();
    registry = makeMockRegistry();
    vi.mocked(createSession).mockResolvedValue("ses_abc123");
  });

  describe("valid name — creates and switches session", () => {
    it("calls createSession and createNamed, replies with success", async () => {
      const ctx = makeCtx("my-project");
      const handler = makeCmdNewHandler(registry, openCodeUrl);
      await handler(ctx as never);

      expect(createSession).toHaveBeenCalledWith(openCodeUrl);
      expect(registry.createNamed).toHaveBeenCalledWith(100, "my-project", "ses_abc123");
      expect(ctx.reply).toHaveBeenCalledWith('✅ Created and switched to session "my-project".');
    });

    it("normalizes uppercase name to lowercase before check", async () => {
      const ctx = makeCtx("My-Project");
      const handler = makeCmdNewHandler(registry, openCodeUrl);
      await handler(ctx as never);

      expect(registry.hasNamed).toHaveBeenCalledWith(100, "my-project");
      expect(registry.createNamed).toHaveBeenCalledWith(100, "my-project", "ses_abc123");
      expect(ctx.reply).toHaveBeenCalledWith('✅ Created and switched to session "my-project".');
    });
  });

  describe("D-05: no argument — timestamp-based name", () => {
    it("creates session with session-<timestamp> name when no arg provided", async () => {
      const ctx = makeCtx("");
      const handler = makeCmdNewHandler(registry, openCodeUrl);
      await handler(ctx as never);

      expect(createSession).toHaveBeenCalledWith(openCodeUrl);
      const call = vi.mocked(registry.createNamed).mock.calls[0];
      expect(call[0]).toBe(100);
      expect(call[1]).toMatch(/^session-\d+$/);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringMatching(/^✅ Created and switched to session "session-\d+"\./)
      );
    });

    it("works when ctx.match is undefined", async () => {
      const ctx = { chat: { id: 100 }, match: undefined, reply: vi.fn().mockResolvedValue({}) };
      const handler = makeCmdNewHandler(registry, openCodeUrl);
      await handler(ctx as never);

      expect(createSession).toHaveBeenCalled();
    });
  });

  describe("D-04: duplicate name — error, no createSession", () => {
    it("replies with error and does not call createSession if name already exists", async () => {
      vi.mocked(registry.hasNamed).mockReturnValue(true);
      const ctx = makeCtx("my-project");
      const handler = makeCmdNewHandler(registry, openCodeUrl);
      await handler(ctx as never);

      expect(createSession).not.toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith(
        '❌ Session "my-project" already exists. Use /switch my-project to switch to it.'
      );
    });
  });

  describe("D-03: invalid name format — error", () => {
    it("replies with error for name with spaces", async () => {
      const ctx = makeCtx("invalid name!");
      const handler = makeCmdNewHandler(registry, openCodeUrl);
      await handler(ctx as never);

      expect(createSession).not.toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith(
        '❌ Invalid session name "invalid name!". Use only lowercase letters, digits, hyphens, underscores.'
      );
    });

    it("replies with error for name starting with hyphen", async () => {
      const ctx = makeCtx("-bad");
      const handler = makeCmdNewHandler(registry, openCodeUrl);
      await handler(ctx as never);

      expect(createSession).not.toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("❌ Invalid session name")
      );
    });
  });

  describe("OpenCode unreachable — error reply", () => {
    it("replies with error if createSession throws", async () => {
      vi.mocked(createSession).mockRejectedValueOnce(new Error("ECONNREFUSED"));
      const ctx = makeCtx("my-project");
      const handler = makeCmdNewHandler(registry, openCodeUrl);
      await handler(ctx as never);

      expect(ctx.reply).toHaveBeenCalledWith(
        "❌ OpenCode is unreachable. Make sure it's running at localhost:4096."
      );
    });
  });
});
