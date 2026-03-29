# Quick task 260329-h5o — Summary

**Done:** `markdownTablesToFencedCode()` runs before `marked()` in `renderFinalMessage`, replacing each GFM table’s `raw` text with the same text inside a ``` fence so the pipeline emits `<pre><code>` instead of stripped `<table>` HTML.

**Files:** `src/rendering/markdown.ts`, `src/rendering/markdown.test.ts`
