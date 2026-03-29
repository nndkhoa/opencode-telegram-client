# Quick task 260329-pxm: Telegram messages — HTML + emoji stand-ins

## Tasks

1. **`src/rendering/markdown.ts`**
   - Flatten `<p>` from marked to explicit `<br><br>` before sanitize so paragraph breaks stay visible as Telegram-safe HTML.
   - Unordered lists: prefix with `🔹` instead of `•`.
   - Ordered lists: use Unicode keycap digits `1️⃣`–`9️⃣`, `🔟` for 10, then `11.` style for 11+.
   - GFM tables: prepend a `📊` line before the fenced block (tables already become `<pre>`).

2. **`src/rendering/markdown.test.ts`**
   - Update list/table expectations; add paragraph `<br><br>` assertion if useful.
