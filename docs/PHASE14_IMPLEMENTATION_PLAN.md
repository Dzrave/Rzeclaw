# Phase 14 与可选阶段 — 实施计划

本文档为**下一阶段**（Event Bus 为中枢、多 Agent 实体、Event Bus 协作）及**可选阶段**（安全隐私增强、配置热重载、任务与 Gateway 解耦）的**实施计划**：阶段划分、依赖关系、建议执行顺序与工单文档索引。设计依据见「五、下一阶段与可选设计文档索引」中各设计文档。

---

## 一、阶段总览

| 阶段 | 名称 | 工单范围 | 设计文档 | 工单文档 |
|------|------|----------|----------|----------|
| **Phase 14A** | Event Bus 为中枢、Gateway 降为节点 | WO-1401～1429 | EVENT_BUS_AS_HUB_DESIGN.md | PHASE14_EVENT_BUS_WORK_ORDERS.md |
| **Phase 14B** | 多 Agent 实体 | WO-1430～1459 | MULTI_AGENT_ENTITY_DESIGN.md | PHASE14_MULTI_AGENT_WORK_ORDERS.md |
| **Phase 14C** | 基于 Event Bus 的多 Agent 协作 | WO-1460～1489 | EVENT_BUS_COLLABORATION_DESIGN.md | PHASE14_COLLABORATION_WORK_ORDERS.md |
| **可选** | 安全隐私增强、配置热重载、任务解耦 | WO-1501～1550 | 见下 | PHASE14_OPTIONAL_WORK_ORDERS.md |

**说明**：IDE Phase E 设计规范见 `IDE_OPERATION_PHASE_E_DESIGN.md`；实现状态见 `IDE_OPERATION_IMPLEMENTATION_PLAN.md`（011～016 已实现），本计划不另列工单。

---

## 二、依赖关系

```
Phase 13（行为树/状态机、Gateway 现有 chat 路径）— 已完成
        ↓
Phase 14A：Event Bus + Schema + Gateway 改造 + 执行层对接
        ↓
Phase 14B：多 Agent 蓝图/实例、Router 扩展、调度层（依赖 14A 的 Bus 或可先同进程内逻辑总线）
        ↓
Phase 14C：流水线/委派/蜂群 topic 与 payload、Agent 内 FSM 联动（依赖 14A、14B）

可选阶段与 14A/14B/14C 无强依赖，可并行规划：
  - 安全隐私增强：可独立于 14 实施
  - 配置热重载：可与 14A 并行，或于 14A 执行层拆出后优先做
  - 任务与 Gateway 解耦：依赖 14A（执行层独立或 Bus 存在）后实施更顺
```

- **14A 先行**：无 Event Bus 则 14B 的「派发到 Agent 实例」仍可先做在同进程内（不经过 Bus），但 Gateway 降为节点、重启不打断任务等目标需 14A 落地。
- **14B 可与 14A 部分并行**：蓝图加载、Router 产出 agentId、调度层「选实例并执行」可在同进程内先实现；再在 14A 完成后将「发布 request / 订阅 response」接入 Bus。
- **14C 必须 14A+14B**：协作依赖 Bus topic 与多 Agent 实例。

---

## 三、建议执行顺序（高层）

1. **Phase 14A**：按 PHASE14_EVENT_BUS_WORK_ORDERS.md 顺序完成 WO-1401～1429（先进程内逻辑总线，再 Gateway 改造，再执行层对接；可选独立 Bus 进程）。
2. **Phase 14B**：按 PHASE14_MULTI_AGENT_WORK_ORDERS.md 顺序完成 WO-1430～1459（蓝图与配置 → 实例生命周期 → Router 扩展 → 调度层 → 局部记忆/黑板）。
3. **Phase 14C**：按 PHASE14_COLLABORATION_WORK_ORDERS.md 顺序完成 WO-1460～1489（pipeline → delegate → swarm；topic 与 payload 实现、Agent 内 FSM 联动）。
4. **可选**：按需与资源实施 PHASE14_OPTIONAL_WORK_ORDERS.md 中安全隐私增强（WO-1501～1519）、配置热重载（WO-1520～1539）、任务解耦（WO-1540～1569）；可与 14A 后段或 14B 并行。

---

## 四、验收原则（通用）

- 每工单完成后需满足该工单文档中的**验收标准**再进入下一工单。
- Phase 14A 阶段验收：Gateway 以「发布 request、订阅 response」方式工作，执行层独立消费 request 并发布 response；可选「Gateway 重启后执行层任务不中断」在任务解耦或同进程形态下部分满足。
- Phase 14B 阶段验收：Router 可产出 agentId，调度层可创建/复用 Agent 实例并派发请求，实例使用蓝图配置（systemPrompt、boundFlowIds、局部黑板）。
- Phase 14C 阶段验收：至少一种协作模式（如 pipeline 或 delegate）端到端可用，事件格式与设计文档一致。
- 可选阶段验收：见各可选工单文档。

---

## 五、工单文档索引

| 阶段 | 工单文档 | 设计文档 |
|------|----------|----------|
| Phase 14A | [PHASE14_EVENT_BUS_WORK_ORDERS.md](PHASE14_EVENT_BUS_WORK_ORDERS.md) | EVENT_BUS_AS_HUB_DESIGN.md |
| Phase 14B | [PHASE14_MULTI_AGENT_WORK_ORDERS.md](PHASE14_MULTI_AGENT_WORK_ORDERS.md) | MULTI_AGENT_ENTITY_DESIGN.md |
| Phase 14C | [PHASE14_COLLABORATION_WORK_ORDERS.md](PHASE14_COLLABORATION_WORK_ORDERS.md) | EVENT_BUS_COLLABORATION_DESIGN.md |
| 可选 | [PHASE14_OPTIONAL_WORK_ORDERS.md](PHASE14_OPTIONAL_WORK_ORDERS.md) | SECURITY_PRIVACY_ENHANCEMENT_DESIGN.md、CONFIG_HOT_RELOAD_DESIGN.md、TASK_GATEWAY_DECOUPLING_DESIGN.md |

---

*实施时以各设计文档与对应工单文档为准；本计划为总纲与排期参考。*
