import { lexer, marked, walkTokens } from "marked";
import type { Parser, Tokens } from "marked";
import sanitizeHtml from "sanitize-html";

/** Telegram has no `<ul>`/`<ol>`/`<li>`; we render one line per item with `<br>`. */
const LIST_BULLET_EMOJI = "🔹 ";

/** Keycap digits 1–9 (U+0031–0039, FE0F, 20E3); 10 uses U+1F51F. After 10, fall back to `n.` */
function orderedListPrefix(index: number): string {
  if (index >= 1 && index <= 9) {
    return `${String.fromCharCode(0x30 + index)}\uFE0F\u20E3 `;
  }
  if (index === 10) {
    return "🔟 ";
  }
  return `${index}. `;
}

/**
 * Telegram HTML does not support `<ul>` / `<ol>` / `<li>`; sanitize-html drops them and list markers vanish.
 * Render lists with emoji markers + `<br>` (GFM task items use ☐/☑ via checkbox renderer).
 */
marked.use({
  renderer: {
    checkbox({ checked }: { checked: boolean }) {
      return checked ? "☑ " : "☐ ";
    },
    list(this: { parser: Parser }, token: Tokens.List) {
      let n = typeof token.start === "number" ? token.start : 1;
      const rows: string[] = [];
      for (const item of token.items) {
        const inner = this.parser.parse(item.tokens).trim();
        if (item.task) {
          const prefix = token.ordered ? orderedListPrefix(n++) : "";
          rows.push(prefix + inner);
        } else {
          const prefix = token.ordered ? orderedListPrefix(n++) : LIST_BULLET_EMOJI;
          rows.push(prefix + inner);
        }
      }
      return rows.join("<br>");
    },
  },
});

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
 * Keep the aligned pipe text as a fenced block → `<pre><code>` (monospace), with a 📊 label line.
 */
function markdownTablesToFencedCode(markdown: string): string {
  const tables: Tokens.Table[] = [];
  walkTokens(lexer(markdown), (token) => {
    if (token.type === "table") {
      tables.push(token as Tokens.Table);
    }
  });
  let out = markdown;
  for (const t of tables.reverse()) {
    const idx = out.lastIndexOf(t.raw);
    if (idx === -1) continue;
    const body = t.raw.trimEnd();
    const replacement = "📊\n```\n" + body + "\n```";
    out = out.slice(0, idx) + replacement + out.slice(idx + t.raw.length);
  }
  return out;
}

/** `<p>` is not Telegram HTML; flatten to explicit `<br><br>` before sanitize. */
function flattenParagraphs(html: string): string {
  return html
    .replace(/<\/p>\s*<p>/gi, "<br><br>")
    .replace(/^<p>/i, "")
    .replace(/<\/p>$/i, "");
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
  const withBreaks = flattenParagraphs(rawHtml);

  const sanitized = sanitizeHtml(withBreaks, {
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
      "br",
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
