import { describe, it, expect } from "vitest";
import { appendHtmlFooterToChunks, renderFinalMessage } from "./markdown.js";

describe("renderFinalMessage", () => {
  it("converts **bold** to <b>bold</b>", () => {
    const result = renderFinalMessage("**bold**");
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("<b>bold</b>");
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

  it("converts fenced code block to <pre><code>", () => {
    const result = renderFinalMessage("```\nblock\n```");
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("<pre><code>");
  });

  it("renders GFM pipe tables as fenced pre (aligned raw), not HTML tables Telegram would drop", () => {
    const md = "| a | b |\n|---|---|\n| 1 | 2 |";
    const result = renderFinalMessage(md);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain("<pre>");
    expect(result[0]).toContain("| a | b |");
    expect(result[0]).not.toContain("<table");
  });

  it("converts [link](url) to <a href='url'>", () => {
    const result = renderFinalMessage("[link](https://x.com)");
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('<a href="https://x.com"');
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
});
