# Phase 16：探索层（Exploration Layer）与预案 Planner — 实施计划

本文档为基于 **`docs/EXPLORATION_PLANNER_DESIGN.md`** 的**实施计划**：阶段划分、依赖关系、建议执行顺序与工单文档索引。实现前需确认该设计文档。

---

## 一、阶段总览

| 阶段 | 名称 | 工单范围 | 设计文档 | 工单文档 |
|------|------|----------|----------|----------|
| **Phase 16** | 探索层与预案 Planner（Gatekeeper、先验扫描、Planner/Critic、编译下发、探索经验与复盘对接） | WO-1601～1659 | EXPLORATION_PLANNER_DESIGN.md | PHASE16_EXPLORATION_WORK_ORDERS.md |

---

## 二、依赖关系

```
Phase 13（行为树/状态机、Router、matchFlow、流程库、可选会话 FSM/黑板）— 已完成或进行中
        ↓
可选：Phase 14A（Event Bus、chat.request/chat.response）— 探索层可先以「同进程内执行管道中间件」形态接入，再在 14A 完成后接入 Bus 订阅
        ↓
Phase 16：探索层
  - 16A：配置与 Gatekeeper、接入点（WO-1601～1607）
  - 16B：先验扫描（WO-1610～1615）
  - 16C：Planner 与 Critic（WO-1620～1628）
  - 16D：编译与下发、Fallback（WO-1632～1638）
  - 16E：探索经验存储与复用、结果回写、遥测（WO-1640～1652）
  - 16F：复盘对接与文档验收（WO-1655～1659）
```

- **与 Phase 13 的依赖**：需存在 Router/matchFlow、flowLibrary、config、可选 sessionState/blackboard；Gatekeeper 需读取「是否已命中 flow」以决定是否跳过探索层；先验扫描需读取可用技能/flow 列表（或 MCP 注册表）。
- **与 Phase 14A 的依赖**：设计上探索层为 Event Bus 订阅者；若 14A 未完成，探索层可先作为**执行层管道内中间件**实现（即：执行层在消费到 request 后，先经 Gatekeeper → 探索层 → 再 Router/Executor/runAgentLoop），待 14A 落地后改为「订阅 chat.request、发布编译后 Event」。
- **与 RAG/向量层**：探索经验检索需 **embed + search**；若 RAG 与复盘机制（RAG与复盘机制详细设计）的向量层尚未就绪，可先实现**文件型探索经验存储 + 按 id 复用**或**简单关键词/哈希匹配**，待 RAG-1 或等价能力就绪后接入 `exploration_experience` 集合与向量检索（见 WO-1642、1644）。
- **与复盘**：复盘对探索经验的合并/修剪/质量报告（设计 §11.5）依赖**复盘机制**已存在（RAG-4 或等价）；WO-1655 为「复盘对接」，可在复盘实现后实施。

---

## 三、建议执行顺序（高层）

1. **16A**：配置 schema（exploration.*）、Gatekeeper 逻辑、执行管道接入点（在现有 chat 或 chat.request 消费路径中插入「满足条件则进探索层」）。
2. **16B**：先验扫描：FSM/黑板、可用技能与 MCP、snapshot_digest、SnapshotContext 组装与注入。
3. **16C**：Planner（类型、Prompt 模板、LLM 调用、解析 PlanVariant[]/Plan_Fallback）、Critic（评分公式、Prompt、选最优）。
4. **16D**：预案编译为 Event（correlationId、explorationRecordId）、发布；Plan_Fallback 处理（不编译为执行 Event，产出技能请求或用户说明）。
5. **16E**：探索经验：存储 schema 与写入、检索与复用（含 reuseThreshold、可选 snapshot 兼容）、执行结果回写、遥测事件（exploration_enter/reuse/full_run/store/outcome）。
6. **16F**：复盘模块增加「探索经验」动作（合并/修剪/质量报告）、CONFIG_REFERENCE 与设计衔接、端到端或集成测试。

---

## 四、验收原则（Phase 16）

- **单工单**：每工单完成后需满足该工单文档中的**验收标准**再进入下一工单。
- **16A 验收**：配置可关闭/开启探索层；Gatekeeper 在「已命中 flow、或未达触发条件」时不进入探索层；在「未命中 flow 且满足复杂度/开放性/失败率等条件」时进入探索层。
- **16B 验收**：先验扫描能产出 SnapshotContext（含 fsm、blackboard、availableActions、snapshot_digest）；可被 Planner 输入消费。
- **16C 验收**：Planner 在仅只读上下文中产出 3～5 个 PlanVariant 或 Plan_Fallback；Critic 产出单一最优 planId 及可选 scores；类型与设计 §七 一致。
- **16D 验收**：最优预案可编译为与现有 Event Schema 兼容的 payload；执行层能消费并执行（不感知来源）；Plan_Fallback 不编译为执行 Event，有明确旁路输出。
- **16E 验收**：探索经验可写入与读取；检索命中且 score ≥ reuseThreshold 时复用历史预案并跳过 Planner/Critic；执行完成后可回写 success/fail、token（若实现）；遥测含 exploration_* 事件。
- **16F 验收**：复盘（若已实现）可对探索经验执行合并/修剪/报告；配置与设计文档在 CONFIG_REFERENCE 中可查；至少一条端到端路径（触发探索 → 干跑 → 编译 → 执行）可验证。

---

## 五、工单文档索引

| 阶段 | 工单文档 | 设计文档 |
|------|----------|----------|
| Phase 16 | [PHASE16_EXPLORATION_WORK_ORDERS.md](PHASE16_EXPLORATION_WORK_ORDERS.md) | EXPLORATION_PLANNER_DESIGN.md |

---

*实施时以 EXPLORATION_PLANNER_DESIGN.md 与 PHASE16_EXPLORATION_WORK_ORDERS.md 为准；本计划为总纲与排期参考。*
