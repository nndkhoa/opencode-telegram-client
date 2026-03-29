# Quick task 260329-pxm — Summary

**Goal:** Keep Telegram `parse_mode: HTML` for bold/italic/code/links while making unsupported structures (lists, ordered lists, tables) readable with emoji and explicit breaks.

## Changes

- **`flattenParagraphs`:** Strip `<p>` from marked output and replace paragraph boundaries with `<br><br>` (sanitize may emit `<br />`) so spacing matches Telegram-supported HTML.
- **Lists:** Unordered items use `🔹`; ordered items use keycap emoji `1️⃣`–`9️⃣`, `🔟` for 10, then `11.` style for higher indices.
- **Tables:** GFM pipe tables still become fenced blocks → `<pre><code>`; a `📊` line is prepended so tables are visually distinct.

## Files

- `src/rendering/markdown.ts`
- `src/rendering/markdown.test.ts`

## Verification

- `npx vitest run` — all tests pass.
