# Phase 7 与 Phase 8 实现状态与剩余任务

本文档汇报按计划与工单执行后的**已完成项**与**剩余任务**，便于后续接续实现。

---

## 一、Phase 8：Gateway 安全与局域网（已完成）

| 工单 | 状态 | 说明 |
|------|------|------|
| **WO-801** | ✅ 完成 | `config.gateway.host`，WebSocketServer({ host, port })；默认 127.0.0.1，可配 0.0.0.0 |
| **WO-802** | ✅ 完成 | `config.gateway.auth.enabled`、`auth.apiKeyEnv`，getGatewayApiKey(config) 从环境变量读取 |
| **WO-803** | ✅ 完成 | 首条请求校验 params.apiKey，不通过则 sendError 并 ws.close() |
| **WO-804** | ✅ 完成 | 认证通过后 WeakMap 标记该连接已认证，后续请求不再要求 apiKey |
| **WO-805** | ✅ 完成 | auth.enabled 为 false 或未配置时不校验 |
| **WO-806** | ✅ 完成 | CONFIG_REFERENCE 已补充 gateway.host、gateway.auth 及防火墙说明 |
| **WO-807** | ✅ 完成 | Gateway 侧 mDNS：bonjour.publish({ name: "Rzeclaw", type: "rzeclaw", port }) |
| **WO-808** | ✅ 完成 | 终端侧 discovery:scan，扫描 _rzeclaw._tcp，列表展示并填入 Gateway 地址 |

**代码位置**：`src/config.ts`（GatewayConfig、getGatewayApiKey）、`src/gateway/server.ts`（host、认证逻辑）、`docs/CONFIG_REFERENCE.md`。

---

## 二、Phase 7：终端（部分完成）

### 2.1 已完成

| 工单 | 状态 | 说明 |
|------|------|------|
| **WO-701** | ✅ 完成 | 终端项目脚手架：`terminal/` 下 Electron 应用（main.js, preload.js, index.html, renderer.js, package.json） |
| **WO-702** | ✅ 完成 | 本地配置：electronAPI.configRead/configWrite，存于 userData/config.json |
| **WO-703** | ✅ 完成 | WebSocket 连接，连接状态展示（未连接/连接中/已连接/已断开） |
| **WO-704** | ✅ 完成 | JSON-RPC 封装：invoke(method, params) 带 id，pending Map 解析 result/error |
| **WO-705** | ✅ 完成 | 流式消息：onmessage 识别 stream: "text" chunk，appendStreamChunk 累积展示 |
| **WO-706** | ✅ 完成 | 连接成功后调用 health，状态栏展示「已连接 ✓」或异常提示 |
| **WO-707** | ✅ 完成 | session.getOrCreate、session.list；会话列表展示与选择 |
| **WO-708** | ✅ 完成 | session.restore、session.saveSnapshot 已可调用（恢复后消息数占位展示） |
| **WO-709** | ✅ 完成 | chat 发送与流式展示，最终 result.content 写回 |
| **WO-710** | ⏸ 部分 | 当前会话消息列表为本轮发送/回复；历史消息仅显示「已恢复 N 条」占位（Gateway 未返回历史消息列表） |
| **WO-711** | ✅ 完成 | 输入框与发送按钮，Enter 发送，发送中禁用按钮 |

### 2.2 已完成（WO-712～723）

| 工单 | 状态 | 说明 |
|------|------|------|
| **WO-712～714** | ✅ 完成 | 画布：canvas.get、右侧面板 goal/steps、刷新画布（只读；canvas.update 未做编辑） |
| **WO-715～716** | ✅ 完成 | 提议：proactive.suggest 展示；Heartbeat：heartbeat.tick 手动触发并展示 |
| **WO-717** | ✅ 完成 | 工具：刷新列表 tools.list 展示 |
| **WO-718** | ✅ 完成 | 设置：Gateway 地址须 ws:// 或 wss://，否则 alert |
| **WO-719** | ⏸ 未做 | 多连接配置（多组 URL/Key 与切换） |
| **WO-720～721** | ✅ 完成 | 主布局：会话列表+消息区+右侧面板（画布/提议/Heartbeat/工具）；连接失败 #connectError 与重试 |
| **WO-722～723** | ✅ 完成 | 打包 npm run dist；terminal/README.md 已更新 |

---

## 三、Phase 9：任务体系与 Heartbeat 增强（已完成）

| 工单 | 状态 | 说明 |
|------|------|------|
| **WO-901** | ✅ 完成 | syncCanvasToTasks(workspace)：Canvas goal/steps 同步到 tasks.json（canvas_goal / canvas_step_*） |
| **WO-902** | ✅ 完成 | HEARTBEAT.md 解析：多级列表（- / 1. 剥离）、[高][中][低] 优先级，lines + suggestedInput |
| **WO-903** | ✅ 完成 | heartbeat.checkUseLLM：为 true 时 Check 调用 LLM 判断是否执行及建议项 |
| **WO-904** | ✅ 完成 | heartbeat.requireConfirmation：为 true 时 Act 仅写 .rzeclaw/heartbeat_pending.json，不执行 |
| **WO-905** | ✅ 完成 | Agent 写回 Canvas 后调用 syncCanvasToTasks；Heartbeat/Proactive 入口先 sync 再读任务 |
| **WO-906** | ✅ 完成 | runProactiveInference 注入近期记忆（memory 启用时 query_by_condition limit 3） |
| **WO-907** | ✅ 完成 | CONFIG_REFERENCE 补充 checkUseLLM、requireConfirmation 及任务与画布联动说明 |

**代码位置**：`src/config.ts`（heartbeat.checkUseLLM/requireConfirmation）、`src/proactive/canvas-sync.ts`、`src/proactive/inference.ts`、`src/heartbeat/check.ts`、`src/heartbeat/act.ts`、`src/heartbeat/tick.ts`、`src/agent/loop.ts`、`docs/CONFIG_REFERENCE.md`。

---

## 四、Phase 10：蜂群角色与多上下文（已完成）

| 工单 | 状态 | 说明 |
|------|------|------|
| **WO-1001** | ✅ 完成 | config.roles（dev/knowledge/pm/swarm_manager/general）与默认片段；getRoleFragment(config, sessionType) |
| **WO-1002** | ✅ 完成 | Session.sessionType；getOrCreateSession(sessionId, sessionType)；session.getOrCreate 接受 sessionType |
| **WO-1003** | ✅ 完成 | runAgentLoop 按 sessionType 注入 [Role] 片段 |
| **WO-1004** | ✅ 完成 | SessionSnapshot.sessionType；writeSnapshot/readSnapshot/listSnapshots 含 sessionType |
| **WO-1005** | ✅ 完成 | session.list 已支持 workspace 参数；返回项含 sessionType，终端可分组展示 |
| **WO-1009** | ✅ 完成 | config.swarm（teams: { id, name, workspaces? }[], defaultTeamId）；加载与默认 |
| **WO-1010** | ✅ 完成 | sessionType=swarm_manager 且 teamId 时注入「当前协调团队：name，工作区：…」 |
| **WO-1006/1007/1011** | ✅ 完成 | 终端：会话类型下拉（开发/知识库/PM/蜂群管理/通用）；列表与恢复展示 sessionType；蜂群管理时可选团队（swarm.getTeams） |
| **WO-1008** | ✅ 完成 | CONFIG_REFERENCE 补充 roles、swarm；设计文档已含蜂群管理与多层级配置 |

**代码位置**：`src/config.ts`（RolesConfig、SwarmConfig、getRoleFragment）、`src/gateway/server.ts`（Session.sessionType、swarm.getTeams、chat 传 sessionType/teamId）、`src/agent/loop.ts`（角色与团队注入）、`src/session/snapshot.ts`、`terminal/index.html`、`terminal/renderer.js`、`docs/CONFIG_REFERENCE.md`、`docs/SWARM_ROLES_AND_CONTEXTS_DESIGN.md`、`docs/PHASE10_WORK_ORDERS.md`。

---

## 五、Phase 11：知识库流水线与咨询（已完成）

| 工单 | 状态 | 说明 |
|------|------|------|
| **WO-1101** | ✅ 完成 | config.knowledge（ingestPaths、ingestOnStart、retrieveLimit）加载与默认 |
| **WO-1102** | ✅ 完成 | 单文件摄取：读文件→分块→以 L1 document 写入 store（provenance.source_path、ingest_batch_id） |
| **WO-1103** | ✅ 完成 | 批量摄取：扫描目录、.md/.txt/.json/.rst 过滤、逐个 ingestFile |
| **WO-1104** | ✅ 完成 | Gateway knowledge.ingest(workspace?, paths?)；ingestOnStart 时启动自动摄取 |
| **WO-1105** | ✅ 完成 | retrieve 支持 layer 参数；knowledge 会话使用 knowledge.retrieveLimit（默认 10） |
| **WO-1106** | ✅ 完成 | knowledge 角色描述加强「仅依据记忆与检索作答、不执行写盘」 |
| **WO-1107** | ✅ 完成 | 终端选择「知识库」时显示「依据知识库回答」提示 |
| **WO-1108** | ✅ 完成 | CONFIG_REFERENCE 补充 knowledge.* |

**代码位置**：`src/config.ts`、`src/memory/types.ts`（document、provenance 扩展）、`src/knowledge/ingest.ts`、`src/knowledge/index.ts`、`src/memory/retrieve.ts`、`src/agent/loop.ts`、`src/gateway/server.ts`、`terminal/index.html`、`terminal/renderer.js`、`docs/CONFIG_REFERENCE.md`。

---

## 六、Phase 12：自我诊断与改进（已完成）

| 工单 | 状态 | 说明 |
|------|------|------|
| **WO-1201** | ✅ 完成 | config.diagnostic（intervalDays、outputPath、intervalDaysSchedule）加载与默认 |
| **WO-1202** | ✅ 完成 | 从 sessions.jsonl 汇总时间范围内会话数、工具调用/失败、轮数 |
| **WO-1203** | ✅ 完成 | 记忆侧：L1 热存储行数、audit.jsonl 写入条数 |
| **WO-1204** | ✅ 完成 | heartbeat_history.jsonl 追加；汇总 Heartbeat 执行次数与错误 |
| **WO-1205** | ✅ 完成 | 组装 DiagnosticReport，写入 .rzeclaw/diagnostics/report_<date>.json |
| **WO-1206** | ✅ 完成 | Gateway diagnostic.report(workspace?, days?)；CLI diagnostic-report -w -d |
| **WO-1207** | ✅ 完成 | 规则生成 1～3 条改进建议，写入 .rzeclaw/self_improvement_suggestions.md |
| **WO-1208** | ✅ 完成 | diagnostic.intervalDaysSchedule > 0 时定时生成报告与建议 |
| **WO-1209** | ✅ 完成 | CONFIG_REFERENCE 补充 diagnostic.* 与使用说明 |

**代码位置**：`src/config.ts`、`src/heartbeat/record.ts`（history 追加）、`src/diagnostic/report.ts`、`src/diagnostic/suggestions.ts`、`src/diagnostic/index.ts`、`src/gateway/server.ts`、`src/cli.ts`、`docs/CONFIG_REFERENCE.md`。

---

## 七、可选任务（已完成）

| 项目 | 状态 | 说明 |
|------|------|------|
| **WO-719 多连接配置** | ✅ 完成 | 配置结构 `connections: [{ id, name, gatewayUrl, apiKey }]`、`activeConnectionId`；设置页连接下拉、添加/删除、保存并连接；工具栏连接切换（断开后重连）。 |
| **画布编辑与 canvas.update** | ✅ 完成 | 画布面板增加「编辑目标」「编辑步骤」输入与「保存画布」按钮；解析步骤行（支持 [done]/[in_progress]）；调用 `canvas.update` 后刷新。 |

---

## 八、如何运行与验证

- **Gateway**：`cd e:\Rzeclaw && npm run build && node rzeclaw.mjs gateway`（可选在 rzeclaw.json 中配置 `gateway: { host: "0.0.0.0" }` 以接受局域网）。
- **终端**：`cd e:\Rzeclaw\terminal && npm start`；在设置中填写 Gateway 地址（如 ws://127.0.0.1:18789），保存后连接即可发送消息并看到流式回复。
- **认证**：若在配置中启用 `gateway.auth.enabled` 并设置环境变量 `RZECLAW_GATEWAY_API_KEY`，终端设置页需填写相同 API Key，首条请求会携带并完成认证。

---

---

*本文档为当前实现状态与剩余任务的汇报；Phase 7～12 及可选任务（WO-719、画布编辑）均已完成；后续请以各 Phase 工单文档为准。*
