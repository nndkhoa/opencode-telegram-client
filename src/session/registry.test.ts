import { describe, it, expect, vi, beforeEach } from "vitest";
import { SessionRegistry } from "./registry.js";

vi.mock("../opencode/session.js", () => ({
  createSession: vi.fn(),
}));

import { createSession } from "../opencode/session.js";

const URL = "http://localhost:4096";

describe("SessionRegistry", () => {
  let registry: SessionRegistry;

  beforeEach(() => {
    registry = new SessionRegistry();
    vi.mocked(createSession).mockReset();
  });

  describe("getOrCreateDefault", () => {
    it("creates a default session on first call and returns its id", async () => {
      vi.mocked(createSession).mockResolvedValueOnce("sess-001");
      const id = await registry.getOrCreateDefault(1, URL);
      expect(createSession).toHaveBeenCalledWith(URL);
      expect(id).toBe("sess-001");
    });

    it("returns same session id on second call without calling createSession again", async () => {
      vi.mocked(createSession).mockResolvedValueOnce("sess-001");
      await registry.getOrCreateDefault(1, URL);
      vi.mocked(createSession).mockReset();

      const id = await registry.getOrCreateDefault(1, URL);
      expect(createSession).not.toHaveBeenCalled();
      expect(id).toBe("sess-001");
    });

    it("sets active to default session after creation", async () => {
      vi.mocked(createSession).mockResolvedValueOnce("sess-001");
      await registry.getOrCreateDefault(1, URL);
      expect(registry.getActiveSessionId(1)).toBe("sess-001");
    });
  });

  describe("getActiveSessionId", () => {
    it("returns undefined for a brand-new chat with no sessions", () => {
      expect(registry.getActiveSessionId(99)).toBeUndefined();
    });

    it("returns the session id after getOrCreateDefault", async () => {
      vi.mocked(createSession).mockResolvedValueOnce("sess-001");
      await registry.getOrCreateDefault(1, URL);
      expect(registry.getActiveSessionId(1)).toBe("sess-001");
    });
  });

  describe("getActiveName", () => {
    it("returns 'default' when active is the default session", async () => {
      vi.mocked(createSession).mockResolvedValueOnce("sess-001");
      await registry.getOrCreateDefault(1, URL);
      expect(registry.getActiveName(1)).toBe("default");
    });

    it("returns 'default' when no sessions exist yet", () => {
      expect(registry.getActiveName(99)).toBe("default");
    });

    it("returns named session name after switch", async () => {
      vi.mocked(createSession).mockResolvedValueOnce("sess-001");
      await registry.getOrCreateDefault(1, URL);
      registry.createNamed(1, "my-project", "sess-002");
      registry.switchTo(1, "my-project");
      expect(registry.getActiveName(1)).toBe("my-project");
    });
  });

  describe("createNamed + hasNamed + getNamedId", () => {
    it("stores a named session mapped to its id", async () => {
      vi.mocked(createSession).mockResolvedValueOnce("sess-001");
      await registry.getOrCreateDefault(1, URL);
      registry.createNamed(1, "my-project", "sess-002");
      expect(registry.hasNamed(1, "my-project")).toBe(true);
      expect(registry.getNamedId(1, "my-project")).toBe("sess-002");
    });

    it("sets active to the new named session after createNamed", async () => {
      vi.mocked(createSession).mockResolvedValueOnce("sess-001");
      await registry.getOrCreateDefault(1, URL);
      registry.createNamed(1, "my-project", "sess-002");
      expect(registry.getActiveSessionId(1)).toBe("sess-002");
    });

    it("hasNamed is case-insensitive ('My-Project' finds 'my-project')", async () => {
      vi.mocked(createSession).mockResolvedValueOnce("sess-001");
      await registry.getOrCreateDefault(1, URL);
      registry.createNamed(1, "my-project", "sess-002");
      expect(registry.hasNamed(1, "My-Project")).toBe(true);
    });

    it("hasNamed returns false for unknown name", async () => {
      vi.mocked(createSession).mockResolvedValueOnce("sess-001");
      await registry.getOrCreateDefault(1, URL);
      expect(registry.hasNamed(1, "unknown")).toBe(false);
    });

    it("getNamedId returns undefined for unknown name", async () => {
      vi.mocked(createSession).mockResolvedValueOnce("sess-001");
      await registry.getOrCreateDefault(1, URL);
      expect(registry.getNamedId(1, "unknown")).toBeUndefined();
    });

    it("createNamed works standalone without prior getOrCreateDefault", () => {
      registry.createNamed(42, "solo", "sess-solo");
      expect(registry.hasNamed(42, "solo")).toBe(true);
      expect(registry.getActiveSessionId(42)).toBe("sess-solo");
    });
  });

  describe("switchTo", () => {
    it("returns true and switches active to named session", async () => {
      vi.mocked(createSession).mockResolvedValueOnce("sess-001");
      await registry.getOrCreateDefault(1, URL);
      registry.createNamed(1, "my-project", "sess-002");
      // switch back to default first to confirm it was at named
      const result = registry.switchTo(1, "my-project");
      expect(result).toBe(true);
      expect(registry.getActiveSessionId(1)).toBe("sess-002");
    });

    it("returns false for unknown session name", async () => {
      vi.mocked(createSession).mockResolvedValueOnce("sess-001");
      await registry.getOrCreateDefault(1, URL);
      const result = registry.switchTo(1, "nonexistent");
      expect(result).toBe(false);
    });

    it("does not throw for chat with no sessions", () => {
      expect(() => registry.switchTo(99, "anything")).not.toThrow();
      expect(registry.switchTo(99, "anything")).toBe(false);
    });

    it("can switch back to 'default'", async () => {
      vi.mocked(createSession).mockResolvedValueOnce("sess-001");
      await registry.getOrCreateDefault(1, URL);
      registry.createNamed(1, "work", "sess-002");
      expect(registry.getActiveSessionId(1)).toBe("sess-002");
      const result = registry.switchTo(1, "default");
      expect(result).toBe(true);
      expect(registry.getActiveSessionId(1)).toBe("sess-001");
    });

    it("switchTo is case-insensitive", async () => {
      vi.mocked(createSession).mockResolvedValueOnce("sess-001");
      await registry.getOrCreateDefault(1, URL);
      registry.createNamed(1, "work", "sess-002");
      const result = registry.switchTo(1, "WORK");
      expect(result).toBe(true);
      expect(registry.getActiveSessionId(1)).toBe("sess-002");
    });
  });

  describe("list", () => {
    it("returns [] for a chat with no sessions (never throws)", () => {
      expect(registry.list(99)).toEqual([]);
    });

    it("returns [{name:'default', active:true}] after getOrCreateDefault only", async () => {
      vi.mocked(createSession).mockResolvedValueOnce("sess-001");
      await registry.getOrCreateDefault(1, URL);
      expect(registry.list(1)).toEqual([
        { name: "default", sessionId: "sess-001", active: true },
      ]);
    });

    it("returns all sessions with correct active flag after createNamed", async () => {
      vi.mocked(createSession).mockResolvedValueOnce("sess-001");
      await registry.getOrCreateDefault(1, URL);
      registry.createNamed(1, "my-project", "sess-002");
      const listed = registry.list(1);
      expect(listed).toEqual([
        { name: "default", sessionId: "sess-001", active: false },
        { name: "my-project", sessionId: "sess-002", active: true },
      ]);
    });

    it("reflects active flag correctly after switchTo", async () => {
      vi.mocked(createSession).mockResolvedValueOnce("sess-001");
      await registry.getOrCreateDefault(1, URL);
      registry.createNamed(1, "my-project", "sess-002");
      registry.switchTo(1, "default");
      const listed = registry.list(1);
      expect(listed).toEqual([
        { name: "default", sessionId: "sess-001", active: true },
        { name: "my-project", sessionId: "sess-002", active: false },
      ]);
    });
  });
});
