# Features Research

**Domain:** Telegram bot as a client/proxy for an AI coding assistant (OpenCode)  
**Researched:** 2026-03-28  
**Project alignment:** See `.planning/PROJECT.md` — this document generalizes the landscape; the project already encodes several “differentiators” as active requirements.

**Confidence overview:** Patterns below combine official Telegram Bot API behavior (HIGH), widely reported bot UX patterns (MEDIUM), and ecosystem anecdotes from AI-bridge bots (LOW where noted).

---

## Table Stakes

Features users expect from **any** competent AI Telegram bot. Missing these tends to feel broken or “toy.”

| Feature | Why users expect it | Complexity | Notes |
|--------|---------------------|------------|--------|
| **Clear `/help` and discoverable commands** | Telegram users rely on command hints and BotFather menus | Low | `/help` should list session, cancel, and status — not only “chat with AI.” |
| **Responsive feedback while waiting** | AI latency is high vs. normal chats | Low–Med | `sendChatAction` with `typing` (or `upload_document` when sending files) — must be refreshed ~every 4–5s for long work (official behavior: action expires quickly). |
| **Graceful long-output handling** | Telegram caps plain bot messages at **4096 characters** | Med | Split into sequential messages or attach as **document** for large code/logs; never silently truncate without notice. |
| **Stable formatting** | Unparsed entities / broken markdown look unprofessional | Med | HTML or MarkdownV2 must be **valid at send time**. Streaming/editing makes this harder (see Streaming Patterns). |
| **Basic conversation control** | Users need to stop mistakes and expensive runs | Low–Med | **Cancel/stop** (project: `/cancel`), optional “regenerate” if backend supports it. |
| **Session or thread continuity** | Users expect “it remembers what we were doing” within a chat | Med | At minimum: one active backend session per Telegram chat; better: named sessions (project requirement). |
| **Access control for sensitive tools** | Bots often reach private data or local APIs | Med | Allowlist (project), optional admin commands — **table stakes for a local dev proxy**, not for public trivia bots. |
| **Error surfaces that are human-readable** | Opaque “Error 500” erodes trust | Low | Map OpenCode/network errors to short explanations + what to try (`/status`, retry, check OpenCode). |

**Dependencies:** Formatting validity → depends on **streaming strategy** (you cannot send half-formed HTML). Long output handling → depends on **file/document path** vs split messages. Session continuity → depends on **backend session ID** mapping.

---

## Differentiators

What makes a **coding-assistant** Telegram client stand out versus generic ChatGPT-style bots.

| Feature | Value proposition | Complexity | Notes |
|--------|-------------------|------------|--------|
| **Named sessions + switching** | Separate “work contexts” (repos, tasks) without mixing | Med | Project: `/new`, `/switch`, `/sessions`. Reduces context pollution — strong differentiator for developers. |
| **True streaming with a clean final artifact** | Feels fast; final message is readable and copy-pasteable | Med–High | Project: stream live, then replace with clean final HTML. Matches “IDE assistant” expectations. |
| **MCP / tool clarification UX** | Coding agents often must ask — Telegram must not dead-end | High | Project: inline keyboards when choices exist; free text when open-ended. This is a **major** differentiator vs. dumb bridges. |
| **File ingestion** | Paste logs, configs, screenshots of errors | Med | Project: uploads to OpenCode. Table stakes for coding; **quality** of extraction (caption + file type) differentiates. |
| **Model switching & context commands** | Power users tune cost/latency and trim context | Med | Project lists model switching and context management — aligns with “assistant client,” not “single-model toy.” |
| **Observability for debugging** | Developers distrust black boxes | Med | Project: request/response logging (console/file). Differentiator for **local** dev tools. |
| **`/status` and health visibility** | Local OpenCode may be down or wedged | Low–Med | Shows connection to `localhost:4096`, queue state if applicable — critical for a **local** client. |
| **Code-oriented rendering** | Monospace blocks, sensible truncation of huge diffs | Med | Use HTML `<pre><code>` (or Telegram’s code entities); consider sending **file** for megabyte-scale output. |

**Dependencies:** MCP clarification UX → requires **correlation** between a pending question id and Telegram UI (buttons vs reply). File handling → requires **OpenCode API** contract for attachments. Streaming + clean final → requires **two-phase UI** (draft/stream → finalize).

---

## Anti-Features

Things that **sound** useful but commonly cause reliability, security, or UX problems.

| Anti-feature | Why it goes wrong | What to do instead |
|--------------|-------------------|---------------------|
| **Raw streaming of formatted text without a safe intermediate** | Half-open tags or entities → `can't parse entities` / flicker | Buffer until safe boundary, stream plain text only, or use **native draft streaming** (see below); finalize with validated HTML. |
| **Excessive `editMessageText` frequency** | Rate limits, janky UX, notification noise on some clients | Throttle edits (e.g., 2–5 per second cap), batch tokens, or prefer **`sendMessageDraft`** where available. |
| **Leaving typing indicators running** | “Bot stuck typing” after completion (reported in some AI bridge projects) | Stop refresh loop when response completes or on error; tie to request lifecycle. |
| **Implicit execution of shell/commands from model output** | Security nightmare on a dev machine | Never auto-run; keep execution in OpenCode’s explicit UX — bot only **relays** intent. |
| **Silent truncation of code** | Broken snippets, bad copy-paste | Explicit “continued in next message” or `.txt` document. |
| **Group-wide session without strong boundaries** | Wrong context, spam, privacy leaks | Default **private** for dev assistant; if group ever supported: per-thread sessions + explicit mention triggers. |
| **Persistent storage of secrets in bot state** | Token leakage via logs/backups | Env/config for allowlist; don’t store API keys in chat session objects. |
| **Overloading one message with keyboards + long text** | Clutter, mis-taps | Separate “question” short message with buttons; put explanation above or below consistently. |

---

## Session Management Patterns

How production-style bots usually structure state — maps cleanly onto OpenCode “sessions.”

| Pattern | Description | Fit for this project |
|--------|-------------|----------------------|
| **Per-chat default session** | First message creates backend session; subsequent messages reuse | **Required** (PROJECT.md): default session per Telegram chat. |
| **Named sessions** | User-created labels map to distinct backend session IDs | **Required**: `/new`, `/switch`, `/sessions`. |
| **Single “active session” pointer** | Chat-scoped variable: `activeSessionId` | Typical; commands mutate pointer. |
| **Queue vs interrupt** | New user message while AI is streaming — cancel in-flight vs queue | **Decision**: `/cancel` implies user expects **interrupt**; define whether a new message auto-cancels or queues (queue is simpler but slower UX). |
| **Idempotent mapping** | Persist `telegram_chat_id → { sessionName → opencodeSessionId }` | Med complexity; in-memory OK for local MVP if process restart loses state is acceptable — document tradeoff. |
| **Forum topics / threads** | `message_thread_id` as sub-session key | Optional future: powerful for power users; easy to get wrong (routing bugs are common in forum-topic bots — **LOW confidence** anecdote from ecosystem issues). |

**Feature dependencies:** Named sessions **→** session list **→** switch command; status/cancel **→** active in-flight request handle.

---

## Streaming Patterns

Telegram does not expose a classic WebSocket “token stream” to users; bots **simulate** streaming.

| Pattern | Mechanism | Pros | Cons |
|--------|-----------|------|------|
| **A. `editMessageText` / `editMessageCaption`** | One bot message; repeatedly edit content as tokens arrive | Works on all clients historically | 4096-char limit; entity parse errors if formatting applied too early; rate limits; flicker |
| **B. `sendMessageDraft` (Bot API 9.3+)** | Official **partial message streaming** while generating | Smoother UX; aligns with “draft” mental model | Requires current API; check client support; still need final “commit” semantics per product |
| **C. Typing + single send** | `sendChatAction(typing)` then one `sendMessage` at end | Simple, safe formatting | No streaming feel |
| **D. Chunked messages** | Send many short messages | Avoids edit limits | Chatty; feels spammy without good pacing |

**Typing indicator:** `sendChatAction` actions expire quickly (~5s per call — **MEDIUM confidence** from community docs); loop every ~4–5s while work continues. Use **`upload_document`** when user expectation is “file incoming.”

**Formatting pitfall (HIGH confidence from repeated reports):** Applying HTML/Markdown**V2** to **incomplete** model output breaks entities. Mitigations: stream **plain text** edits, or delay rich formatting until final message (matches PROJECT.md’s “stream then clean final”).

**Feature dependencies:** Streaming **→** cancel must abort token reader **→** finalize must still run or skip cleanly.

---

## MCP/Tool Question Patterns

When the model (or OpenCode) must **pause** for user input — e.g. MCP `mcp_question` — the bot is a **modal UI** over chat.

| Pattern | When to use | Implementation sketch | Complexity |
|--------|-------------|-------------------------|------------|
| **Inline keyboard (2–N fixed options)** | Multiple choice, yes/no, pick tool/resource | `InlineKeyboardMarkup` + short `callback_data` (payload size limits — keep ids in DB/map); **must** `answerCallbackQuery` | Med |
| **Force-reply or prompt text** | Open-ended clarification | Send prompt message; next user text in chat is the answer (FSM state = “awaiting MCP answer”) | Med |
| **Combine** | Explain + choose | Text in message body; buttons for options; if “Other,” ask for text next | Med–High |
| **TTL / timeout** | User never answers | Auto-cancel or resume with default — product decision; avoid indefinite blocking of session | Low–Med |
| **Correlation id** | Multiple concurrent chats | Store `pendingQuestionId` per chat (or per session) so replies route correctly | Med |

**Anti-patterns:** More than ~**8–10** buttons per message gets unwieldy — use pagination or “first N options + type query.” **Callback data** length is limited (64 bytes historically — verify current Bot API limits in implementation docs).

**Dependencies:** MCP UI **→** requires **exclusive** “waiting for answer” state **→** interacts with streaming cancel and new user messages.

---

## Feature Dependency Graph (Summary)

```
Allowlist + /help
       ↓
Default session per chat ──→ Named sessions (/new, /switch, /sessions)
       ↓                              ↓
Inbound message ──→ OpenCode SSE stream ──→ Streaming UI (draft/edit) ──→ Final HTML message
       ↓                    ↓
   File upload          mcp_question ──→ Inline keyboard OR text reply ──→ Resume OpenCode
       ↓
 /cancel ──→ Abort in-flight stream + clear pending MCP state (define rules)
       ↓
 /status ──→ OpenCode health + active session + in-flight?
```

---

## Sources

- [Telegram Bot API — changelog / `sendMessageDraft`](https://core.telegram.org/bots/api) (HIGH — official; Bot API 9.3 introduced `sendMessageDraft`, 9.5 notes all bots may use it)
- [Telegram Bot API — `sendChatAction`](https://core.telegram.org/bots/api#sendchataction) (HIGH)
- Community: Stack Overflow / GitHub discussions on streaming + entity parse errors (MEDIUM — pattern repeated, not formally “specified”)
- Ecosystem anecdotes: forum topic routing bugs in complex AI bridge bots (LOW — useful as risk flag, not as Telegram guarantees)

---

## Gaps / Phase-Specific Research

- Exact **OpenCode** event schema for `mcp_question` (fields for options vs free text) — **block implementation design**; not derivable from Telegram alone.
- **`sendMessageDraft`** client coverage and rate limits vs `editMessageText` — verify against chosen Bot API version and node-telegram-bot-api / grammY behavior.
- Whether local Bot API server is needed for **large file** uploads (official docs: local server raises upload limits) — only if files exceed default limits.
