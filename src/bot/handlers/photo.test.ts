import { describe, it, expect, vi, beforeEach } from "vitest";
import { StreamingStateManager } from "../../opencode/streaming-state.js";
import type { SessionRegistry } from "../../session/registry.js";

vi.mock("../../opencode/session.js", () => ({
  sendPromptAsyncWithPhoto: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../persist/last-model.js", () => ({
  ensurePersistedModelApplied: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../config/env.js", () => ({
  config: { botToken: "TEST_BOT_TOKEN" },
}));

import { sendPromptAsyncWithPhoto } from "../../opencode/session.js";
import { ensurePersistedModelApplied } from "../../persist/last-model.js";
import { PendingInteractiveState } from "../../opencode/interactive-pending.js";
import { makePhotoHandler } from "./photo.js";
import { UNSUPPORTED_MEDIA_REPLY } from "./unsupported-media.js";

function makeMockPending(): PendingInteractiveState {
  return {
    rememberSessionChat: vi.fn(),
    get: vi.fn(),
    isAwaitingFreeTextAnswer: vi.fn().mockReturnValue(false),
  } as unknown as PendingInteractiveState;
}

function makeMockRegistry(sessionId = "ses_photo"): SessionRegistry {
  return {
    getActiveSessionId: vi.fn(),
    getActiveName: vi.fn(),
    getOrCreateDefault: vi.fn().mockResolvedValue(sessionId),
    createNamed: vi.fn(),
    switchTo: vi.fn(),
    hasNamed: vi.fn(),
    getNamedId: vi.fn(),
    list: vi.fn(),
  } as unknown as SessionRegistry;
}

function makePhotoCtx(overrides: Partial<{ chatId: number; filePath: string | undefined }> = {}) {
  const { chatId = 100, filePath = "photos/file_0.jpg" } = overrides;
  return {
    chat: { id: chatId },
    message: { photo: [{ file_id: "fid" }], message_id: 1 },
    getFile: vi.fn().mockResolvedValue({ file_path: filePath }),
    reply: vi.fn().mockResolvedValue({ message_id: 99 }),
    replyWithChatAction: vi.fn().mockResolvedValue({}),
    api: {
      editMessageText: vi.fn().mockResolvedValue({}),
    },
  };
}

describe("makePhotoHandler", () => {
  let manager: StreamingStateManager;
  let registry: SessionRegistry;
  let pending: PendingInteractiveState;
  const openCodeUrl = "http://localhost:4096";

  beforeEach(() => {
    registry = makeMockRegistry();
    pending = makeMockPending();
    manager = new StreamingStateManager(registry, openCodeUrl);
    vi.mocked(sendPromptAsyncWithPhoto).mockResolvedValue(undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      } as Response)
    );
  });

  it("replies with ⏳ when chat is busy (D-15)", async () => {
    manager.startTurn("ses_existing", 100, 1);
    const ctx = makePhotoCtx();
    await makePhotoHandler(registry, manager, openCodeUrl, pending)(ctx as never);
    expect(ctx.reply).toHaveBeenCalledWith(
      "⏳ Still working on your last message. Please wait."
    );
    expect(sendPromptAsyncWithPhoto).not.toHaveBeenCalled();
  });

  it("replies with MCP guidance when pending interactive exists (D-16/D-17)", async () => {
    vi.mocked(pending.isAwaitingFreeTextAnswer).mockReturnValue(false);
    vi.mocked(pending.get).mockReturnValue({
      kind: "question",
      requestID: "q1",
      sessionID: "s1",
    } as never);
    const ctx = makePhotoCtx();
    await makePhotoHandler(registry, manager, openCodeUrl, pending)(ctx as never);
    expect(ctx.reply).toHaveBeenCalledWith(
      "Reply with text or tap an option, or send /cancel. Photos cannot be used for this prompt."
    );
    expect(sendPromptAsyncWithPhoto).not.toHaveBeenCalled();
  });

  it("calls sendPromptAsyncWithPhoto after download (happy path)", async () => {
    vi.mocked(pending.get).mockReturnValue(undefined);
    const ctx = makePhotoCtx();
    await makePhotoHandler(registry, manager, openCodeUrl, pending)(ctx as never);

    expect(ensurePersistedModelApplied).toHaveBeenCalledWith(openCodeUrl);
    expect(sendPromptAsyncWithPhoto).toHaveBeenCalledWith(
      openCodeUrl,
      "ses_photo",
      expect.any(Buffer),
      "image/jpeg",
      expect.objectContaining({ filename: "file_0.jpg" })
    );
    expect(fetch).toHaveBeenCalledWith(
      "https://api.telegram.org/file/botTEST_BOT_TOKEN/photos/file_0.jpg"
    );
  });

  it("edits thinking message on sendPromptAsyncWithPhoto failure", async () => {
    vi.mocked(pending.get).mockReturnValue(undefined);
    vi.mocked(sendPromptAsyncWithPhoto).mockRejectedValueOnce(new Error("HTTP 503"));
    const ctx = makePhotoCtx();
    await makePhotoHandler(registry, manager, openCodeUrl, pending)(ctx as never);

    expect(ctx.api.editMessageText).toHaveBeenCalledWith(
      100,
      99,
      "❌ OpenCode is unreachable. Make sure it's running at localhost:4096."
    );
  });
});

describe("unsupported media copy (D-03)", () => {
  it("includes \"not supported\" (case-insensitive)", () => {
    expect(UNSUPPORTED_MEDIA_REPLY.toLowerCase()).toMatch(/not supported/);
  });
});
