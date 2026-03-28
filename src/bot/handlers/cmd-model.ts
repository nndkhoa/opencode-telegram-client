import type { Context } from "grammy";
import type { SessionRegistry } from "../../session/registry.js";
import {
  patchConfig,
  getConfigProviders,
  defaultModelRefsFromPayload,
  type ConfigProvidersPayload,
} from "../../opencode/config.js";
import { buildFlatSelectableModelRefs } from "../../opencode/model-catalog.js";
import { resolveDisplayModel } from "../../opencode/display-model.js";
import { logger } from "../../logger.js";
import { savePersistedModel } from "../../persist/last-model.js";

/** Leave headroom below Telegram's 4096 cap (entities / UTF-16 edge cases). */
const TELEGRAM_HTML_SAFE_MAX = 3800;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatModelOverviewHtml(configured: string | undefined, payload: ConfigProvidersPayload): string {
  const defaultRefs = defaultModelRefsFromPayload(payload);
  if (configured) {
    return `<code>${escapeHtml(configured)}</code> <i>(from config)</i>`;
  }
  if (defaultRefs.length === 1) {
    return `<code>${escapeHtml(defaultRefs[0])}</code> <i>(provider catalog default)</i>`;
  }
  if (defaultRefs.length > 1) {
    const lines = defaultRefs.map((r) => `• <code>${escapeHtml(r)}</code>`);
    return `<i>No global <code>model</code> in config.</i>\n<b>Catalog defaults</b>\n${lines.join("\n")}`;
  }
  return `<i>Not set. Use <code>/model provider/model-id</code> to choose one.</i>`;
}

/** One HTML fragment per provider (or empty placeholder). Uses global flat index for numbering (D-05, D-06). */
function formatCatalogBlocks(payload: ConfigProvidersPayload): string[] {
  const flat = buildFlatSelectableModelRefs(payload);
  const sorted = [...payload.providers].sort((a, b) =>
    (a.name || a.id).localeCompare(b.name || b.id, undefined, { sensitivity: "base" })
  );
  const blocks: string[] = [];
  for (const provider of sorted) {
    const models = provider.models ?? {};
    const ids = Object.keys(models).sort();
    if (ids.length === 0) continue;
    const title = escapeHtml(provider.name || provider.id);
    const bullets = ids.map((id) => {
      const fullRef = id.includes("/") ? id : `${provider.id}/${id}`;
      const idx = flat.indexOf(fullRef) + 1;
      const entry = models[id];
      const displayName =
        entry !== null && typeof entry === "object" && typeof (entry as { name?: string }).name === "string"
          ? (entry as { name: string }).name
          : null;
      const code = escapeHtml(fullRef);
      const suffix =
        displayName && displayName !== id ? ` — <i>${escapeHtml(displayName)}</i>` : "";
      return `  ${idx}. <code>${code}</code>${suffix}`;
    });
    blocks.push(`<b>${title}</b>\n${bullets.join("\n")}`);
  }
  if (blocks.length === 0) return ["<i>No models returned from OpenCode.</i>"];
  return blocks;
}

/**
 * Concatenate HTML sections into one or more messages, each ≤ maxLen, splitting on section boundaries.
 */
export function packTelegramHtmlSections(sections: string[], maxLen: number): string[] {
  const messages: string[] = [];
  let buf = "";

  const flushBuf = () => {
    if (buf.length > 0) {
      messages.push(buf);
      buf = "";
    }
  };

  const pushOversizedLineByLine = (part: string) => {
    const lines = part.split("\n");
    for (const line of lines) {
      const joiner = buf.length > 0 ? "\n" : "";
      if (buf.length + joiner.length + line.length <= maxLen) {
        buf += joiner + line;
        continue;
      }
      flushBuf();
      if (line.length <= maxLen) {
        buf = line;
      } else {
        for (let i = 0; i < line.length; i += maxLen) {
          messages.push(line.slice(i, i + maxLen));
        }
      }
    }
  };

  for (const section of sections) {
    const sep = buf.length > 0 ? "\n\n" : "";
    if (section.length > maxLen) {
      flushBuf();
      pushOversizedLineByLine(section);
      continue;
    }
    if (buf.length + sep.length + section.length <= maxLen) {
      buf += sep + section;
    } else {
      flushBuf();
      buf = section;
    }
  }
  flushBuf();
  return messages;
}

async function replyHtmlInParts(ctx: Context, sections: string[]): Promise<void> {
  const chunks = packTelegramHtmlSections(sections, TELEGRAM_HTML_SAFE_MAX);
  const n = chunks.length;
  for (let i = 0; i < n; i++) {
    const text = i === 0 ? chunks[i] : `<i>… ${i + 1}/${n}</i>\n\n${chunks[i]}`;
    await ctx.reply(text, { parse_mode: "HTML" });
  }
}

export function makeCmdModelHandler(registry: SessionRegistry, openCodeUrl: string) {
  return async (ctx: Context): Promise<void> => {
    const arg = ((ctx.match as string | undefined) ?? "").trim();

    if (arg.length === 0) {
      let payload: ConfigProvidersPayload;
      try {
        payload = await getConfigProviders(openCodeUrl);
      } catch (err) {
        logger.error({ err }, "Failed to fetch config providers");
        await ctx.reply("❌ Could not fetch available models. Is OpenCode running?");
        return;
      }

      const sessionId = registry.getActiveSessionId(ctx.chat!.id);
      const resolved = await resolveDisplayModel(openCodeUrl, sessionId);

      const overview =
        resolved.kind === "resolved"
          ? `<code>${escapeHtml(resolved.ref)}</code> <i>(current)</i>`
          : formatModelOverviewHtml(undefined, payload);

      const catalogBlocks = formatCatalogBlocks(payload);
      const sections = [`<b>Current model</b>\n${overview}`, `<b>Available models</b>`, ...catalogBlocks];

      await replyHtmlInParts(ctx, sections);
    } else {
      const trimmed = arg.trim();
      if (/^\d+$/.test(trimmed)) {
        const n = Number(trimmed);
        let payload: ConfigProvidersPayload;
        try {
          payload = await getConfigProviders(openCodeUrl);
        } catch (err) {
          logger.error({ err }, "Failed to fetch config providers for numeric /model");
          await ctx.reply("❌ Could not fetch available models. Is OpenCode running?");
          return;
        }
        const flat = buildFlatSelectableModelRefs(payload);
        if (n < 1 || n > flat.length) {
          await ctx.reply(
            `❌ No model at index ${n}. Run /model to see the numbered list (${flat.length} models).`
          );
          return;
        }
        const ref = flat[n - 1]!;
        try {
          await patchConfig(openCodeUrl, ref);
          savePersistedModel(ref);
          logger.info({ model: ref }, "Model switched (numeric index)");
          await ctx.reply(`✅ Model switched to ${ref} (global — affects all sessions).`);
        } catch (err) {
          if (err instanceof Error && err.message === "unknown_model") {
            await ctx.reply(`❌ Unknown model "${ref}". Run /model to see available models.`);
          } else {
            logger.error({ err, model: ref }, "Failed to switch model (numeric)");
            await ctx.reply("❌ Could not switch model. Is OpenCode running?");
          }
        }
        return;
      }

      try {
        await patchConfig(openCodeUrl, trimmed);
        savePersistedModel(trimmed);
        logger.info({ model: trimmed }, "Model switched");
        await ctx.reply(`✅ Model switched to ${trimmed} (global — affects all sessions).`);
      } catch (err) {
        if (err instanceof Error && err.message === "unknown_model") {
          await ctx.reply(`❌ Unknown model "${trimmed}". Run /model to see available models.`);
        } else {
          logger.error({ err, model: trimmed }, "Failed to switch model");
          await ctx.reply("❌ Could not switch model. Is OpenCode running?");
        }
      }
    }
  };
}
