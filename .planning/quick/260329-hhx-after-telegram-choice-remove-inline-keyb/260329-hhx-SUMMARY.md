# Quick 260329-hhx — Summary

## Done

- Added `removeInlineKeyboardFromMessage()` using `editMessageReplyMarkup` with an empty `InlineKeyboard([])` (Telegram clears buttons only when markup is updated).
- Called it after successful `postPermissionReply` (Once / Always / Reject) and after `postQuestionReply` (multi submit + single pick), always before `pending.clear` so `telegramMessageId` is still available.
- Single-select success path now also shows callback toast `"Submitted."` (aligned with multi-submit).
- Tests assert `editMessageReplyMarkup` for permission once and question pick.

## Files

- `src/bot/handlers/callback-interactive.ts`
- `src/bot/handlers/callback-interactive.test.ts`
