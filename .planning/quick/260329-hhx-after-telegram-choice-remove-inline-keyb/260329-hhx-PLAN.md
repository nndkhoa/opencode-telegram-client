# Quick 260329-hhx: Remove inline keyboard after choice submitted

## Tasks

1. **callback-interactive** — After successful `postQuestionReply` / `postPermissionReply`, call `editMessageReplyMarkup` with an empty `InlineKeyboard` so Telegram removes the buttons. Use `rec.telegramMessageId` before `pending.clear`.

2. **Tests** — Extend `callback-interactive.test.ts` mocks with `editMessageReplyMarkup`; assert it runs on successful pick/permission.

## Verify

- `npm test` passes for `callback-interactive.test.ts`
