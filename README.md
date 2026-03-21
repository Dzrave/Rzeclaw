# Rzeclaw

[![Node.js](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

基于 [OpenClaw](https://github.com/openclaw/openclaw) 思路实现的**本地 AI 助手**：WebSocket **Gateway** + 多轮 **Agent**（LLM + 工具），可选长期记忆、流程库（行为树/状态机）、RAG、技能与 MCP、Electron 终端与办公室前端等。适合作为「自己掌控的自动化与对话中枢」二次扩展。

---

## 特性概览

| 能力 | 说明 |
|------|------|
| **Gateway** | JSON-RPC over WebSocket；`chat` 流式输出；会话、快照、健康检查、画布、复盘等 RPC |
| **Agent** | CLI `agent` 或经 Gateway；多轮工具调用、记忆注入、规划、反思间隔、隐私模式 |
| **工具** | bash / read / write / edit / process；可选 Skill、MCP、Windows UI 自动化、键鼠、`replay_ops` |
| **流程** | 可选行为树/状态机流程库、路由、失败替换、进化插入树 |
| **记忆** | L0/L1/L2、冷归档、审计、滚动账本与折叠（Phase 17） |
| **客户端** | `terminal/`（Electron）、`frontend-office/`（Phaser 办公室看板 + 对话） |

---

## 文档

| 文档 | 用途 |
|------|------|
| [**已实现系统总设计**](docs/OVERALL_IMPLEMENTED_DESIGN.md) | **As-Built**：架构、双路径 Chat、Gateway 方法表、模块索引（贡献/深入阅读首选） |
| [配置说明](docs/CONFIG_REFERENCE.md) | `rzeclaw.json` 全字段与示例 |
| [使用与验证](docs/USAGE_AND_VERIFICATION.md) | 能力开关与验收步骤 |
| [实现总结（Phase 0～6）](docs/IMPLEMENTATION_SUMMARY.md) | 工单与源码文件对应 |
| [自检与卸载](docs/SELF_CHECK_AND_UNINSTALL.md) | `self-check` / `repair` / `uninstall` |
| [GitHub 上传清单](docs/GITHUB_UPLOAD_CHECKLIST.md) | 维护者发布前检查 |

更多设计稿与阶段说明见 [`docs/`](docs/) 目录。

---

## 与 OpenClaw 的对应关系（简表）

| OpenClaw | Rzeclaw |
|----------|---------|
| Gateway（WS 控制面） | 简化实现：会话、chat、工具、画布、复盘等 RPC |
| Agent + 工具循环 | 内置 `runAgentLoop`，对接 Anthropic / DeepSeek / MiniMax / Ollama |
| 核心电脑工具 | bash、read、write、edit、process 等 |
| Skills / MCP | 可选本地 Skill 目录 + MCP 子进程工具合并 |
| Canvas / 主动任务 | 可选画布与 Heartbeat、主动提议 |
| 多通道（WhatsApp、Telegram…） | 不包含；可自建客户端连 Gateway |
| Browser / Tailscale / 官方 Control UI | 不包含 |

---

## 环境要求

- **Node.js ≥ 18**
- 云端模型需对应 API Key（如 [Anthropic](https://console.anthropic.com/)）；使用 **Ollama** 时可不配置 Key

---

## 快速开始

**推荐**：克隆后运行一键脚本（安装依赖 → 构建 → 生成示例配置 → **配置向导**）。

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

### 手动安装

```bash
git clone https://github.com/Dzrave/Rzeclaw.git
cd Rzeclaw
npm run setup
node rzeclaw.mjs setup   # 配置向导：模型、终端策略、Gateway 等
```

也可复制 `cp .env.example .env`、`cp rzeclaw.example.json rzeclaw.json` 后手工编辑。

### 运行

**进程内对话（无需 Gateway）：**

```bash
node rzeclaw.mjs agent "列出当前目录下的前 10 个文件"
```

**启动 Gateway（默认 `ws://127.0.0.1:18789`）：**

```bash
node rzeclaw.mjs gateway
```

使用任意 WebSocket 客户端发送 JSON-RPC，例如：

```json
{ "id": "1", "method": "chat", "params": { "message": "列出当前目录文件" } }
```

**桌面终端**：进入 `terminal/` 安装依赖后 `npm start`，在设置中填写 Gateway 地址与可选 API Key。  
**办公室前端**：见 [`frontend-office/README.md`](frontend-office/README.md)。

---

## 常用 CLI

| 命令 | 说明 |
|------|------|
| `node rzeclaw.mjs setup` | 配置向导 |
| `node rzeclaw.mjs gateway` | 启动 Gateway |
| `node rzeclaw.mjs agent "…"` | 本地跑一轮对话 |
| `node rzeclaw.mjs self-check` | 环境自检（可加 `--repair`、`--json`） |
| `node rzeclaw.mjs repair` | 安装依赖与构建 |
| `node rzeclaw.mjs health` | 工作区与 LLM 就绪检查 |
| `node rzeclaw.mjs uninstall` | 卸载构建产物等（`--all` 慎用） |

完整子命令见 `src/cli.ts` 与 [总设计文档 · CLI 一节](docs/OVERALL_IMPLEMENTED_DESIGN.md#6-cli-命令srcts)。

---

## 最小配置示例

`rzeclaw.json`（或 `~/.rzeclaw/config.json`）：

```json
{
  "model": "anthropic/claude-sonnet-4-20250514",
  "workspace": "E:\\Rzeclaw\\workspace",
  "port": 18789,
  "apiKeyEnv": "ANTHROPIC_API_KEY"
}
```

- **workspace**：bash 的 cwd 与文件工具根目录  
- **port**：Gateway 端口  
- 完整选项见 [**CONFIG_REFERENCE.md**](docs/CONFIG_REFERENCE.md)

---

## 核心工具（摘要）

| 工具 | 说明 |
|------|------|
| `bash` | 在 workspace 下执行命令；支持 `dryRun`、`async` + `operation_status` |
| `read` / `write` / `edit` | 读写与替换；可 `dryRun`；`undo_last` 配合撤销 |
| `process` | 列出/结束进程（受安全配置约束） |
| `env_summary` | workspace、cwd、platform |
| `replay_ops` | 从 ops.log 重放最近操作（合并工具列表时注入） |
| **可选** | Windows：`ui_describe` / `ui_act` / `ui_focus`、`keymouse`（见 `ideOperation`） |

路径均相对于 **workspace**，并禁止越界访问。详见 [CONFIG_REFERENCE.md](docs/CONFIG_REFERENCE.md) 与 [USAGE_AND_VERIFICATION.md](docs/USAGE_AND_VERIFICATION.md)。

---

## 仓库结构（精简）

```
Rzeclaw/
├── src/                 # TypeScript 源码（agent、gateway、memory、flows、rag…）
├── terminal/            # Electron 客户端
├── frontend-office/     # 办公室看板前端
├── docs/                # 设计与配置文档
├── scripts/             # setup / 验收脚本
├── rzeclaw.mjs          # CLI 入口
├── rzeclaw.example.json
└── package.json
```

模块级说明见 [**OVERALL_IMPLEMENTED_DESIGN.md**](docs/OVERALL_IMPLEMENTED_DESIGN.md)。

---

## 构建与测试

```bash
npm run build    # tsc → dist/
npm test         # 构建后运行 test/*.test.js
```

---

## 后续可扩展方向

- 接入更多渠道（Web、IM）仅作 Gateway 的输入输出适配  
- 增加浏览器自动化等工具（需注意安全与沙箱）  
- 按 `docs/` 中 Phase 工单继续演进能力与联调  

---

## License

MIT（与 OpenClaw 一致）。
