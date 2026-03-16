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
    "coldAfterDays": 30,
    "rollingLedger": {
      "enabled": false,
      "windowDays": 5,
      "timezone": null,
      "foldCron": null,
      "includePendingInReport": false
    }
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
  },
  "eventBus": {
    "enabled": false,
    "responseTimeoutMs": 300000
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
| `rollingLedger` | object | 见下 | **Phase 17** 5 天滑动情景记忆（记忆折叠）：账本注入 system prompt、今日缓冲、折叠任务。 |

**rollingLedger**（可选）：

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `enabled` | boolean | false | 是否启用滚动账本：请求时注入 5 天摘要、flushToL1 时写入今日缓冲。 |
| `windowDays` | number | 5 | 账本保留天数（1～30）。 |
| `timezone` | string | 本地 | 时区（如 `Asia/Shanghai`），用于「今日」边界。 |
| `foldCron` | string | (无，**不默认开启**) | 可选。配置后 Gateway 将按该 cron（仅支持「分 时」两段，如 `0 0` 表示 00:00）每日自动执行折叠；未配置时**仅**通过 RPC `memory.fold` 触发。 |
| `includePendingInReport` | boolean | false | **WO-1741** 是否将折叠产出的「昨日未完成任务」写入当日早报（`retrospective.report`）；用户显式设为 true 后，早报中可见 `rollingLedgerPendingTasks`。 |

- 存储：账本 `workspace/.rzeclaw/memory/rolling_ledger.json`；今日缓冲 `workspace/.rzeclaw/memory/today_buffer_YYYY-MM-DD.jsonl`。
- 隐私：`sessionFlags.privacy === true` 时不注入账本、不写今日缓冲。
- **foldCron** 与 **includePendingInReport** 均为可选且默认关闭，需用户按需开启。

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

## exploration（Phase 16 探索层）

**设计**：见 `docs/EXPLORATION_PLANNER_DESIGN.md`。在动机层之后、执行层之前插入可选探索层：未命中 flow 且满足触发条件时，先做先验扫描（FSM/黑板、可用技能），再由 Planner 生成多预案、Critic 择优，编译为执行指令后下发；可选探索经验复用以节约 Token。与 `planning` 的 `complexThresholdChars` 可复用（`exploration.trigger.complexThresholdChars` 未配置时沿用 `planning.complexThresholdChars`）。

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `enabled` | boolean | false | 是否启用探索层；关闭时请求直通执行层。 |
| `timeoutMs` | number | 90000 | 探索层总超时（毫秒）；超时后降级为不探索，直接走 runAgentLoop。 |
| `trigger.openIntents` | string[] | - | 开放性意图关键词，消息包含任一则可能进入探索层。 |
| `trigger.complexThresholdChars` | number | 同 planning | 消息长度 ≥ 此值可触发探索；不配置时沿用 `planning.complexThresholdChars` 或 80。 |
| `trigger.uncertaintyThreshold` | number | - | 可选：不确定性得分 ≥ 此值触发探索（0～1）。 |
| `trigger.failureRateThreshold` | number | - | 某类任务近期失败率 ≥ 此值强制进入探索层（0～1）。 |
| `planner.maxVariants` | number | 5 | 预案数量 3～5。 |
| `planner.readOnlyRAGOnly` | boolean | true | Planner 仅只读 RAG，不调用写文件类工具。 |
| `critic.weights` | object | - | 评分权重：success、cost、risk（Score = w1*E(success) - w2*Cost - w3*Risk）。 |
| `snapshot.maxRelevantSkills` | number | 10 | 先验扫描时取前 K 个相关技能。 |
| `experience.enabled` | boolean | false | 是否启用探索经验存储与复用。 |
| `experience.collection` | string | `exploration_experience` | 内源 RAG 集合名。 |
| `experience.reuseThreshold` | number | 建议 0.82～0.88 | 检索命中得分 ≥ 此值才复用历史预案。 |
| `experience.requireSnapshotMatch` | boolean | false | 是否要求 snapshot_digest 兼容才复用。 |
| `experience.storeOutcome` | boolean | false | 是否在执行完成后回写成功/失败到条目。 |
| `experience.maxEntries` | number | - | 探索经验检索时最多使用的最近条数；不配置时默认 50。 |

**可重载**：exploration 整块参与热重载（见 `RELOADABLE_CONFIG_KEYS`）。

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

## eventBus（Phase 14A）

**设计**：见 `docs/EVENT_BUS_AS_HUB_DESIGN.md`。启用后 chat 请求经进程内逻辑总线发布/订阅：Gateway 仅发布 `chat.request`、订阅 `chat.response` 与 `chat.stream`，执行层（同进程内）订阅 request、执行 Router/Executor/runAgentLoop 后发布 response（及可选 stream）。会话与快照仍由 Gateway 维护；response 中回写 messages/sessionGoal/sessionSummary/blackboard 供 Gateway 合并并写快照。

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `enabled` | boolean | false | 为 true 时 chat 经 Event Bus 流转；Gateway 不直接调用执行逻辑。 |
| `responseTimeoutMs` | number | 300000 | 等待 chat.response 超时（毫秒）；超时后向用户返回「请求超时」并清理映射。 |

---

## agents（Phase 14B 多 Agent 实体）

**设计**：见 `docs/MULTI_AGENT_ENTITY_DESIGN.md`。引入 Agent 实体后，Router 可产出 `agentId`（及在其 `boundFlowIds` 内匹配的 `flowId`），调度层按 agentId 获取或创建实例并派发请求；实例使用蓝图的 systemPrompt、boundFlowIds、toolsFilter 与独立黑板。**术语**：「Agent 路径」指原有「不匹配 flow 则 runAgentLoop」的单一路径；「Agent 实体/实例」指本阶段的容器（蓝图 + 实例状态 + 局部黑板）。

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `blueprints` | array | [] | Agent 蓝图列表；每项见下表。 |
| `defaultAgentId` | string | - | Router 未产出 agentId 时使用的默认蓝图 id；不配置则走全局 runAgentLoop。 |
| `routes` | array | [] | 意图→Agent 映射；每项 `{ hint: string, agentId: string }`。hint 与 extractTaskHint(message) 匹配时选用该 Agent，再在其 boundFlowIds 内匹配 flow。 |

**blueprints[]** 每项：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 唯一标识，如 code_reviewer、general。 |
| `name` | string | 显示名，用于日志与 UI。 |
| `systemPrompt` | string | 角色 system 片段，覆盖或补充 config.roles 按 sessionType 的片段。 |
| `boundFlowIds` | string[] | 该 Agent 可用的 flowId 白名单；空则使用全局库且可匹配任意 route。 |
| `localMemory` | object | 可选；`{ enabled, storagePath?, retrieveLimit?, includeGlobalRead? }` 局部记忆。`enabled` 为 true 时该 Agent 的 L1 仅写入局部 store（`.rzeclaw/memory/agent_<id>.jsonl`），检索仅查该 store；`includeGlobalRead` 为 true 时检索合并「局部 + 全局只读」。局部记忆不做 L2 提升与冷归档。 |
| `llm` | object | 可选；该 Agent 使用的 LLM，覆盖全局。 |
| `toolsFilter` | string[] | 可选；仅使用名称在此列表中的工具；不配置则用全局合并结果。 |

**局部记忆与全局记忆（WO-1439）**：

| 维度 | 全局记忆 | Agent 局部记忆（localMemory.enabled） |
|------|----------|--------------------------------------|
| 存储 | `config.memory.workspaceId` → `.rzeclaw/memory/<workspaceId>.jsonl` | `agent_<blueprintId>` → `.rzeclaw/memory/agent_<blueprintId>.jsonl` |
| 写入 | 每轮会话 flushToL1 写入全局 store | 仅写入该 Agent 的 store，不写入全局 |
| 检索 | runAgentLoop 从全局 store 检索 | 仅从该 Agent store 检索；若 `includeGlobalRead: true` 则合并「局部 + 全局」结果（局部优先、按 id 去重） |
| L2 / 冷归档 | 有 promoteL1ToL2、archiveCold | 不做 L2 提升与冷归档，仅 L1 |

未配置 `agents.blueprints[].localMemory` 或 `enabled: false` 时，该 Agent 仍使用全局记忆（与未配置多 Agent 时一致）。

---

## collaboration（Phase 14C 多 Agent 协作）

**设计**：见 `docs/EVENT_BUS_COLLABORATION_DESIGN.md`。在 Event Bus 与多 Agent 实体就绪后，支持三种协作模式（仅当 `eventBus.enabled` 且 `agents` 配置时生效）：

| 模式 | Topic | 说明 |
|------|--------|------|
| **流水线** | `pipeline.stage_done` | Agent 完成阶段后发布；下游认领 `nextAgentId` 继续执行；最后一环发布 `chat.response`。Agent 可通过黑板槽 `__nextAgentId` 指定下一环。 |
| **委派** | `delegate.request` / `delegate.result` | 主控通过工具 `delegate_to_agent` 派发子任务给打工人；主控 FSM 置 waiting，收到 result 后合并黑板并继续。委派超时使用 `eventBus.responseTimeoutMs`（默认 5 分钟）或内置 2 分钟。 |
| **蜂群** | `swarm.broadcast` / `swarm.contribution` | 通过工具 `broadcast_to_swarm` 广播任务；各 Agent 认领后执行并发布 contribution；发起方收集后聚合返回。 |

与单次 chat 的区分：单次 `chat.request → chat.response` 表示「一条用户消息由一个执行单元处理」；协作表示一次请求内部可能经 pipeline/delegate/swarm 多事件、多 Agent 参与，最终仍对用户暴露为一次请求一次（或流式）回复。

---

## security（安全与隐私增强 WO-1501～1515）

**设计**：见 `docs/SECURITY_PRIVACY_ENHANCEMENT_DESIGN.md`。在现有危险命令、process 保护、confirmPolicy 基础上，支持事后检查、权限域与会话/定时授权、隐私沙盒与端到端标记。

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `postActionReview.enableRiskClassification` | boolean | - | 为 true 时对每条 ops 写入 risk_level（classifyOpRisk 已实现，默认生效）。 |
| `postActionReview.highRiskSuggestReviewOnSessionEnd` | boolean | - | 为 true 时，`session.saveSnapshot` 若检测到本会话近期存在高风险 ops 则返回 `highRiskOpsSuggestedReview: true`，供前端提示用户复查。 |
| `permissionScopes` | object | - | 各 scope 默认策略：`allow` / `confirm` / `deny`。scope 与工具映射见 TOOL_SCOPE_MAP（如 write/edit→file_write，bash→bash，process kill→process_kill）。 |
| `scheduledGrants` | array | - | 定时授权：`{ scope: string, window: "HH:mm-HH:mm" }`，如 `"09:00-18:00"` 表示该时段内该 scope 视为已授权、不弹确认。 |
| `privacySessionToolPolicy` | string | allow_all | 隐私会话下工具策略：`allow_all` 不限制，`read_only` 仅允许 read/env_summary，`none` 禁止工具。 |
| `opsLogPrivacySessionPolicy` | string | - | 隐私会话下 ops.log：`omit` 不写入，`redact` 脱敏后写入（未配置时仍写入且已有脱敏）。 |
| `privacyIsolationRetentionDays` | number | - | **WO-1511** 隐私隔离存储保留天数：配置为 0 表示会话结束即删除隔离文件；>0 表示保留 N 天后由清理任务删除。未配置时隐私会话不写 L1；配置后隐私会话 L1 写入 `.rzeclaw/privacy_isolated/<sessionId>.jsonl`，不参与全局检索与导出，不写主 audit。 |

**隐私隔离存储（WO-1511）**：当 `privacyIsolationRetentionDays` 为数字时，隐私会话的 L1 摘要/事实写入隔离路径 `.rzeclaw/privacy_isolated/<sessionId>.jsonl`，不参与全局 retrieve、不写主 audit、不提升 L2。会话结束（如 `session.saveSnapshot` 且为隐私会话）且保留期为 0 时删除该会话隔离文件；保留期 >0 时在每次冷归档或记忆写入后顺带清理超期文件。

**与 confirmPolicy 的兼容（WO-1509）**：有效策略顺序为 ① `security.permissionScopes[scope]` ② 内置默认（如 file_write→confirm）③ `ideOperation.confirmPolicy.tools` 中列出的工具强制为 confirm。即先按 scope，再按 confirmPolicy.tools 覆盖。

**会话级授权（WO-1507）**：`sessionGrants` 为运行时内存（不落盘）。客户端在用户选择「本次会话允许」后调用 `{ method: "scope.grantSession", params: { scope: "file_write", sessionId?: "main" } }`，服务端将该 scope 加入该会话的 grantedScopes，后续同 scope 工具调用不再弹确认。chat 请求会携带 `sessionGrantedScopes` 供执行层使用。

**端到端隐私（WO-1514）**：`sessionFlags.privacy` 在 Gateway、执行层、记忆管道、快照、ops 全链路传递；隐私会话不写 L1、不持久化快照（或 omit/redact ops）。导出（audit-export、metrics-export 等）仅包含已存储数据，隐私会话内容已按策略不写或脱敏，故导出不含隐私原始内容（WO-1513）。

---

## hotReload（配置热重载 WO-1520～1527）

**设计**：见 `docs/CONFIG_HOT_RELOAD_DESIGN.md`。在不重启进程的前提下，将可重载配置项从配置文件重新读入并浅替换到当前 config；`port`、`workspace`、`gateway.host` 不重载，需重启生效。

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `intervalSeconds` | number | 0 | 定时检查配置文件 mtime 的间隔（秒）；≥10 时启用轮询，变更则自动重载；0 表示不轮询。 |
| `allowExplicitReload` | boolean | true | 为 false 时禁止通过 Gateway 方法 `config.reload` 触发重载。 |

**可重载项**：model、apiKeyEnv、llm、memory、contextWindowRounds、reflectionToolCallInterval、summaryEveryRounds、evolution、planning、exploration、skills、mcp、heartbeat、gateway（仅 auth/discovery，host 保留）、roles、swarm、knowledge、diagnostic、flows、vectorEmbedding、localModel、retrospective、ideOperation、security、eventBus、agents、hotReload。

**不可重载**：port、workspace、gateway.host。

**用法**：已认证客户端发送 `{ method: "config.reload" }`，返回 `{ ok: true }` 或 `{ ok: false, message: "..." }`。成功时写入 `workspace/.rzeclaw/hot_reload_audit.log`。

---

## taskExecution / taskResults（任务解耦 WO-1540～1550）

**设计**：见 `docs/TASK_GATEWAY_DECOUPLING_DESIGN.md`。执行层在收到 chat.request 后创建任务记录（pending → running）；完成或失败时写入结果存储并发布 chat.response；断连后客户端可通过任务查询拉取结果。

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `taskExecution.mode` | string | in_process | 保留；in_process 与 Gateway 同进程，worker 预留独立 Worker。 |
| `taskResults.retentionMinutes` | number | 1440 | 任务结果保留时长（分钟），过期后可被定时清理删除。 |

**查询**：已认证客户端可发送 `{ method: "task.getResult", params: { correlationId: "..." } }`，返回 `{ status, content?, error?, citedMemoryIds?, completedAt? }` 或 `status: "not_found"` / `"expired"`。`{ method: "task.listBySession", params: { sessionId?, limit? } }` 返回该会话最近 N 条任务的 correlationId、status、completedAt。结果同时写入内存与 `workspace/.rzeclaw/task_results/<correlationId>.json`；每 10 分钟清理过期记录。

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
