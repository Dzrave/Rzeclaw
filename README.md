# Rzeclaw — 最小核心版智能助手

基于 [OpenClaw](https://github.com/openclaw/openclaw) 的**最核心机制**提取：仅保留「智能操作电脑」所需的能力，无多余渠道与适配，便于在此之上按需扩展。

## 设计目标

- **轻量**：只保留 Gateway 控制面 + Agent 推理 + 核心工具（bash / read / write / edit / process）。
- **非 MVP**：具备完整「用户消息 → LLM → 工具调用 → 再推理」的闭环，而不是单次问答。
- **可扩展**：架构清晰，后续可在此最小核心上增加渠道、技能或更多工具。

## 与 OpenClaw 的对应关系

| OpenClaw | Rzeclaw |
|----------|---------|
| Gateway (WS 控制面) | ✅ 简化版 Gateway，仅会话 + 工具派发 + chat |
| Pi Agent (RPC) | ✅ 内置 Agent 循环（Anthropic Messages API + 工具调用） |
| 工具：bash, read, write, edit, process | ✅ 同组核心工具 |
| 多通道 (WhatsApp/Telegram/…) | ❌ 不包含 |
| Browser / Canvas / Nodes / Cron / Skills | ❌ 不包含 |
| Control UI / WebChat / Tailscale | ❌ 不包含 |

## 快速开始

**环境**：Node ≥18，需 Anthropic API Key。

```bash
# 安装依赖并构建
cd e:\Rzeclaw
npm install
npm run build

# 配置 API Key（二选一）
# 1. 环境变量
set ANTHROPIC_API_KEY=sk-ant-...

# 2. 或项目根 / 用户目录下 rzeclaw.json 中配置 apiKeyEnv 指向其它变量名
```

**方式一：直接对话（不启动 Gateway）**

```bash
node rzeclaw.mjs agent "列出当前目录下的前 10 个文件"
```

**方式二：先起 Gateway，再通过 WS 发 chat**

```bash
# 终端 1
node rzeclaw.mjs gateway

# 终端 2：用任意 WS 客户端连 ws://127.0.0.1:18789，发 JSON：
# { "id": "1", "method": "chat", "params": { "message": "列出当前目录文件" } }
```

## 配置

在项目根或 `~/.rzeclaw/config.json` 放置 `rzeclaw.json`（或 `config.json`），例如：

```json
{
  "model": "anthropic/claude-sonnet-4-20250514",
  "workspace": "E:\\Rzeclaw\\workspace",
  "port": 18789,
  "apiKeyEnv": "ANTHROPIC_API_KEY"
}
```

- **model**：Anthropic 模型 ID，可带或不带 `anthropic/` 前缀。
- **workspace**：Agent 的工作目录（bash 的 cwd，read/write/edit 的根）。
- **port**：Gateway WebSocket 端口。
- **apiKeyEnv**：API Key 所在环境变量名，不填则默认 `ANTHROPIC_API_KEY`。

## 核心工具

| 工具 | 说明 |
|------|------|
| `bash` | 在 workspace 下执行 shell 命令（Windows 下为 cmd）。 |
| `read` | 读取工作区内文件，可选 `limit` 限制行数。 |
| `write` | 写入文件，自动创建父目录。 |
| `edit` | 按 `old_string` / `new_string` 做首次匹配替换。 |
| `process` | `action: list` 列出进程，`action: kill` + `pid` 结束进程。 |

所有文件类工具路径均相对于 **workspace**，且禁止访问 workspace 外路径。

## 项目结构（最小核心）

```
Rzeclaw/
├── src/
│   ├── index.ts       # 入口，加载 dotenv 并跑 CLI
│   ├── cli.ts         # 命令：gateway / agent
│   ├── config.ts      # 配置加载
│   ├── agent/
│   │   └── loop.ts    # Agent 循环：LLM + 多轮工具调用
│   ├── gateway/
│   │   └── server.ts  # WebSocket Gateway，会话 + chat + tools.call
│   └── tools/
│       ├── types.ts
│       ├── bash.ts
│       ├── read.ts
│       ├── write.ts
│       ├── edit.ts
│       ├── process.ts
│       └── index.ts   # 注册 CORE_TOOLS
├── package.json
├── tsconfig.json
├── rzeclaw.mjs        # 二进制入口
└── README.md
```

## 后续可扩展方向

- 增加更多工具（如 browser、cron、自定义脚本）。
- 接入单一渠道（如 WebChat 或 Telegram）仅作输入/输出。
- 引入技能/插件机制（类似 OpenClaw skills）。
- 会话持久化（当前 Gateway 会话为内存）。

## License

MIT（与 OpenClaw 一致）。
