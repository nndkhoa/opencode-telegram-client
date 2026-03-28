---
status: partial
phase: 04-session-commands
source: [04-VERIFICATION.md]
started: 2026-03-28T16:54:40Z
updated: 2026-03-28T16:54:40Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. BotFather command menu visible in Telegram
expected: After starting the bot, the "/" menu in Telegram shows all 6 commands (/new, /switch, /sessions, /status, /cancel, /help) with their descriptions as registered via setMyCommands()
result: [pending]

### 2. Live /cancel flow aborts active session
expected: When a message is being streamed, sending /cancel stops the stream, calls abortSession(), and replies "Session cancelled." (or similar confirmation)
result: [pending]

### 3. /status shows correct model display
expected: /status replies with the active session name, session ID, and model name from the OpenCode session info endpoint
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
