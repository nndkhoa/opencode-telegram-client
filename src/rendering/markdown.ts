import { lexer, marked, walkTokens } from "marked";
import type { Tokens } from "marked";
import sanitizeHtml from "sanitize-html";

const TELEGRAM_MAX_LENGTH = 4096;
const NEWLINE_LOOKBACK = 200;

// Map HTML tags that marked emits but Telegram doesn't support
const TAG_MAP: Record<string, string> = {
  strong: "b",
  em: "i",
  ins: "u",
  del: "s",
};

function normalizeTags(html: string): string {
  let result = html;
  for (const [from, to] of Object.entries(TAG_MAP)) {
    result = result
      .replace(new RegExp(`<${from}(\\s[^>]*)?>`, "gi"), `<${to}>`)
      .replace(new RegExp(`</${from}>`, "gi"), `</${to}>`);
  }
  return result;
}

/**
 * GFM pipes render to `<table>`, which we strip for Telegram HTML; Telegram has no table layout.
 * Keep the aligned pipe text as a fenced block → `<pre><code>` (monospace), readable in chat.
 */
function markdownTablesToFencedCode(markdown: string): string {
  const tables: Tokens.Table[] = [];
  walkTokens(lexer(markdown), (token) => {
    if (token.type === "table") {
      tables.push(token);
    }
  });
  let out = markdown;
  for (const t of tables.reverse()) {
    const idx = out.lastIndexOf(t.raw);
    if (idx === -1) continue;
    const body = t.raw.trimEnd();
    const replacement = "```\n" + body + "\n```";
    out = out.slice(0, idx) + replacement + out.slice(idx + t.raw.length);
  }
  return out;
}

function splitHtml(html: string): string[] {
  const chunks: string[] = [];
  let remaining = html;

  while (remaining.length > TELEGRAM_MAX_LENGTH) {
    let splitAt = TELEGRAM_MAX_LENGTH;
    const lookbackStart = TELEGRAM_MAX_LENGTH - NEWLINE_LOOKBACK;
    const newlinePos = remaining.lastIndexOf("\n", TELEGRAM_MAX_LENGTH - 1);
    if (newlinePos >= lookbackStart) {
      splitAt = newlinePos + 1; // include the newline in the preceding chunk
    }
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

/** Appends a Telegram-HTML footer to the last chunk, or starts a new chunk if needed. */
export function appendHtmlFooterToChunks(chunks: string[], footerHtml: string): string[] {
  if (footerHtml === "") return chunks;
  if (chunks.length === 0) {
    return footerHtml.length <= TELEGRAM_MAX_LENGTH ? [footerHtml] : splitHtml(footerHtml);
  }
  const last = chunks[chunks.length - 1]!;
  const combined = `${last}\n\n${footerHtml}`;
  if (combined.length <= TELEGRAM_MAX_LENGTH) {
    return [...chunks.slice(0, -1), combined];
  }
  return [...chunks, footerHtml];
}

export function renderFinalMessage(markdown: string): string[] {
  if (!markdown || markdown.trim() === "") {
    return ["(empty response)"];
  }

  const rawHtml = marked(markdownTablesToFencedCode(markdown)) as string;

  const sanitized = sanitizeHtml(rawHtml, {
    allowedTags: [
      "b",
      "strong",
      "i",
      "em",
      "u",
      "ins",
      "s",
      "strike",
      "del",
      "code",
      "pre",
      "a",
      "tg-spoiler",
    ],
    allowedAttributes: {
      a: ["href"],
      code: ["class"],
      pre: ["class"],
    },
  });

  const normalized = normalizeTags(sanitized).trim();

  if (!normalized) {
    return ["(empty response)"];
  }

  return splitHtml(normalized);
}
