# Phase 14C：基于 Event Bus 的多 Agent 协作 — 工单

基于 `docs/EVENT_BUS_COLLABORATION_DESIGN.md` 进行工单拆解。**实现前需确认该设计文档。** **前置依赖**：Phase 14A（Event Bus）、Phase 14B（多 Agent 实体）已完成或至少同进程内多 Agent 与 Bus 可用。

---

## 一、工单列表

| 工单 ID | 名称 | 依赖 | 范围 | 验收标准 |
|---------|------|------|------|----------|
| **WO-1460** | 协作事件基底类型 | 无 | 定义 CollaborationMeta（pipelineId、parentEventId、correlationId、sourceAgentId、targetAgentId、ts）；与设计 §2 一致 | 类型可被 pipeline/delegate/swarm 复用 |
| **WO-1461** | pipeline.stage_done topic 与 payload | WO-1460, 14A | 实现 topic pipeline.stage_done；payload 含 pipelineId、correlationId、sourceAgentId、stageName、output、nextAgentId、blackboardSnapshot、ts | 事件可发布与订阅 |
| **WO-1462** | 流水线：Agent 发布 stage_done | 14B, WO-1461 | 某 Agent 实例完成阶段后，构造 payload 并 publish("pipeline.stage_done", payload)；FSM 迁至 done 或 idle | 执行层可发布阶段完成事件 |
| **WO-1463** | 流水线：下游 Agent 订阅与认领 | 14B, WO-1461 | Agent 订阅 pipeline.stage_done；收到后检查 nextAgentId 是否为自己或为空（按规则认领）；将 output/blackboard 纳入输入，state→executing，执行后再发布 stage_done 或 chat.response | 下游能认领并继续执行 |
| **WO-1464** | 流水线最后一环发布 chat.response | WO-1462, WO-1463 | 约定最后一环 Agent 发布 chat.response（同一 correlationId）而非仅 stage_done；Gateway 或终端收到最终回复 | 用户收到完整回复 |
| **WO-1465** | delegate.request / delegate.result topic | WO-1460, 14A | 实现 topic delegate.request、delegate.result；payload 含 delegateId、pipelineId、correlationId、sourceAgentId、targetAgentId、task、success、content、error、blackboardDelta、ts | 委派请求与结果可经 Bus 传递 |
| **WO-1466** | 委派：主控发布 request 与 FSM | 14B, WO-1465 | 主控 Agent 发布 delegate.request（targetAgentId=打工人）；主控 FSM 置为 waiting；维护 delegateId → 主控实例 映射 | 主控不阻塞并进入等待 |
| **WO-1467** | 委派：打工人订阅与执行 | 14B, WO-1465 | 打工人 Agent 订阅 delegate.request 且 targetAgentId 为自己；执行 task 后发布 delegate.result（targetAgentId=主控、success、content/error） | 打工人完成任务并回传 |
| **WO-1468** | 委派：主控订阅 result 与恢复 | WO-1466, WO-1467 | 主控订阅 delegate.result 且 targetAgentId 为自己且 delegateId 匹配；合并结果到黑板；FSM 迁回 idle/executing；可选再发布 chat.response | 主控收到回调并继续 |
| **WO-1469** | 委派超时与失败处理 | WO-1466～1468 | 主控侧：委派超时未收到 result 则按失败处理（重试或向用户返回）；result 中 success: false 时主控记录 error | 超时与失败有明确处理 |
| **WO-1470** | swarm.broadcast / swarm.contribution topic | WO-1460, 14A | 实现 topic swarm.broadcast、swarm.contribution；broadcast 含 broadcastId、task、targetAgentIds；contribution 含 broadcastId、sourceAgentId、result | 广播与贡献可经 Bus 传递 |
| **WO-1471** | 蜂群：发起方广播与聚合方 | 14B, WO-1470 | 发起方（或路由）发布 swarm.broadcast；某聚合节点（或主控）订阅 swarm.contribution，按 broadcastId 收集；收集齐或超时后融合结果并发布 chat.response | 多 Agent 结果可汇总 |
| **WO-1472** | 蜂群：各 Agent 认领与发布 contribution | 14B, WO-1470 | Agent 订阅 swarm.broadcast；若 targetAgentIds 含自己或为空则认领；执行后发布 swarm.contribution；state 从 idle→executing→idle | 并行执行并贡献结果 |
| **WO-1473** | Agent 内 FSM 与协作状态迁移 | 14B, WO-1462～1472 | 统一 idle/executing/waiting/done 在 pipeline、delegate、swarm 中的迁移时机（见设计 §6）；代码中 FSM 更新与事件收发一致 | 状态迁移符合设计 |
| **WO-1474** | 协作审计与日志 | WO-1461～1472 | pipeline/delegate/swarm 事件发布时带 pipelineId、correlationId、ts；可选写入统一审计或遥测日志 | 协作链路可追溯 |
| **WO-1475** | CONFIG_REFERENCE 与协作说明 | WO-1461～1474 | 文档：协作 topic、payload 约定、与单次 chat 的区分；可选配置（如委派超时、蜂群聚合策略） | 配置与用法可查 |

**建议实现顺序**：1460 → 1461 → 1462 → 1463 → 1464 → 1465 → 1466 → 1467 → 1468 → 1469 → 1470 → 1471 → 1472 → 1473 → 1474 → 1475。

---

## 二、依赖关系简图

```
WO-1460 ──┬── WO-1461 ── WO-1462 ── WO-1463 ── WO-1464
          ├── WO-1465 ── WO-1466 ── WO-1467 ── WO-1468 ── WO-1469
          └── WO-1470 ── WO-1471 ── WO-1472 ── WO-1473 ── WO-1474 ── WO-1475
```

---

## 三、设计文档索引

| 依据 | 文档 |
|------|------|
| 设计 | `docs/EVENT_BUS_COLLABORATION_DESIGN.md` |
| 总计划 | `docs/PHASE14_IMPLEMENTATION_PLAN.md` |

---

*实现时以 EVENT_BUS_COLLABORATION_DESIGN.md 与本文档为准。*
