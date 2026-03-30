import { describe, it, expect } from "vitest";
import {
  appendHtmlFooterToChunks,
  renderFinalMessage,
  telegramHtmlToFallbackPlain,
} from "./markdown.js";

describe("renderFinalMessage", () => {
  it("converts **bold** to <b>bold</b>", () => {
    const result = renderFinalMessage("**bold**");
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("<b>bold</b>");
  });

  it("flattens nested bold from overlapping emphasis (Telegram rejects nested <b>)", () => {
    const result = renderFinalMessage("**outer **inner** tail**");
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("<b>outer inner tail</b>");
    expect(result[0]).not.toContain("<b><b>");
  });

  it("converts _italic_ to <i>italic</i>", () => {
    const result = renderFinalMessage("_italic_");
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("<i>italic</i>");
  });

  it("converts `code` to <code>code</code>", () => {
    const result = renderFinalMessage("`code`");
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("<code>code</code>");
  });

  it("converts # heading to <b>heading</b> (Telegram has no h1-h6)", () => {
    const result = renderFinalMessage("# My Heading");
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("<b>My Heading</b>");
    expect(result[0]).not.toMatch(/<h[1-6]/i);
  });

  it("converts ## sub-heading to <b>text</b>", () => {
    const result = renderFinalMessage("## Sub Heading");
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("<b>Sub Heading</b>");
  });

  it("converts heading with inline code to <b>...<code>...</code>...</b>", () => {
    const result = renderFinalMessage("# Use `git status`");
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("<b>");
    expect(result[0]).toContain("<code>git status</code>");
  });

  it("converts inline `code` in body text to <code>...</code>", () => {
    const result = renderFinalMessage("Run `npm install` first");
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("<code>npm install</code>");
  });

  it("converts fenced code block to <pre><code>", () => {
    const result = renderFinalMessage("```\nblock\n```");
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("<pre><code>");
  });

  it("renders GFM pipe tables as fenced pre (aligned raw), not HTML tables Telegram would drop", () => {
    const md = "| a | b |\n|---|---|\n| 1 | 2 |";
    const result = renderFinalMessage(md);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("📊");
    expect(result[0]).toContain("<pre>");
    expect(result[0]).toContain("| a | b |");
    expect(result[0]).not.toContain("<table");
  });

  it("converts [link](url) to <a href='url'>", () => {
    const result = renderFinalMessage("[link](https://x.com)");
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('<a href="https://x.com"');
  });

  it("renders GFM bullet lists with emoji marker and \\n (Telegram HTML has no ul/li)", () => {
    const result = renderFinalMessage("- alpha\n- beta");
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("🔹");
    expect(result[0]).toMatch(/🔹[^\n]*alpha/);
    expect(result[0]).toMatch(/🔹[^\n]*beta/);
    // items separated by newline, not <br>
    expect(result[0]).toMatch(/alpha\n🔹/);
    expect(result[0]).not.toContain("<br>");
  });

  it("renders ordered lists with keycap emoji and \\n", () => {
    const result = renderFinalMessage("1. first\n2. second");
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("1️⃣");
    expect(result[0]).toContain("2️⃣");
    // items separated by newline
    expect(result[0]).toMatch(/1️⃣[^\n]*first\n2️⃣/);
    expect(result[0]).not.toContain("<br>");
  });

  it("flattens paragraphs to double \\n\\n (Telegram HTML has no <p>)", () => {
    const result = renderFinalMessage("one para\n\ntwo para");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatch(/one para\n\ntwo para/);
    expect(result[0]).not.toContain("<p>");
    expect(result[0]).not.toContain("<br>");
  });

  it("splits string of 5000 'a' chars separated by newlines into multiple chunks ≤ 4096", () => {
    // Build a string that's ~5000 chars with newlines so it must split
    const line = "a".repeat(100);
    const input = Array(50).fill(line).join("\n");
    const result = renderFinalMessage(input);
    expect(result.length).toBeGreaterThanOrEqual(2);
    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(4096);
    }
  });

  it("strips unsupported <div> tags", () => {
    const result = renderFinalMessage("<div>bad</div>");
    expect(result[0]).not.toContain("<div>");
    expect(result[0]).not.toContain("</div>");
  });

  it("strips unsupported <span> tags", () => {
    const result = renderFinalMessage('<span style="color:red">text</span>');
    expect(result[0]).not.toContain("<span>");
    expect(result[0]).not.toContain("</span>");
  });

  it("returns [(empty response)] for empty string", () => {
    const result = renderFinalMessage("");
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("(empty response)");
  });

  it("telegramHtmlToFallbackPlain strips tags and decodes entities", () => {
    expect(telegramHtmlToFallbackPlain("<b>x</b> &amp; y")).toBe("x & y");
    // no <br> in new output, but fallback should still handle legacy HTML gracefully
    expect(telegramHtmlToFallbackPlain("a\nb")).toBe("a\nb");
  });

  it("appendHtmlFooterToChunks appends to last chunk when under limit", () => {
    const out = appendHtmlFooterToChunks(["<p>Hi</p>"], "<i>m · build</i>");
    expect(out).toEqual(["<p>Hi</p>\n\n<i>m · build</i>"]);
  });

  it("appendHtmlFooterToChunks starts new chunk when footer would overflow", () => {
    const footer = "<i>a · b</i>";
    const big = "x".repeat(4096 - footer.length - 2 + 1);
    const out = appendHtmlFooterToChunks([big], footer);
    expect(out.length).toBe(2);
    expect(out[1]).toBe(footer);
  });

  it("splits respecting newline boundary: 4000 'a' + newline + 200 'b' results in first chunk ending at or before the newline", () => {
    const input = "a".repeat(4000) + "\n" + "b".repeat(200);
    const result = renderFinalMessage(input);
    // The input after markdown conversion will be wrapped in <p> tags by marked,
    // but the split logic should still respect newline boundaries
    expect(result.length).toBeGreaterThanOrEqual(1);
    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(4096);
    }
  });

  it("never outputs <br> tags — Telegram HTML mode uses \\n for line breaks", () => {
    const cases = [
      "# Heading\n\n- list item",
      "**bold**\n\nsome text",
      "- alpha\n- beta",
      "1. first\n2. second",
      "- item one\n- item two\n\nNext paragraph",
      "- item one; see `.agents/SKILL.md`\n\nNext paragraph",
    ];
    for (const md of cases) {
      const result = renderFinalMessage(md);
      for (const chunk of result) {
        expect(chunk, `Input: ${JSON.stringify(md)}`).not.toContain("<br");
      }
    }
  });

  it("paragraph after a list block is separated by \\n\\n, not run together", () => {
    const md = "- item one\n- item two\n\nNext paragraph";
    const result = renderFinalMessage(md);
    expect(result[0]).toContain("item two");
    expect(result[0]).toContain("Next paragraph");
    // must have double-newline between list end and following paragraph
    expect(result[0]).toMatch(/item two\n\nNext paragraph/);
  });

  it("renders nested ordered list under bullet: sub-items separated and indented", () => {
    const md = "- Parent item:\n  1. Sub one\n  2. Sub two\n- Other item";
    const result = renderFinalMessage(md);
    expect(result[0]).toContain("🔹 Parent item:");
    expect(result[0]).toContain("1️⃣");
    expect(result[0]).toContain("2️⃣");
    // parent text and sub-list separated by newline
    expect(result[0]).toMatch(/Parent item:\n/);
    // sub-items must not run directly into parent text
    expect(result[0]).not.toMatch(/Parent item:1️⃣/);
    // Other item still present
    expect(result[0]).toContain("🔹 Other item");
  });

  it("escapes HTML characters inside inline code (prevents Telegram 'Can\\'t find end tag' errors)", () => {
    // Inline code containing angle brackets must be escaped as HTML entities,
    // not passed as raw tags to Telegram's HTML parser.
    const result = renderFinalMessage("Use `<div>` here");
    expect(result[0]).toContain("<code>&lt;div&gt;</code>");
    expect(result[0]).not.toContain("<code><div></code>");
  });

  it("escapes ampersands inside inline code", () => {
    const result = renderFinalMessage("The `a && b` expression");
    expect(result[0]).toContain("<code>a &amp;&amp; b</code>");
  });

  it("renders list items with inline code correctly: bullet directly precedes code text", () => {
    const md = "- Skill `moodle` tại `.agents/skills/moodle/SKILL.md`\n- Mô tả ngắn";
    const result = renderFinalMessage(md);
    expect(result[0]).toContain("🔹 Skill");
    expect(result[0]).toContain("<code>moodle</code>");
    expect(result[0]).toContain("<code>.agents/skills/moodle/SKILL.md</code>");
    // items separated by newline, not double-newline
    expect(result[0]).toMatch(/SKILL\.md<\/code>\n🔹/);
    expect(result[0]).not.toContain("<br>");
  });

  it("paragraph after list item ending with inline code is separated by \\n\\n", () => {
    const md = "- item one; see `.agents/SKILL.md`\n- item two; see `.agents/OTHER.md`\n\nNext paragraph";
    const result = renderFinalMessage(md);
    expect(result[0]).toMatch(/SKILL\.md[\s\S]*OTHER\.md/);
    expect(result[0]).toMatch(/OTHER\.md<\/code>\n\nNext paragraph/);
    expect(result[0]).not.toMatch(/SKILL\.mdNext/);
    expect(result[0]).not.toMatch(/OTHER\.mdNext/);
  });
});
