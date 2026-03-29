import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() },
}));

import { logger } from "../../logger.js";
import { telegramLogMiddleware } from "./telegram-log.js";

describe("telegramLogMiddleware", () => {
  beforeEach(() => {
    vi.mocked(logger.info).mockClear();
  });

  it("logs message update with userId, chatId, updateType, messageId, timestamp", async () => {
    const next = vi.fn().mockResolvedValue(undefined);
    const ctx = {
      update: {
        update_id: 1,
        message: {
          message_id: 42,
          date: 1_700_000_000,
          chat: { id: 777, type: "private" as const },
          from: { id: 100, is_bot: false, first_name: "U" },
        },
      },
      from: { id: 100, is_bot: false, first_name: "U" },
      chat: { id: 777, type: "private" as const },
    };
    await telegramLogMiddleware(ctx as Parameters<typeof telegramLogMiddleware>[0], next);
    expect(next).toHaveBeenCalledOnce();
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 100,
        chatId: 777,
        updateType: "message",
        messageId: 42,
        timestamp: new Date(1_700_000_000 * 1000).toISOString(),
      }),
      "telegram update",
    );
  });

  it("logs callback_query with updateType callback_query and messageId from inline message", async () => {
    const next = vi.fn().mockResolvedValue(undefined);
    const ctx = {
      update: {
        update_id: 2,
        callback_query: {
          id: "cb1",
          from: { id: 200, is_bot: false, first_name: "U" },
          message: {
            message_id: 99,
            date: 1_700_000_100,
            chat: { id: 888, type: "private" as const },
          },
          data: "x",
        },
      },
      from: { id: 200, is_bot: false, first_name: "U" },
      chat: { id: 888, type: "private" as const },
    };
    await telegramLogMiddleware(ctx as Parameters<typeof telegramLogMiddleware>[0], next);
    expect(next).toHaveBeenCalledOnce();
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 200,
        chatId: 888,
        updateType: "callback_query",
        messageId: 99,
      }),
      "telegram update",
    );
  });
});
