---
status: partial
phase: 02-minimal-telegram-loop
source: [02-VERIFICATION.md]
started: 2026-03-28T21:40:00Z
updated: 2026-03-28T21:40:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Live Streaming End-to-End

expected: With OpenCode running at `localhost:4096`, send a text message to the bot from an allowlisted Telegram account. Typing indicator appears immediately, then "⏳ Thinking..." message appears, message is edited with accumulated tokens roughly every 500ms, and when OpenCode finishes the final message appears without the ⏳ prefix.
result: [pending]

### 2. Error State with Unreachable OpenCode

expected: Stop OpenCode, then send a message to the bot. Bot replies with "❌ OpenCode is unreachable. Make sure it's running at localhost:4096." — no crash, no unhandled rejection, no hang.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
