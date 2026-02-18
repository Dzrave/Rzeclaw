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

## 一条龙安装与配置、启动

**流程**：安装依赖与构建 → **配置向导**（API Key、模型选择、命令终端策略、是否启动 Gateway）→ 启动使用。

**环境**：Node ≥18，需 [Anthropic API Key](https://console.anthropic.com/)（若选 Ollama 本地模型则无需）。

### 方式 A：一键脚本（推荐）

脚本会依次：检查 Node 版本 → 安装依赖 → 构建 → 创建 `.env` / `rzeclaw.json`（若不存在）→ **启动配置向导**。

**Windows（PowerShell）：**

```powershell
git clone https://github.com/Dzrave/Rzeclaw.git
cd Rzeclaw
.\scripts\setup.ps1
```

**macOS / Linux：**

```bash
git clone https://github.com/Dzrave/Rzeclaw.git
cd Rzeclaw
chmod +x scripts/setup.sh
./scripts/setup.sh
```

向导中会提示：填写 API Key、选择模型（Anthropic / DeepSeek / Ollama）、命令终端（bash）是否需确认、是否启动 Gateway；按提示完成即可进入使用。

### 方式 B：npm 后手动配置

```bash
git clone https://github.com/Dzrave/Rzeclaw.git
cd Rzeclaw
npm run setup
node rzeclaw.mjs setup   # 进入配置向导（模型、终端、Gateway）
```

未运行向导时，可手动复制 `cp .env.example .env`、`cp rzeclaw.example.json rzeclaw.json` 并编辑，再启动。

### 配置 API Key 与向导

- **推荐**：运行 `node rzeclaw.mjs setup` 进入配置向导，按提示设置 API Key、模型、命令终端策略等。
- 或手动：在项目根创建 `.env`，内容为 `ANTHROPIC_API_KEY=sk-ant-...`；或在 `rzeclaw.json` 中设置 `apiKeyEnv`。
- 环境变量：`set ANTHROPIC_API_KEY=sk-ant-...`（Windows）、`export ANTHROPIC_API_KEY=sk-ant-...`（Unix）。

### 启动与使用

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

## 自检、修复与卸载

在项目根目录下执行（以下 `<cmd>` 可为 `node rzeclaw.mjs` 或全局安装后的 `rzeclaw`）：

- **配置向导**：安装后或需改配置时运行 `node rzeclaw.mjs setup`，交互式确认模型、命令终端、Gateway 等。
- **自检**：检查 Node 版本、依赖、构建、配置与 LLM 就绪情况。  
  `node rzeclaw.mjs self-check`  
  加 `--repair` 会在发现问题时自动执行 `npm install` 与 `npm run build`；加 `--reset-config` / `--reset-env` 可在修复时从示例恢复配置或 .env。  
  输出 JSON：`node rzeclaw.mjs self-check --json`

- **修复**：仅执行修复步骤（安装依赖、构建、可选恢复配置）。  
  `node rzeclaw.mjs repair`  
  可选：`--reset-config`、`--reset-env`、`--no-install`、`--no-build`

- **卸载**：移除 `node_modules` 与 `dist`；**默认保留**工作区、`rzeclaw.json`、`.env`、工作区内的 `.rzeclaw`（记忆/快照等）。  
  `node rzeclaw.mjs uninstall`  
  **全部卸载**（完全移除软件及配置与本地数据）：`node rzeclaw.mjs uninstall --all`。  
  若需按项删除，可加：`--remove-config`、`--remove-env`、`--remove-rzeclaw-data`、`--remove-workspace`（慎用）。  
  仅查看将执行的操作：`node rzeclaw.mjs uninstall --json` 或 `node rzeclaw.mjs uninstall --all --json`

详见 **`docs/SELF_CHECK_AND_UNINSTALL.md`**。

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

## 核心工具与能力

| 工具 | 说明 |
|------|------|
| `bash` | 在 workspace 下执行 shell 命令（Windows 下为 cmd）；支持 `dryRun`、`async`（后台 + operation_status 查询）。 |
| `read` / `write` / `edit` | 读写与替换；write/edit 支持 `dryRun`；edit/write 成功可返回 undoHint，配合 `undo_last` 撤销。 |
| `process` | `action: list` 列出进程，`action: kill` + `pid` 结束进程。 |
| `env_summary` | 返回 workspace、cwd、platform，供规划用。 |
| `undo_last` | 从操作日志执行最近一次可撤销操作的逆操作。 |
| `operation_status` | 查询 bash `async: true` 启动的后台任务状态。 |
| `replay_ops` | 从 ops.log 重放最近 N 条操作（由 Gateway 合并工具列表时注入）。 |
| **L2（需配置）** | `ui_describe` / `ui_act` / `ui_focus`（Windows UIA）；仅当 `ideOperation.uiAutomation: true` 时注册。 |
| **L3（需配置）** | `keymouse` 发送键序列到当前焦点窗口；仅当 `ideOperation.keyMouse: true` 时注册。 |

所有文件类工具路径均相对于 **workspace**，且禁止访问 workspace 外路径。配置见 `docs/CONFIG_REFERENCE.md`；**可用性与验证步骤**见 **`docs/USAGE_AND_VERIFICATION.md`**。

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

## 上传至 GitHub

维护者上传前可参考 **`docs/GITHUB_UPLOAD_CHECKLIST.md`**，确认 .gitignore、LICENSE、示例配置与一条龙脚本已就绪。

## License

MIT（与 OpenClaw 一致）。
