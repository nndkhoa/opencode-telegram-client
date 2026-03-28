import { createSession } from "../opencode/session.js";

export type ChatSessions = {
  default: string;
  named: Map<string, string>;
  active: string;
};

export class SessionRegistry {
  private chats = new Map<number, ChatSessions>();

  getActiveSessionId(chatId: number): string | undefined {
    return this.chats.get(chatId)?.active;
  }

  getActiveName(chatId: number): string {
    const entry = this.chats.get(chatId);
    if (!entry) return "default";
    if (entry.active === entry.default) return "default";
    for (const [name, id] of entry.named) {
      if (id === entry.active) return name;
    }
    return "default";
  }

  async getOrCreateDefault(chatId: number, openCodeUrl: string): Promise<string> {
    const existing = this.chats.get(chatId);
    if (existing) return existing.active;

    const id = await createSession(openCodeUrl);
    this.chats.set(chatId, { default: id, named: new Map(), active: id });
    return id;
  }

  createNamed(chatId: number, name: string, sessionId: string): void {
    const key = name.toLowerCase().trim();
    const entry = this.chats.get(chatId);
    if (entry) {
      entry.named.set(key, sessionId);
      entry.active = sessionId;
    } else {
      this.chats.set(chatId, {
        default: "",
        named: new Map([[key, sessionId]]),
        active: sessionId,
      });
    }
  }

  switchTo(chatId: number, name: string): boolean {
    const entry = this.chats.get(chatId);
    if (!entry) return false;

    const key = name.toLowerCase().trim();

    if (key === "default") {
      if (!entry.default) return false;
      entry.active = entry.default;
      return true;
    }

    const id = entry.named.get(key);
    if (id === undefined) return false;
    entry.active = id;
    return true;
  }

  hasNamed(chatId: number, name: string): boolean {
    return this.chats.get(chatId)?.named.has(name.toLowerCase().trim()) ?? false;
  }

  getNamedId(chatId: number, name: string): string | undefined {
    return this.chats.get(chatId)?.named.get(name.toLowerCase().trim());
  }

  list(chatId: number): Array<{ name: string; sessionId: string; active: boolean }> {
    const entry = this.chats.get(chatId);
    if (!entry) return [];

    const result: Array<{ name: string; sessionId: string; active: boolean }> = [];

    if (entry.default) {
      result.push({ name: "default", sessionId: entry.default, active: entry.active === entry.default });
    }

    for (const [name, id] of entry.named) {
      result.push({ name, sessionId: id, active: entry.active === id });
    }

    return result;
  }
}
