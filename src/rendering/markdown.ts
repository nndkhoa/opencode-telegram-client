import { lexer, marked, walkTokens } from "marked";
import type { Parser, Tokens } from "marked";
import sanitizeHtml from "sanitize-html";

/**
 * Telegram HTML mode line-break rules (https://core.telegram.org/bots/api#html-style):
 *   - Only `\n` (newline) is used for line breaks — `<br>` is NOT supported and causes
 *     "Unsupported start tag" 400 errors.
 *   - All formatting uses only: <b> <i> <u> <s> <code> <pre> <a> <tg-spoiler>
 *
 * Therefore every renderer and post-processor in this file must emit `\n`, never `<br>`.
 */

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

marked.use({
  renderer: {
    /** Headings → <b>text</b> followed by a newline (Telegram has no h1-h6). */
    heading({ tokens }: Tokens.Heading) {
      const text = this.parser.parseInline(tokens);
      return `<b>${text}</b>\n`;
    },

    /** Inline code → <code>text</code> (explicit renderer to guarantee correct output). */
    codespan({ text }: Tokens.Codespan) {
      // text is the raw decoded value from marked (e.g. "<div>" for `<div>`).
      // Must HTML-escape before inserting into <code> so Telegram's parser
      // sees a valid entity rather than a stray start tag, which causes
      // "Can't find end tag corresponding to start tag" 400 errors.
      const escaped = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return `<code>${escaped}</code>`;
    },

    checkbox({ checked }: { checked: boolean }) {
      return checked ? "☑ " : "☐ ";
    },

    /**
     * Telegram has no <ul>/<ol>/<li>. Render each item on its own line with an
     * emoji prefix. Nested lists are indented with two spaces.
     */
    list(this: { parser: Parser }, token: Tokens.List) {
      let n = typeof token.start === "number" ? token.start : 1;
      const rows: string[] = [];

      for (const item of token.items) {
        // Separate inline tokens (text) from nested list tokens so we can
        // insert a newline between the parent label and the sub-list.
        const inlineTokens = item.tokens.filter((t) => t.type !== "list");
        const nestedListTokens = item.tokens.filter((t) => t.type === "list");

        // Render inline part; strip <p> wrap that marked adds around block content
        // so flattenParagraphs() doesn't insert double-newlines inside a list item.
        const inlineParsed = inlineTokens.length
          ? this.parser
              .parse(inlineTokens)
              .trim()
              .replace(/^<p>/i, "")
              .replace(/<\/p>$/i, "")
              .trim()
          : "";

        // Render nested lists; they come back as already-formatted strings with \n.
        const nestedHtml = nestedListTokens.length
          ? nestedListTokens
              .map((lt) => this.parser.parse([lt]).trim())
              .join("\n")
          : "";

        const prefix = item.task
          ? token.ordered
            ? orderedListPrefix(n++)
            : ""
          : token.ordered
            ? orderedListPrefix(n++)
            : LIST_BULLET_EMOJI;

        if (nestedHtml) {
          // Indent every line of the nested block by two spaces.
          const indented = nestedHtml
            .split("\n")
            .map((line) => (line ? `  ${line}` : line))
            .join("\n");
          rows.push(
            inlineParsed
              ? `${prefix}${inlineParsed}\n${indented}`
              : `${prefix}${indented}`
          );
        } else {
          rows.push(`${prefix}${inlineParsed}`);
        }
      }

      return rows.join("\n");
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
 * Telegram HTML rejects nested identical formatting tags (e.g. `<b><b>x</b></b>`).
 * marked can emit nested `<strong>` / `<em>` for emphasis; flatten after normalizeTags.
 */
function collapseNestedTag(html: string, tag: "b" | "i"): string {
  const re = new RegExp(
    `<${tag}([^>]*)>([\\s\\S]*?)<${tag}([^>]*)>([\\s\\S]*?)</${tag}>([\\s\\S]*?)</${tag}>`,
    "i"
  );
  let s = html;
  for (let n = 0; n < 100; n++) {
    const next = s.replace(re, `<${tag}$1>$2$4$5</${tag}>`);
    if (next === s) break;
    s = next;
  }
  return s;
}

function collapseNestedBoldItalic(html: string): string {
  let s = html;
  s = collapseNestedTag(s, "b");
  s = collapseNestedTag(s, "i");
  return s;
}

/**
 * When Telegram rejects HTML (`parse_mode: HTML`), convert already-rendered HTML to plain text
 * so list emoji, 📊 labels, and paragraph breaks survive better than raw markdown.
 */
export function telegramHtmlToFallbackPlain(html: string): string {
  return html
    .replace(/\n/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
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

/**
 * `<p>` is not valid in Telegram HTML. Flatten to `\n\n` (double newline = paragraph break).
 * Telegram renders consecutive newlines as visual spacing, same as paragraph separation.
 */
function flattenParagraphs(html: string): string {
  return (
    html
      // Standard: </p> immediately followed by <p>
      .replace(/<\/p>\s*<p>/gi, "\n\n")
      // After a closing tag (e.g. </code> from custom list renderer) directly before <p>
      .replace(/(<\/[a-z]+>)\s*<p>/gi, "$1\n\n")
      // After plain text (non-tag) before <p>
      .replace(/([^>])\s*<p>/gi, "$1\n\n")
      .replace(/^<p>/i, "")
      .replace(/<\/p>/gi, "")
  );
}

/**
 * After sanitize-html and flattenParagraphs, any residual `<br>` tags (which Telegram
 * rejects as "Unsupported start tag") are converted to `\n`.
 * Then collapse 3+ consecutive newlines to 2 (paragraph spacing max).
 */
function normalizeBrToNewline(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\n{3,}/g, "\n\n");
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
      "tg-spoiler",
    ],
    allowedAttributes: {
      a: ["href"],
      code: ["class"],
      pre: ["class"],
    },
  });

  // Convert any residual <br> to \n, then normalize tag aliases.
  const brFixed = normalizeBrToNewline(sanitized);
  const normalized = collapseNestedBoldItalic(normalizeTags(brFixed)).trim();

  if (!normalized) {
    return ["(empty response)"];
  }

  return splitHtml(normalized);
}
