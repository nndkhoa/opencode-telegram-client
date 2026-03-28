import { marked } from "marked";
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

export function renderFinalMessage(markdown: string): string[] {
  if (!markdown || markdown.trim() === "") {
    return ["(empty response)"];
  }

  const rawHtml = marked(markdown) as string;

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
