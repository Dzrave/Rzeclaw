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
  "flows": {
    "enabled": true,
    "libraryPath": ".rzeclaw/flows",
    "routes": [
      { "hint": "运行命令", "flowId": "run_cmd", "slotRules": [{ "name": "command", "pattern": "运行(.+)" }] },
      { "hint": "部署", "flowId": "deploy_prod" },
      { "hint": "配置/安装", "flowId": "simple_build" }
    ],
    "failureReplacement": {
      "enabled": false,
      "failureRateThreshold": 0.5,
      "minSamples": 5,
      "consecutiveFailuresThreshold": 3,
      "markOnly": false,
      "async": true
    }
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
| `insertTree` | object | - | **WO-BT-024** 进化插入树：从成功执行提炼为脚本+BT 节点，沙盒验证后写入 evolved_skills 并插入 Selector 左侧。见下表。 |

**insertTree**（可选）：

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `enabled` | boolean | false | 是否启用进化插入树管线。 |
| `autoRun` | boolean | false | 满足条件时是否自动异步执行管线（否则仅建议，由 evolution.apply 显式触发）。 |
| `requireUserConfirmation` | boolean | false | 是否要求用户确认后才执行。 |
| `allowHighRiskOp` | boolean | false | 本轮是否允许含「高风险」op 仍触发。 |
| `targetFlowId` | string | - | 插入新节点的 BT flowId（必填）。 |
| `targetSelectorNodeId` | string | - | 目标 Selector 的 nodeId；空则用 root。 |
| `evolvedSkillsDir` | string | `.rzeclaw/evolved_skills` | 进化产物存放目录，相对 workspace。 |
| `sandboxTimeoutMs` | number | 30000 | 沙盒测试脚本超时（毫秒）。 |
| `maxRetries` | number | 0 | LLM 或沙盒失败时最大重试次数。 |

**调用方式**：
- **evolution.apply**：params 需带 `context: { sessionSummary, toolOps, targetFlowSlice? }`，其中 `toolOps` 为必填且非空（由客户端组装）。
- **evolution.confirm**：params 需带 `sessionId`（可选 `workspace`）；服务端从 op-log 与 session 自动组装 context 并执行管线，无需客户端传 context。
- **evolutionSuggestion**：当 `requireUserConfirmation` 为 true 且本轮满足可进化条件时，chat 返回中会带 `evolutionSuggestion: true`，客户端可据此提示用户并调用 `evolution.confirm`。
- **autoRun**：当 `autoRun` 为 true 且未开启 `requireUserConfirmation` 时，在 flow 或 Agent 执行成功后会自动异步执行进化管线，不阻塞回复。

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

## flows（Phase 13 行为树/状态机）

启用后，Gateway 在 chat 入口先做流程路由：若用户消息匹配某条 route（基于任务 hint + routes 表），则执行对应 flow（BT 或 FSM），**不调用 LLM**，实现零 Token 流程执行。未配置或 `enabled` 为 false 时所有请求仍走 Agent。

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `enabled` | boolean | false | 是否启用流程路由；未配置时默认关闭。 |
| `libraryPath` | string | - | 相对 workspace 的目录，存放 flow 的 JSON 文件（如 `.rzeclaw/flows`）。 |
| `routes` | array | [] | 意图到 flowId 的映射；每项 `{ hint: string, flowId: string, slotRules?: [{ name, pattern }] }`。hint 与 `extractTaskHint(message)` 匹配时选用该 route；slotRules 为正则从 message 抽取 params。 |
| `failureReplacement` | object | - | **WO-BT-018** 失败分支替换：失败率或连续失败超阈值时自动触发拓扑迭代或仅标记。见下表。 |

**failureReplacement**（可选）：

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `enabled` | boolean | false | 是否启用失败率/连续失败触发。 |
| `failureRateThreshold` | number | 0.5 | 失败率阈值 0～1；总样本数 ≥ minSamples 且失败率 ≥ 此值则触发。 |
| `minSamples` | number | 5 | 至少多少条执行记录后才计算失败率。 |
| `consecutiveFailuresThreshold` | number | 3 | 最近连续失败次数达到此值则触发（与失败率满足其一即可）。 |
| `markOnly` | boolean | false | 为 true 时仅写 meta.flaggedForReplacement，不调用 runTopologyIteration。 |
| `async` | boolean | true | 为 true 时异步执行 runTopologyIteration，不阻塞 chat 响应。 |

示例：将 `docs/samples/flows/simple_build.json` 复制到 `<workspace>/.rzeclaw/flows/`，并配置 `flows.enabled: true`、`flows.libraryPath: ".rzeclaw/flows"`、`routes: [{ "hint": "配置/安装", "flowId": "simple_build" }]`，则用户说「配置一下」或「运行命令」等匹配到对应 hint 时会执行该 flow 而非走 Agent。流程执行中的工具调用经同一套校验、危险命令与权限策略，并写入 op-log（source=flow、flowId）。

---

## localModel（WO-LM 本地模型意图分类）

**默认**：不配置任何 `localModel` 时，仅使用规则路由（与动机 RAG，若启用）；规则未命中时直接走主 LLM（若已配置）或返回提示。

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `enabled` | boolean | false | 总开关；未配置或 false 时不调用本地模型。 |
| `provider` | string | - | `ollama` \| `openai-compatible`，对接本地 HTTP API。 |
| `endpoint` | string | - | 服务地址，如 `http://127.0.0.1:11434`。 |
| `model` | string | - | 模型名，如 `qwen2.5:3b`、`gpt-3.5-turbo`。 |
| `timeoutMs` | number | 15000 | 请求超时（毫秒）。 |
| `modes.intentClassifier.enabled` | boolean | false | 规则未命中时是否调用本地模型得到 router_v1（state、flowId、confidence）。 |
| `modes.intentClassifier.confidenceThreshold` | number | 0.7 | 采纳 ROUTE_TO_LOCAL_FLOW 的最低置信度 0～1。 |

**调用顺序**（在已启用 flows 时）：动机 RAG（若启用）→ 规则 matchFlow → **意图分类**（若 `localModel.modes.intentClassifier.enabled`）→ 未匹配时走主 LLM 或返回「未配置主 LLM」提示。意图分类输出 router_v1（state、flowId、params、confidence）；仅当 `state === "ROUTE_TO_LOCAL_FLOW"` 且 `confidence >= confidenceThreshold` 且 `flowId` 在流程库中存在时才按 flow 执行，否则按 state 与是否配置主 LLM 决定走 runAgentLoop 或提示。

---

## 路由与主 LLM 优先级与边界

| 场景 | 行为 |
|------|------|
| **无任何模型** | 未配置主 LLM（`config.llm` 或 API Key 不可用）且未配置 localModel：规则/动机未命中时返回明确提示「未匹配到任何流程，且当前未配置可用的大模型…」。 |
| **仅主 LLM（云端或 Ollama）** | 无 localModel 或 intentClassifier 未启用：动机 RAG → 规则 → 未匹配则 runAgentLoop；与现有行为一致。 |
| **仅本地意图分类** | 启用 localModel.intentClassifier，未配置主 LLM：规则未命中时调用本地模型；若返回 ROUTE_TO_LOCAL_FLOW 且置信度达标则执行 flow，否则返回「需云端大模型处理，请配置 config.llm」。 |
| **主 LLM + 本地意图分类** | 两者均配置：动机 RAG → 规则 → 意图分类；若意图分类返回 ROUTE_TO_LOCAL_FLOW 且达标则执行 flow，否则（ESCALATE_TO_CLOUD / UNKNOWN / 低置信度）走 runAgentLoop。 |

主 LLM 可用性由 `isLlmReady(config)` 判定（Ollama 无需 Key；云端需已配置对应 API Key）。

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
