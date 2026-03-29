# OpenCode Telegram Client

A Telegram bot that connects allowlisted users to a local OpenCode server on the same machine. The bot forwards messages for user IDs listed in configuration, streams model replies, and supports sessions and model selection commands.

## Prerequisites

- **Node.js** (current LTS or newer) for running the TypeScript bot
- **OpenCode** running locally (default port 4096) so the bot can reach its API

## Installation

```bash
npm install
```

Copy `.env.example` to `.env` and set values before running.

## Configuration

Environment variables (names match `.env.example`):

| Variable | Required | Description |
|----------|----------|-------------|
| `BOT_TOKEN` | Yes | Bot token for the TELEGRAM Bot API (create a bot with BotFather). |
| `ALLOWED_USER_IDS` | Yes | Comma-separated numeric user IDs that may use the bot. |
| `OPENCODE_URL` | No | Base URL for the OpenCode server; defaults to local port 4096 if unset. |
| `OPENCODE_SSE_VERBOSE` | No | Set to `1` to log verbose SSE details (optional). |

## Running

```bash
npm run dev
```

The process loads `.env`, connects to OpenCode, and starts the bot in long-polling mode.

## Allowlist

Only chats whose **TELEGRAM** user ID appears in `ALLOWED_USER_IDS` receive replies; everyone else is ignored before any OpenCode call. Adjust the list when your team or test accounts change.
