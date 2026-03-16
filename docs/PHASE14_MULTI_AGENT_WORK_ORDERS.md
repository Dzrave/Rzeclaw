# Phase 14B：多 Agent 实体 — 工单

基于 `docs/MULTI_AGENT_ENTITY_DESIGN.md` 进行工单拆解。**实现前需确认该设计文档。** 建议在 Phase 14A（Event Bus）至少完成进程内逻辑总线与 Gateway/执行层对接后再实施本阶段，或与 14A 并行时先做同进程内「路由到 Agent 实例」逻辑。

---

## 一、工单列表

| 工单 ID | 名称 | 依赖 | 范围 | 验收标准 |
|---------|------|------|------|----------|
| **WO-1430** | Agent 蓝图类型与配置加载 | 无 | 定义 AgentBlueprint（id、name、systemPrompt、boundFlowIds、localMemory、llm、toolsFilter）；config.agents.blueprints 或独立文件加载；getAgentBlueprint(id) | 可配置并读取蓝图，按 id 查找 |
| **WO-1431** | Agent 实例类型与状态枚举 | 无 | 定义 AgentInstance（instanceId、blueprintId、state、blackboard、sessionId、createdAt、lastActiveAt）；AgentInstanceState = idle \| executing \| waiting \| done | 类型可被调度层与执行逻辑引用 |
| **WO-1432** | 实例创建与回收策略 | WO-1430, WO-1431 | 根据 blueprintId 创建实例（生成 instanceId、初始化 blackboard、state=idle）；回收策略：空闲超 N 分钟或 done 后回收；可选实例池上限 | 可创建实例并在满足条件时回收 |
| **WO-1433** | Router 产出 agentId | WO-1430 | 扩展 matchFlow/route：若配置了 agents.blueprints 且存在意图→agent 映射，产出 agentId（及 flowId、params）；无多 Agent 配置时 agentId 为空，行为与现有一致 | 路由结果可含 targetAgentId |
| **WO-1434** | 调度层：按 agentId 解析实例 | WO-1432, WO-1433 | 收到 request 或路由结果后，若 agentId 存在则 getOrCreateInstance(agentId)；否则使用默认执行路径（当前单一路径） | 有 agentId 时能拿到对应实例 |
| **WO-1435** | 调度层：派发请求到实例 | WO-1434 | 将 message、sessionId、params、flowId 派发给实例；实例内更新 state=executing，执行「在 boundFlowIds 内 match 或 runAgentLoop」；使用蓝图的 systemPrompt、可选 llm | 实例按蓝图配置执行并返回结果 |
| **WO-1436** | 实例内 flow 匹配与执行 | WO-1435 | 若 boundFlowIds 非空，matchFlow 仅在该列表内匹配；executeFlow/runAgentLoop 使用实例的 blackboard、workspace；工具执行与审计带 agentId/blueprintId | flow 归属与工具归属正确 |
| **WO-1437** | 默认 Agent 与无 agentId 路径 | WO-1434 | 当 Router 未产出 agentId 时，使用 config.agents.defaultAgentId 或隐式「全局 runAgentLoop」单例；与现有「不匹配则 runAgentLoop」兼容 | 未配置多 Agent 时行为不变 |
| **WO-1438** | 局部黑板与 session 黑板衔接 | WO-1435 | 实例 blackboard 与当前 session 的 blackboard 可约定为同一引用（会话级）或实例独立；设计建议「实例独立」；executeFlow/runAgentLoop 使用实例 blackboard | 黑板读写归属清晰 |
| **WO-1439** | 局部记忆（可选） | WO-1430, WO-1435 | 若蓝图 localMemory.enabled，flushToL1/retrieve 使用该实例的 storagePath 或 workspace 子路径；检索上限用 localMemory.retrieveLimit | 局部记忆隔离可配置可用 |
| **WO-1440** | 与 Event Bus 的对接（14A 完成后） | 14A, WO-1435 | 执行层从 chat.request 取 message/sessionId；路由产出的 agentId 交调度层；调度层派发到实例后，将结果通过 chat.response 发布（与 14A 一致） | 多 Agent 与 Bus 协同工作 |
| **WO-1441** | 审计与 ops.log 带 agentId | WO-1436 | appendOpLog、审计写入时带 agentId 或 blueprintId（若存在）；便于追溯「谁执行了哪条命令」 | 审计可按 Agent 过滤或统计 |
| **WO-1442** | CONFIG_REFERENCE 与术语 | WO-1430～1437 | 文档：agents.blueprints、defaultAgentId、boundFlowIds、localMemory；术语表区分「Agent 路径」与「Agent 实体」 | 配置与术语可查 |

**建议实现顺序**：1430 → 1431 → 1432 → 1433 → 1434 → 1435 → 1436 → 1437 → 1438 → 1439（可选）→ 1440（依赖 14A）→ 1441 → 1442。

---

## 二、依赖关系简图

```
WO-1430 ── WO-1433 ── WO-1434 ── WO-1435 ── WO-1436
   │                      │           │
WO-1431 ── WO-1432 ──────┘           ├── WO-1438, WO-1439
   │                                  ├── WO-1440（14A）
   │                                  └── WO-1441, WO-1442
   └── WO-1437（与 1434 并列）
```

---

## 三、设计文档索引

| 依据 | 文档 |
|------|------|
| 设计 | `docs/MULTI_AGENT_ENTITY_DESIGN.md` |
| 总计划 | `docs/PHASE14_IMPLEMENTATION_PLAN.md` |

---

*实现时以 MULTI_AGENT_ENTITY_DESIGN.md 与本文档为准。*
