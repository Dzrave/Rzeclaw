# Rzeclaw 配置说明

以下为 `rzeclaw.json`（或 `.rzeclaw.json`、`~/.rzeclaw/config.json`）的完整示例与各字段说明。配置为可选；未提供时使用默认值。

---

## 完整示例

```json
{
  "model": "anthropic/claude-sonnet-4-20250514",
  "workspace": "C:\\Users\\me\\projects\\myapp",
  "port": 18789,
  "apiKeyEnv": "ANTHROPIC_API_KEY",
  "contextWindowRounds": 5,
  "reflectionToolCallInterval": 3,
  "summaryEveryRounds": 4,
  "memory": {
    "enabled": true,
    "storagePath": null,
    "workspaceId": "myapp",
    "coldAfterDays": 30
  },
  "evolution": {
    "bootstrapDocPath": "WORKSPACE_BEST_PRACTICES.md"
  },
  "planning": {
    "enabled": true,
    "maxSteps": 10,
    "complexThresholdChars": 80
  },
  "skills": {
    "enabled": true,
    "dir": ".rzeclaw/skills"
  },
  "mcp": {
    "enabled": true,
    "servers": [
      { "name": "my-mcp", "command": "npx", "args": ["-y", "some-mcp-server"] }
    ]
  },
  "heartbeat": {
    "intervalMinutes": 15,
    "checklistPath": "HEARTBEAT.md",
    "checkUseLLM": false,
    "requireConfirmation": false
  },
  "gateway": {
    "host": "0.0.0.0",
    "auth": {
      "enabled": true,
      "apiKeyEnv": "RZECLAW_GATEWAY_API_KEY"
    }
  },
  "roles": {
    "dev": "你是本工作区的开发助手。侧重代码编写、修改、调试与运行。",
    "knowledge": "你是知识库顾问。侧重依据已有记忆与文档作答。",
    "pm": "你是项目管理助手。侧重目标拆解、任务跟踪、进度汇总与画布更新。",
    "swarm_manager": "你是蜂群协调助手。负责汇总多工作区/多角色的任务与进度，给出跨区建议与优先级。",
    "general": ""
  },
  "swarm": {
    "teams": [
      { "id": "default", "name": "默认团队", "workspaces": [] }
    ],
    "defaultTeamId": "default"
  },
  "knowledge": {
    "ingestPaths": ["docs", "README.md"],
    "ingestOnStart": false,
    "retrieveLimit": 10
  },
  "diagnostic": {
    "intervalDays": 7,
    "outputPath": ".rzeclaw/diagnostics",
    "intervalDaysSchedule": 0
  },
  "ideOperation": {
    "uiAutomation": false,
    "keyMouse": false,
    "visualClick": false,
    "allowedApps": ["Code", "cmd", "Windows Terminal"],
    "timeoutMs": 60000,
    "confirmPolicy": {
      "tools": ["ui_act", "keymouse"],
      "requireConfirm": false
    }
  }
}
```

---

## 顶层字段

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `model` | string | `anthropic/claude-sonnet-4-20250514` | LLM 模型 ID，前缀 `anthropic/` 会在调用时去掉。 |
| `workspace` | string | `~/.rzeclaw/workspace` | 工作区根目录：文件操作、bash 的 cwd、记忆与快照的存储根。 |
| `port` | number | 18789 | Gateway WebSocket 服务端口。 |
| `apiKeyEnv` | string | `ANTHROPIC_API_KEY` | 环境变量名，用于读取 API Key。 |
| `contextWindowRounds` | number | 5 | 传入模型的最近对话轮数（每轮 = 1 user + 1 assistant）。 |
| `reflectionToolCallInterval` | number | 3 | 每 K 次工具调用后插入一次「执行后反思」提示。 |
| `summaryEveryRounds` | number | 0 | L0 每 M 轮生成会话内摘要（0=关闭）；下一轮上下文 = 摘要 + 最近 1～2 轮。 |

---

## memory

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `enabled` | boolean | false | 是否启用长期记忆（L1 写入、检索、L2 推进）。 |
| `storagePath` | string | (未用) | 预留；当前存储路径由 workspace + `.rzeclaw/memory` 派生。 |
| `workspaceId` | string | (由 workspace 派生) | 隔离键：记忆与审计按此区分；不同 workspaceId 互不可见。 |
| `coldAfterDays` | number | 0 | 创建时间早于 N 天的 L1 条目移入冷存储（0=不归档）；会话结束可自动触发归档。 |

---

## evolution

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `bootstrapDocPath` | string | `WORKSPACE_BEST_PRACTICES.md` | 相对 workspace 或绝对路径；会话中只读注入到 system。 |

---

## planning

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `enabled` | boolean | false | 是否启用轻量规划（复杂请求先出步骤再执行）。 |
| `maxSteps` | number | 10 | 步骤列表最多保留条数。 |
| `complexThresholdChars` | number | 80 | 消息长度超过此值即视为复杂请求；也可由关键词触发。 |

---

## skills（Phase 6）

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `enabled` | boolean | false | 是否从本地目录加载 Skill（仅白名单目录，安全边界见文档）。 |
| `dir` | string | `.rzeclaw/skills` | 相对 workspace 的 Skill 目录；仅此目录内 `*.json` 与脚本可被加载与执行。 |

---

## mcp（Phase 6）

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `enabled` | boolean | false | 是否连接 MCP Server 并合并其 Tools。 |
| `servers` | array | [] | 列表项：`{ name, command, args? }`；stdio 方式启动远端 MCP 进程，拉取 tools 并参与路由。 |

---

## heartbeat（Phase 6 / Phase 9）

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `intervalMinutes` | number | 0 | 定时间隔（分钟）触发一次 Heartbeat（Orient→Check→Act→Record）；0=关闭。 |
| `checklistPath` | string | `HEARTBEAT.md` | 相对 workspace 的待办/清单文件路径，供 Check 读取。 |
| `checkUseLLM` | boolean | false | 为 true 时，Check 阶段用 LLM 判断是否建议执行及建议执行哪一条；否则取清单首条（支持 [高][中][低] 优先级）。 |
| `requireConfirmation` | boolean | false | 为 true 时，Act 不自动执行，仅将待执行项写入 `workspace/.rzeclaw/heartbeat_pending.json`，由用户或终端确认后再执行。 |

任务与画布联动：Heartbeat 与 proactive 执行前会将 Canvas 目标与步骤同步到 `tasks.json`（来源 `canvas_goal` / `canvas_step_*`）；Agent 写回 Canvas 步骤状态后会同步更新对应任务状态。

---

## gateway（Phase 8）

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `host` | string | `127.0.0.1` | 监听地址；设为 `0.0.0.0` 时允许局域网他机连接，需在防火墙放行对应端口。 |
| `auth.enabled` | boolean | false | 是否启用连接认证：首条请求的 params 需带正确 apiKey，否则拒绝并关闭连接。 |
| `auth.apiKeyEnv` | string | `RZECLAW_GATEWAY_API_KEY` | 环境变量名，Gateway 用其值与客户端提供的 params.apiKey 比对。 |
| `discovery.enabled` | boolean | false | 是否在局域网通过 mDNS 广播 _rzeclaw._tcp，供终端「扫描局域网」发现。 |

终端连接时在首条请求的 params 中携带 `apiKey`（与上述环境变量值一致）；认证通过后该连接后续请求无需再带。终端设置页可点击「扫描局域网」发现已启用 discovery 的 Gateway。

---

## ideOperation（IDE/PC 操作能力）

L2 程序化 UI 自动化与 L3 键鼠默认关闭，需显式开启。详见 `docs/IDE_AND_PC_OPERATION_DESIGN.md` 与 `docs/IDE_OPERATION_IMPLEMENTATION_PLAN.md`。

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `uiAutomation` | boolean | false | 为 true 且 Windows 时注册 ui_describe / ui_act / ui_focus（UIA）。 |
| `keyMouse` | boolean | false | 为 true 且 Windows 时注册 keymouse（发送键序列到当前焦点窗口）。 |
| `visualClick` | boolean | false | 预留；视觉定位点击。 |
| `allowedApps` | string[] | (不限制) | L2/L3 仅允许操作的应用进程名；空或未配置则不限制。 |
| `timeoutMs` | number | 60000 | 工具执行默认超时（毫秒）。 |
| `confirmPolicy.tools` | string[] | [] | 需用户确认后再执行的工具名列表；命中时返回 REQUIRES_CONFIRMATION 不执行。 |
| `confirmPolicy.requireConfirm` | boolean | false | 是否全局要求敏感操作需确认。 |

---

## roles（Phase 10 蜂群角色）

会话类型对应的 system 片段，用于在 runAgentLoop 中按 sessionType 注入角色描述。未配置时使用内置默认文案。

| 字段 | 类型 | 说明 |
|------|------|------|
| `dev` | string | 开发助手角色描述。 |
| `knowledge` | string | 知识库顾问角色描述。 |
| `pm` | string | 项目管理助手角色描述。 |
| `swarm_manager` | string | 蜂群协调助手角色描述。 |
| `general` | string | 通用（可不写或留空，不额外注入）。 |

终端创建/恢复会话时可选择会话类型；chat 请求会携带 sessionType，Gateway 据此注入对应角色片段。

---

## swarm（Phase 10 多层级蜂群）

可选。用于蜂群管理会话的「协调团队」与多工作区分组。

| 字段 | 类型 | 说明 |
|------|------|------|
| `teams` | array | 团队列表，每项 `{ id: string, name: string, workspaces?: string[] }`。id 唯一；workspaces 为该团队关联的工作区路径。 |
| `defaultTeamId` | string | 终端默认选中的团队 id。 |

当 sessionType 为 `swarm_manager` 且 chat 请求带 `teamId` 时，runAgentLoop 会在 system 中注入「当前协调团队：name，工作区：…」。终端可通过 `swarm.getTeams` 获取 teams 与 defaultTeamId 以展示团队选择。

---

## knowledge（Phase 11 知识库）

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `ingestPaths` | string[] | [] | 相对 workspace 的文件或目录路径，供批量摄取（.md/.txt/.json/.rst）；Gateway 或 CLI 可触发 knowledge.ingest。 |
| `ingestOnStart` | boolean | false | 为 true 时，Gateway 启动后自动对 ingestPaths 执行一次摄取。 |
| `retrieveLimit` | number | 10 | 咨询会话（sessionType=knowledge）时默认检索记忆条数。 |

摄取流程：调用 `knowledge.ingest(workspace?, paths?)`（不传 paths 则用 config.knowledge.ingestPaths）将指定文件分块写入 L1（content_type=document，provenance.source_path）；之后 retrieve 可查到。咨询模式即选择「知识库」会话类型，系统注入角色约束并提高检索条数。

---

## diagnostic（Phase 12 自我诊断）

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `intervalDays` | number | 7 | 报告统计时间范围（天）。 |
| `outputPath` | string | `.rzeclaw/diagnostics` | 报告输出目录，相对 workspace。 |
| `intervalDaysSchedule` | number | 0 | 定时报告间隔（天）；>0 时 Gateway 启动后按间隔生成报告并写入改进建议文件。0=不定时。 |

报告内容：会话数、工具调用与失败率、L1/audit 记忆统计、Heartbeat 执行与错误；产出 `report_<date>.json` 与 `self_improvement_suggestions.md`。触发方式：Gateway `diagnostic.report(workspace?, days?)` 或 CLI `rzeclaw diagnostic-report -w <workspace> -d <days>`。建议仅输出不自动执行，采纳由用户完成。

---

## 配置文件查找顺序

1. 当前目录 `rzeclaw.json`  
2. 当前目录 `.rzeclaw.json`  
3. 用户目录 `~/.rzeclaw/config.json`（Windows 为 `%USERPROFILE%\.rzeclaw\config.json`）  

CLI 可通过参数指定配置文件路径（若支持）；Gateway 启动时使用上述顺序加载。
