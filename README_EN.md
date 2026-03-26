# WeChat Channel Agents

A WeChat bot bridge that supports one or more WeChat bot accounts, with both **Claude Code** and **Codex** AI agents available in each bot and real-time switching between them.

<p align="center">
  <img src="docs/demo.png" width="320" alt="Demo screenshot" />
</p>

## Features

- **Dual Agent Support** — Connect Claude Code (Anthropic) and Codex (OpenAI) through one WeChat bot
- **Multi-Account Support** — Run multiple WeChat bot accounts at the same time and reply through the account that received the message
- **Live Switching** — Send `/claude` or `/codex` to switch agents instantly; the other agent's session is preserved
- **Session Persistence** — Dual-agent sessions are isolated per `bot account + WeChat user` and survive restarts
- **Security** — Built-in dangerous command blocking (rm -rf, sudo, etc.) and user allowlist
- **Media Support** — Upload/download images, files, and videos via CDN with AES encryption
- **Auto Chunking** — Long responses are automatically split into 4000-character chunks

## Quick Start

### Prerequisites

- Node.js >= 22
- WeChat >= 8.0.50 with iLink Bot support
- Claude Code server (ANTHROPIC_BASE_URL)
- Codex configuration (~/.codex/config.toml)

### Install

```bash
git clone https://github.com/legendtkl/wechat-channel-agents.git
cd wechat-channel-agents
npm install
```

### Configure

1. Copy templates:

```bash
cp config.example.json config.json
cp .env.example .env
```

2. Edit `.env` with your Claude Code credentials:

```bash
ANTHROPIC_BASE_URL=http://your-server:13654/
ANTHROPIC_AUTH_TOKEN=sk-xxx
```

3. Edit `config.json` as needed:

```json
{
  "defaultAgent": "claude",
  "wechat": {
    "baseUrl": "https://ilinkai.weixin.qq.com",
    "botType": "3"
  },
  "codex": {
    "sandboxMode": "danger-full-access",
    "workingDirectory": "/path/to/your/project"
  },
  "stateDir": "~/.wechat-agents",
  "allowedUsers": [],
  "adminUsers": ["your_wechat_user_id"],
  "logLevel": "INFO"
}
```

### Run

```bash
npm run dev
```

A QR code will appear in the terminal. Scan it with WeChat to log in. Once connected, you can chat with the bot.

To add more bot accounts while the service is running, use the admin command `/login`. A new QR code will be printed in the terminal and the extra account will be attached to the same service.

## Commands

| Command | Description |
|---------|-------------|
| `/claude` | Switch to Claude Code |
| `/codex` | Switch to Codex |
| `/reset` | Reset current agent session |
| `/status` | Show current agent type and session info |
| `/help` | List all available commands |
| `/cwd <path>` | Change working directory |
| `/login` | Admin-only command to add another bot account via QR login |
| `/logout` | Admin-only logout for all bot accounts, clear local credentials, and stop the service |
| Plain text | Send to current agent for processing |

The default agent is Claude Code. When you switch agents, the other agent's session is preserved — you can switch back and continue where you left off.
In multi-account mode, each `bot account + WeChat user` pair keeps its own agent session and `contextToken`, so replies do not bleed across bot accounts.
`/login` and `/logout` are only enabled for users listed in `adminUsers`. `adminUsers` must be configured separately — it does not inherit from `allowedUsers`. If `adminUsers` is empty, both commands are disabled.
Codex defaults to `danger-full-access` to avoid `bwrap` compatibility failures on some Linux hosts; override `codex.sandboxMode` if you want a stricter sandbox.

## Project Structure

```
src/
  index.ts                  # Entry point
  config.ts                 # Configuration loader
  types.ts                  # Type definitions

  agent/
    interface.ts            # AgentBackend unified interface
    registry.ts             # Agent registration factory
    claude/backend.ts       # Claude Code backend
    claude/hooks.ts         # Security hooks
    codex/backend.ts        # Codex backend (per-user threads)

  wechat/                   # WeChat API layer
    api.ts, login.ts, monitor.ts, send.ts, send-media.ts
    types.ts, context-token.ts, config-cache.ts, session-guard.ts

  bridge/
    dispatcher.ts           # Command parsing + agent routing
    formatter.ts            # Response formatting
    chunker.ts              # Text chunking

  auth/allowlist.ts         # User allowlist
  cdn/                      # CDN encryption/decryption
  media/                    # Media download
  storage/                  # Persistent storage (multi-account credentials, syncBuf, sessions)
  util/                     # Logger, random, redaction
```

## Architecture

```
User sends WeChat message
  → account monitor: one long-poll loop per bot account
  → dispatcher: parse commands / route to agent
    → /claude, /codex: switch agent
    → /login: admin adds another bot account
    → plain text: agent.run() → format → chunk → send
```

Core design: **Agent abstraction + Strategy pattern**. The `AgentBackend` interface unifies Claude and Codex calls. The Dispatcher routes messages based on the user's current agent selection. Each `bot account + WeChat user` session stores both `claudeSessionId` and `codexThreadId`, so switching agents doesn't lose conversation state and multi-account traffic stays isolated.

## Development

```bash
npm run typecheck   # Type checking
npm test            # Run tests
npm run build       # Compile
```

### Testing

The project uses [Vitest](https://vitest.dev/) with both unit tests and end-to-end tests:

- **Unit tests** — Cover core modules: allowlist, agent resolution, text chunking, state persistence, log redaction, and context token storage
- **End-to-end tests** — Cover the full message handling pipeline: message receipt → command parsing / agent routing → response formatting → message sending, including auth control, command handling, session management, error handling, and multi-user isolation

## License

MIT

---

[中文版](README.md)
