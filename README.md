# OpenCode Telegram Client

A [Grammy](https://grammy.dev/)-based Telegram bot that connects allowlisted users to a local [OpenCode](https://github.com/anomalyco/opencode) server. It forwards chat messages, streams model replies into Telegram (with live edits), and exposes session and model management via commands.

## Features

- **Allowlisted access** — Only Telegram user IDs listed in configuration can use the bot; others are ignored.
- **Direct messages only** — Group chats are rejected so the bot stays a private assistant.
- **Streaming replies** — Subscribes to OpenCode’s SSE stream and updates the in-chat message as the model responds.
- **Sessions** — Named sessions per chat (`/new`, `/switch`, `/sessions`) backed by OpenCode.
- **Model selection** — `/model` to list or switch the active model.
- **Cancel in flight** — `/cancel` aborts the current request.
- **Photos** — Image messages are forwarded to the model (documents/voice/video/stickers are not supported).
- **Interactive prompts** — Handles OpenCode interactive events (e.g. questions/permissions) via inline callbacks when the server asks.

## Prerequisites

- **Node.js** — Current LTS or newer; the project uses ES modules (`"type": "module"`).
- **OpenCode** — Running and reachable (default `http://localhost:4096`). The bot performs a health check at startup and exits if the server is unavailable.

## Installation

```bash
npm install
```

Copy `.env.example` to `.env` and fill in values before running.

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `BOT_TOKEN` | Yes | Telegram bot token from [@BotFather](https://t.me/BotFather). |
| `ALLOWED_USER_IDS` | Yes | Comma-separated numeric Telegram user IDs allowed to use the bot. |
| `OPENCODE_URL` | No | Base URL for the OpenCode HTTP API. Defaults to `http://localhost:4096`. |
| `OPENCODE_SSE_VERBOSE` | No | Set to `1` to log verbose SSE / delta details for debugging. |

## Bot commands

These are registered with Telegram’s command menu on startup:

| Command | Description |
|---------|-------------|
| `/new` | Create and switch to a named session. |
| `/switch` | Switch to an existing named session. |
| `/sessions` | List sessions for this chat. |
| `/status` | Show active session and OpenCode health. |
| `/cancel` | Abort the current in-progress request. |
| `/model` | Switch the active model or list available models. |
| `/help` | Show all commands. |

## Development

Run TypeScript directly with `tsx` (hot iteration; no compile step):

```bash
npm run dev
```

The bot uses **long polling**. It loads `.env` from the **current working directory** via `dotenv`. Stop with `Ctrl+C` (SIGINT) or `SIGTERM` for graceful shutdown.

## Production

Run the compiled app with Node. The process must start with the **project root as the working directory** so `.env` and the `logs/` directory resolve correctly (see `src/logger.ts`).

### 1. Install and build

On the server (or in your deploy pipeline), from the repository root:

```bash
npm ci
npm run build
```

`npm ci` uses the lockfile for a reproducible install; use `npm install` if you prefer. You need **devDependencies** on the machine that runs `npm run build` (TypeScript is a dev dependency). If you build in CI and ship only artifacts, copy at least `dist/`, `package.json`, `package-lock.json`, and production `node_modules` (e.g. run `npm ci --omit=dev` after copying those files).

### 2. Configure the environment

- Copy `.env.example` to `.env` on the server (or inject the same variables via your host — `dotenv` still loads `.env` when present).
- Ensure **OpenCode** is running and reachable at `OPENCODE_URL` before starting the bot; startup calls the health endpoint and **exits** if OpenCode is down.
- Optional: set `LOG_LEVEL` (e.g. `warn` in production to reduce noise; default is `info`).

### 3. Start the process

```bash
node dist/main.js
```

Or, after a successful build:

```bash
npm start
```

(`npm start` runs `node dist/main.js`; run `npm run build` first.)

Do not use `npm run dev` in production — it runs `tsx` and is meant for development.

### 4. Keep it running (recommended)

Use a supervisor so the bot restarts after crashes or reboots.

**systemd** (Linux) — example unit; adjust `User`, `WorkingDirectory`, and paths:

```ini
[Unit]
Description=OpenCode Telegram bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/opt/opencode-telegram-client
Environment=NODE_ENV=production
ExecStart=/usr/bin/node dist/main.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Install with `sudo systemctl enable --now opencode-telegram.service` (name the file e.g. `/etc/systemd/system/opencode-telegram.service`). If OpenCode runs on the same host, add `After=` / `Requires=` to your OpenCode unit so the bot starts after the API is up.

**PM2** (cross-platform):

```bash
pm2 start dist/main.js --name opencode-telegram --cwd /opt/opencode-telegram-client
pm2 save
pm2 startup
```

### 5. Operations notes

- **Logs** — JSON lines under `logs/` (daily rotation) plus human-readable lines on stdout; point your log aggregator at those streams or files.
- **Updates** — Pull changes, `npm ci`, `npm run build`, restart the service.
- **Security** — Restrict who can read `.env` (bot token); keep the host firewall aligned with how OpenCode is exposed (often localhost-only if both run on one machine).

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Run `src/main.ts` with `tsx`. |
| `npm start` | Run `dist/main.js` (use after `npm run build`). |
| `npm run build` | Compile TypeScript with `tsc`. |
| `npm run test` | Run [Vitest](https://vitest.dev/) tests. |
| `npm run typecheck` | Typecheck without emitting files. |

## Project layout (overview)

- `src/main.ts` — Startup: health check, session registry, streaming manager, SSE loop, bot.
- `src/bot/` — Grammy bot, middleware (DM-only, allowlist), command and message handlers.
- `src/opencode/` — OpenCode API client, SSE handling, streaming state, display formatting.
- `src/session/` — Per-chat session registry.

