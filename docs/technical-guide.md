# WeChat Channel Agents：技术与使用指南

## 目录

- [一、背景与动机](#一背景与动机)
- [二、环境准备与依赖安装](#二环境准备与依赖安装)
- [三、配置与启动](#三配置与启动)
- [四、使用指南](#四使用指南)
- [五、技术架构](#五技术架构)
- [六、核心模块详解](#六核心模块详解)
- [七、错误处理与容灾](#七错误处理与容灾)
- [八、扩展新 Agent](#八扩展新-agent)
- [九、参考资料](#九参考资料)

---

## 一、背景与动机

### 1.1 让 AI 编程 Agent 装进口袋

**Claude Code**（Anthropic）和 **Codex CLI**（OpenAI）是当前最强大的两个 AI 编程命令行工具，前者擅长代码理解与多文件重构，后者擅长命令执行与快速生成。它们的日常使用场景是开发者坐在电脑前、在终端中交互。

但现实中我们经常需要在**离开电脑**的情况下操控这些 agent —— 通勤路上让 agent 跑个重构任务、午饭时检查测试结果、或临时修个紧急 bug。**微信是国内开发者最常用的移动端入口**，将 AI agent 接入微信 bot，就能随时随地用手机发指令、看结果，把桌面工具变成随身助手。

### 1.2 一个 Bot，两个 Agent

微信 iLink Bot 同一时间只能登录一个 bot 实例。如果 Claude 和 Codex 分别部署独立的桥接服务，就无法同时运行，切换 agent 需要重新扫码登录。WeChat Channel Agents 解决了这个问题：

- **一次扫码**，同时接入 Claude Code 和 Codex
- 通过 `/claude` 和 `/codex` 命令**实时切换**，无需重新登录
- 切换时**保留双方的会话状态**，随时切回继续上一段对话

典型使用场景：

- **移动办公** — 通勤、外出时用手机远程操控服务器上的编程 agent
- **异步任务** — 发一条指令让 agent 执行长任务，稍后再看结果
- **Agent 对比** — 同一个问题分别让 Claude 和 Codex 回答，对比后选优
- **按需切换** — 深度代码分析用 Claude，快速命令执行用 Codex
- **团队共享** — 多人共用一个 bot，各自独立 session，互不干扰

### 1.3 致谢：openclaw-weixin

本项目的微信 API 通信层借鉴了腾讯官方开源的 **[@tencent-weixin/openclaw-weixin](https://github.com/nicepkg/openclaw-weixin)**（MIT License）。openclaw-weixin 是微信 iLink Bot 的官方 TypeScript 参考实现，提供了完整的微信 bot 协议对接能力，包括：

- QR 码登录流程（`get_bot_qrcode` / `get_qrcode_status`）
- 长轮询消息获取（`getUpdates` + sync buffer 断点续传）
- 消息发送（文本、图片、文件、视频）
- CDN 媒体加解密（AES-128-ECB）
- Typing 状态指示器
- 会话过期处理（errcode -14 暂停机制）

本项目在 openclaw-weixin 的基础上进行了模块化重构，将微信通信层与 AI agent 逻辑解耦，使其能灵活支持多种 agent 后端。原始协议类型定义、API 请求构造、CDN 加解密算法等核心代码均源自 openclaw-weixin，我们在此基础上做了以下适配：

- 将 API 客户端从类实例模式改为函数式调用，支持动态传入 `routeTag`
- 抽取 `WeixinConfigManager` 实现 typing ticket 的缓存与指数退避刷新
- 将 monitor 从紧耦合 handler 改为通用 `onMessage` callback 模式
- 统一两个项目的类型定义为超集（含 CDN 媒体类型、上传 URL 等）

---

## 二、环境准备与依赖安装

### 2.1 系统要求

| 依赖 | 最低版本 | 说明 |
|------|---------|------|
| **Node.js** | >= 22.0.0 | 运行时环境，需支持 ES2022 + fetch API |
| **npm** | >= 10.0.0 | 包管理器（随 Node.js 安装） |
| **微信** | >= 8.0.50 | 需支持 iLink Bot 功能 |

### 2.2 安装 Claude Code CLI

Claude Code 是 Anthropic 的命令行编程工具。本项目的 Claude 后端通过 `@anthropic-ai/claude-agent-sdk` 调用它，**需要先在系统上安装 Claude Code CLI**。

```bash
# 通过 npm 全局安装
npm install -g @anthropic-ai/claude-code

# 验证安装
claude --version
```

安装后需要确保 Claude Code 服务端可访问。如果使用自建代理，需要获取：
- `ANTHROPIC_BASE_URL` — 服务端地址（如 `http://your-server:13654/`）
- `ANTHROPIC_AUTH_TOKEN` — 认证 token

> **注意**：`@anthropic-ai/claude-agent-sdk`（npm 依赖）是 SDK 库，用于程序化调用 Claude Code；而 `claude` CLI 是它的运行时，两者都需要。

### 2.3 安装 Codex CLI

Codex 是 OpenAI 的命令行编程工具。本项目的 Codex 后端通过 `@openai/codex-sdk` 调用它，**需要先在系统上安装 Codex CLI**。

```bash
# 通过 npm 全局安装
npm install -g @openai/codex

# 验证安装
codex --version
```

Codex 的模型和沙箱配置读取自 `~/.codex/config.toml`，请确保该文件已正确配置：

```toml
# ~/.codex/config.toml 示例
model = "o4-mini"
sandbox = "workspace-write"
```

### 2.4 安装项目

```bash
git clone https://github.com/legendtkl/wechat-channel-agents.git
cd wechat-channel-agents
npm install
```

### 2.5 依赖总览

```
运行时依赖:
  @anthropic-ai/claude-agent-sdk  — Claude Code SDK（程序化调用）
  @openai/codex-sdk               — Codex SDK（程序化调用）
  dotenv                          — .env 文件加载
  qrcode-terminal                 — 终端二维码显示

系统依赖（需预先安装）:
  claude (CLI)                    — Claude Code 运行时
  codex (CLI)                     — Codex 运行时
  Node.js >= 22                   — JavaScript 运行时
```

---

## 三、配置与启动

### 3.1 配置文件

项目使用两个配置文件：

**`.env`** — 敏感凭证（不入 git）：

```bash
# Claude Code 后端（必填，否则 Claude 后端不会注册）
ANTHROPIC_BASE_URL=http://your-server:13654/
ANTHROPIC_AUTH_TOKEN=sk-xxx

# 可选
LOG_LEVEL=INFO
ALLOWED_USERS=user1,user2    # 留空则允许所有人
```

**`config.json`** — 结构化配置：

```json
{
  "defaultAgent": "claude",
  "wechat": {
    "baseUrl": "https://ilinkai.weixin.qq.com",
    "routeTag": null,
    "botType": "3"
  },
  "codex": {
    "workingDirectory": "/path/to/your/project"
  },
  "stateDir": "~/.wechat-agents",
  "allowedUsers": [],
  "maxSessionAge": 86400000,
  "textChunkLimit": 4000,
  "logLevel": "INFO"
}
```

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `defaultAgent` | `"claude"` | 新用户默认使用的 agent |
| `codex.workingDirectory` | `"."` | agent 的默认工作目录 |
| `stateDir` | `"~/.wechat-agents"` | 持久化数据目录 |
| `allowedUsers` | `[]` | 用户白名单，空数组 = 不限制 |
| `maxSessionAge` | `86400000` | 会话过期时间（毫秒，默认 24h） |
| `textChunkLimit` | `4000` | 微信消息分片长度上限 |

### 3.2 启动服务

```bash
npm run dev
```

首次启动会显示二维码，用微信扫码登录。凭证会保存到 `~/.wechat-agents/state.json`，后续启动自动复用（过期后会重新弹出二维码）。

### 3.3 后台运行（生产环境）

```bash
# 使用 nohup
nohup npm run dev > output.log 2>&1 &

# 或使用 pm2
npx pm2 start "npm run dev" --name wechat-agents
```

---

## 四、使用指南

### 4.1 命令一览

| 命令 | 效果 |
|------|------|
| `/claude` | 切换到 Claude Code agent |
| `/codex` | 切换到 Codex agent |
| `/reset` | 重置当前 agent 的会话（清除上下文） |
| `/status` | 显示当前 agent 类型、工作目录、会话信息 |
| `/help` | 显示帮助信息 |
| `/cwd <path>` | 修改工作目录；不带参数则显示当前目录 |
| 直接发文字 | 发送给当前 agent 处理 |

### 4.2 典型使用流程

```
你：你好                          → Claude 回复（默认 agent）
你：帮我看看 src/index.ts 的逻辑   → Claude 读文件、分析、回复
你：/codex                        → "Switched to codex..."
你：运行一下测试                    → Codex 执行命令、返回结果
你：/claude                       → "Switched to claude..."（之前的 Claude 会话还在）
你：继续刚才的分析                  → Claude 在之前的上下文中继续
```

### 4.3 会话机制

- **双 session 存储**：每个用户同时维护 `claudeSessionId` 和 `codexThreadId`
- **切换不丢失**：`/codex` 切走后 Claude 的 session 仍保留，`/claude` 切回时自动恢复
- **`/reset` 只重置当前**：如果当前是 Claude，只清 Claude 的 session；Codex 的不受影响
- **自动过期**：超过 `maxSessionAge`（默认 24h）未活动的 session 会被自动清理

---

## 五、技术架构

### 5.1 整体架构

```
┌──────────────────────────────────────────────────┐
│                  微信用户                         │
└──────────────────┬───────────────────────────────┘
                   │ 发送消息
                   ▼
┌──────────────────────────────────────────────────┐
│              WeChat iLink API                     │
│         (long-poll: getUpdates)                   │
└──────────────────┬───────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────┐
│              Monitor (monitor.ts)                 │
│    长轮询 → 重试/退避 → 会话过期处理               │
└──────────────────┬───────────────────────────────┘
                   │ onMessage(msg, typingTicket)
                   ▼
┌──────────────────────────────────────────────────┐
│            Dispatcher (dispatcher.ts)             │
│                                                   │
│  1. 过滤非 USER 消息                              │
│  2. 缓存 context_token                            │
│  3. 白名单检查                                    │
│  4. 命令解析 (/claude /codex /reset ...)          │
│  5. 路由到 Agent                                  │
└─────────┬────────────────────────┬───────────────┘
          │                        │
          ▼                        ▼
┌─────────────────┐    ┌─────────────────┐
│  ClaudeBackend  │    │  CodexBackend   │
│                 │    │                 │
│ claude-agent-sdk│    │  codex-sdk      │
│ session resume  │    │ per-user thread │
│ security hooks  │    │ event streaming │
└────────┬────────┘    └────────┬────────┘
         │                      │
         └──────────┬───────────┘
                    │ AgentResponse
                    ▼
┌──────────────────────────────────────────────────┐
│           Response Pipeline                       │
│                                                   │
│  formatter: 代码截断 + tool 摘要 + 错误标记        │
│       ↓                                           │
│  markdownToPlainText: MD → 纯文本                 │
│       ↓                                           │
│  chunker: 按 4000 字符分片                         │
│       ↓                                           │
│  sendTextMessage: 逐片发送到微信                   │
└──────────────────────────────────────────────────┘
```

### 5.2 核心设计模式

**策略模式（Strategy Pattern）**：`AgentBackend` 接口定义统一调用契约，Claude 和 Codex 分别实现。Dispatcher 通过 Registry 按用户选择获取对应策略，实现运行时切换。

```typescript
// 统一接口
interface AgentBackend {
  readonly type: AgentType;
  run(req: AgentRequest): Promise<AgentResponse>;
  resetSession(userId: string): void;
  getStatus(userId: string): string;
}

// Registry 注册/获取
registerAgent(new ClaudeBackend(config));
registerAgent(new CodexBackend(config));
const agent = getAgent(session.agentType);  // 运行时选择
```

### 5.3 项目结构

```
src/
  index.ts                    # 入口：配置 → 登录 → 注册 agent → 启动 monitor
  config.ts                   # 统一配置（config.json + .env）
  types.ts                    # AppConfig, UserSession, AgentType

  agent/
    interface.ts              # AgentBackend 接口定义
    registry.ts               # Agent 注册工厂（Map<AgentType, AgentBackend>）
    claude/
      backend.ts              # Claude 后端：包装 claude-agent-sdk query()
      hooks.ts                # 安全 hooks：拦截危险 Bash 命令
    codex/
      backend.ts              # Codex 后端：per-user thread 管理

  wechat/                     # 微信 API 层
    types.ts                  # 协议类型（含 CDN/媒体类型）
    api.ts                    # iLink Bot HTTP 客户端
    login.ts                  # QR 码登录
    monitor.ts                # Long-poll 消息循环
    send.ts                   # 发送文本（markdown 转换 + 分片）
    send-media.ts             # 发送媒体（图片/文件/视频）
    context-token.ts          # Per-user context token 缓存
    config-cache.ts           # Typing ticket 缓存（指数退避）
    session-guard.ts          # 会话过期暂停逻辑

  bridge/
    dispatcher.ts             # 命令解析 + agent 路由 + 消息分发
    formatter.ts              # 响应格式化（tool 摘要、代码截断）
    chunker.ts                # 文本分片（4000 字符限制）

  auth/
    allowlist.ts              # 用户白名单

  cdn/                        # CDN 加解密（AES-128-ECB）
    aes-ecb.ts, cdn-upload.ts, cdn-url.ts, pic-decrypt.ts, upload.ts

  media/                      # 媒体下载
    download.ts, mime.ts

  storage/
    state.ts                  # 持久化管理（credentials, syncBuf）
    sessions.ts               # Per-user session CRUD

  util/
    logger.ts                 # 日志（console + 文件，级别过滤）
    random.ts                 # ID 生成
    redact.ts                 # 日志脱敏
```

---

## 六、核心模块详解

### 6.1 Claude Backend

```typescript
// src/agent/claude/backend.ts
class ClaudeBackend implements AgentBackend {
  async run(req: AgentRequest): Promise<AgentResponse> {
    const options: Options = {
      cwd: req.cwd,
      allowedTools: ["Read", "Edit", "Write", "Bash", "Grep", "Glob",
                     "WebSearch", "WebFetch", "Agent"],
      permissionMode: "bypassPermissions",
      hooks: createHooks(),         // 安全拦截
      maxTurns: 30,                 // 防止无限循环
      env: { ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN },
    };

    if (session?.claudeSessionId) {
      options.resume = session.claudeSessionId;  // 会话恢复
    }

    const stream = query({ prompt, options });
    // 流式收集 assistant 文本、tool_use、result...
  }
}
```

**安全 Hooks**（`hooks.ts`）：在 Bash 命令执行前检查，拦截危险模式：
- `rm -rf /`、`sudo`、`shutdown`、`dd of=/dev/`
- `git push --force`、`git reset --hard`
- `curl ... | sh`（管道执行）

### 6.2 Codex Backend

```typescript
// src/agent/codex/backend.ts
class CodexBackend implements AgentBackend {
  // 每个用户独立的 Codex 实例和线程
  private users = new Map<string, { codex: Codex, thread: Thread }>();

  async run(req: AgentRequest): Promise<AgentResponse> {
    const entry = this.ensureThread(req.userId);  // 创建或恢复线程
    const { events } = await entry.thread.runStreamed(req.prompt);

    for await (const event of events) {
      // 映射事件：agent_message → text
      //          command_execution → command + output
      //          file_change → path + action
      //          turn.failed / error → error message
    }
  }
}
```

关键区别：原 codex 项目是全局单线程，合并后改为 `Map<userId, PerUserCodex>`，实现多用户隔离。

### 6.3 Dispatcher 路由

消息处理流程：

```
收到消息
  → message_type !== USER?  → 忽略
  → 缓存 context_token
  → 提取文本（item_list 中的 TEXT 项）
  → 文本为空?  → 忽略
  → 不在白名单?  → 记日志，忽略
  → 解析命令?
      /claude → 切换 agent，保留旧 session
      /codex  → 切换 agent，保留旧 session
      /reset  → 重置当前 agent 的 session
      /status → 展示信息
      /help   → 展示命令列表
      /cwd    → 修改/查看工作目录
  → 普通消息:
      1. 启动 typing 指示器（每 10s 刷新）
      2. agent.run({ userId, prompt, cwd })
      3. 停止 typing
      4. formatResponse → markdownToPlainText → chunkText
      5. 逐片发送，片间间隔 200ms
```

### 6.4 长轮询 Monitor

```
while (!aborted) {
  resp = getUpdates(buf, timeout=35s)

  if session expired (errcode=-14):
    暂停 1 小时，避免反复请求

  if API 错误:
    consecutiveFailures++
    < 3 次: 等 2s 重试
    >= 3 次: 等 30s 退避，重置计数

  if 成功:
    更新 buf（用于断点续传）
    遍历消息 → 获取 typingTicket → dispatch
}
```

### 6.5 响应处理管线

```
Agent 返回原始文本
    ↓
formatter.ts:
  - 截断超长代码块（>1000 字符 → 保留前 30 行）
  - 追加 [Tools: Read, Bash(x3)] 摘要
  - 错误时追加 [Error] 前缀
    ↓
send.ts → markdownToPlainText:
  - 去除 ```代码围栏```，保留代码内容
  - 删除图片 ![]()
  - 链接 [text](url) → text
  - 去除 **粗体** *斜体* `内联代码`
  - 表格管道符 → 空格分隔
  - # 标题 → 纯文本
  - 列表符号 → •
    ↓
chunker.ts:
  - <= 4000 字符 → 直接发送
  - > 4000 字符 → 优先在换行处分割
                 → 其次在空格处分割
                 → 最后硬截断
    ↓
sendTextMessage: 逐片发送，附带 context_token
```

---

## 七、错误处理与容灾

### 7.1 重试策略

| 场景 | 策略 | 参数 |
|------|------|------|
| 长轮询瞬时失败 | 快速重试 | 2s 间隔，最多 3 次 |
| 连续 3 次失败 | 退避重试 | 30s 间隔，重置计数 |
| 会话过期 (errcode=-14) | 长暂停 | 1 小时，防止频繁请求 |
| CDN 上传失败 | 递增重试 | 最多 3 次，间隔 1s/2s/3s |
| Typing 发送失败 | 静默忽略 | 非关键功能 |

### 7.2 优雅关闭

```typescript
// SIGINT / SIGTERM 触发:
abortController.abort();       // 通知 monitor 停止轮询
clearInterval(cleanupInterval); // 停止定时清理
// monitor 中 sleep 感知 abort 信号，立即退出循环
```

### 7.3 持久化与恢复

- **登录凭证**：保存到 `~/.wechat-agents/state.json`，重启自动复用
- **轮询游标**（getUpdatesBuf）：每次更新后持久化，重启后从断点继续
- **用户 session**：保存到 `sessions/sessions.json`，重启后恢复所有用户的 agent 选择和会话 ID

---

## 八、扩展新 Agent

得益于策略模式，添加新的 agent 只需三步：

### 1. 实现 AgentBackend 接口

```typescript
// src/agent/my-agent/backend.ts
import type { AgentBackend, AgentRequest, AgentResponse } from "../interface.js";

export class MyAgentBackend implements AgentBackend {
  readonly type = "my-agent" as const;

  async run(req: AgentRequest): Promise<AgentResponse> {
    // 调用你的 AI SDK
    return { text: "response", isError: false, toolsUsed: [] };
  }

  resetSession(userId: string): void { /* ... */ }
  getStatus(userId: string): string { return "MyAgent: ok"; }
}
```

### 2. 扩展 AgentType

```typescript
// src/types.ts
export type AgentType = "claude" | "codex" | "my-agent";
```

### 3. 在入口注册

```typescript
// src/index.ts
import { MyAgentBackend } from "./agent/my-agent/backend.js";
registerAgent(new MyAgentBackend(config));
```

注册后，用户即可通过 `/my-agent` 命令切换到新 agent。无需修改 Dispatcher 或其他模块。

---

## 九、参考资料

- **Claude Code** — https://docs.anthropic.com/en/docs/claude-code
- **Claude Agent SDK** — https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk
- **Codex CLI** — https://github.com/openai/codex
- **Codex SDK** — https://www.npmjs.com/package/@openai/codex-sdk
- **openclaw-weixin** — https://github.com/nicepkg/openclaw-weixin — 微信 iLink Bot 官方 TypeScript 参考实现（MIT License），本项目微信通信层的核心参考来源
- **本项目源码** — https://github.com/legendtkl/wechat-channel-agents
