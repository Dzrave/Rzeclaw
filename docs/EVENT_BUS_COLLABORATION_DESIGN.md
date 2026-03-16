# 基于 Event Bus 的多 Agent 协作 — 详细设计

本文档为**下一阶段**「多 Agent 通过 Event Bus 协作」的详细设计：**流水线（Pipeline）**、**异步/委派（Async/Delegation）**、**蜂群（Swarm）** 三种模式的事件流、Topic 与 payload 约定、与 Agent 实体及 Event Bus 中枢的衔接。

**设计依据**：`docs/智能体相关`（流水线、异步、蜂群）、`EVENT_BUS_AS_HUB_DESIGN.md`（Event Schema、topic）、`MULTI_AGENT_ENTITY_DESIGN.md`（Agent 实例、FSM、黑板）。**前置依赖**：Event Bus 为中枢、Gateway 降为节点；多 Agent 实体已引入。**本文档仅做设计**，不包含实施计划与工单。

---

## 一、目标与范围

### 1.1 设计目标

| 目标 | 说明 |
|------|------|
| **流水线** | Agent A 完成一段工作后发布「阶段结果」事件，Agent B 订阅该事件被唤醒，继续处理；事件带 correlationId 或 pipelineId 串联整条链路。 |
| **异步/委派** | 主控 Agent 将子任务派发给「打工人 Agent」，主控不阻塞、继续响应用户；打工人完成后通过「回调」topic 或 response 关联将结果回传主控。 |
| **蜂群** | 同一任务广播给多个 Agent，各 Agent 并行执行，结果汇总到共享黑板或聚合节点，再融合为最终输出。 |
| **统一事件契约** | 三种模式复用同一套 Event Bus 与 topic 设计，通过 eventType 或 topic 后缀区分用途；与 chat.request/response 兼容。 |

### 1.2 范围边界

| 在范围内 | 在范围外 |
|----------|----------|
| 三种模式的事件流、topic 命名、payload 字段、与 Agent 内 FSM 的联动 | Event Bus 物理选型与部署（见 EVENT_BUS_AS_HUB_DESIGN） |
| 委派时的「主控—打工人」关联、回调格式 | 具体 FSM 状态枚举与迁移表实现 |
| 蜂群时的结果汇总策略（如简单拼接 vs LLM 融合） | 业务层「谁负责融合」的 product 决策 |

### 1.3 与单次 chat 的区分

- 单次 **chat.request → chat.response** 表示「用户发一条消息，由一个执行单元（默认 Agent 或指定 Agent）处理并回复」。
- **协作** 表示「一次用户请求可能触发多条内部事件、多个 Agent 参与、最终再汇总为一条或若干条 response」。本设计约定：对用户仍暴露为「一次请求、一次（或流式）回复」，内部通过 Bus 的 pipeline/delegate/swarm topic 完成协作。

---

## 二、通用协作事件基底

### 2.1 关联与溯源

- **pipelineId**：一次「用户请求」或「协作链路」的唯一 ID，从首条 request 起贯穿整条流水线/委派/蜂群，便于日志与审计。
- **parentEventId**：本事件由哪条事件触发（如 B 的 request 由 A 的 stage_done 触发），用于 DAG 或链式追溯。
- **correlationId**：与用户请求关联，最终回传 response 时带同一 correlationId。

### 2.2 建议字段（所有协作相关 event 可携带）

```ts
interface CollaborationMeta {
  pipelineId: string;
  parentEventId?: string;
  correlationId: string;
  /** 发起方 agentId（主控或路由） */
  sourceAgentId?: string;
  /** 目标 agentId（委派/广播时的接收方） */
  targetAgentId?: string;
  ts: string;
}
```

---

## 三、流水线模式（Pipeline）

### 3.1 语义

- Agent A 执行完某阶段后，发布「阶段完成」事件；Agent B 订阅此类事件，从 idle 唤醒，以 A 的输出为输入继续执行；B 完成后可再发布，由 C 消费，形成 A → B → C 的流水线。
- 用户仅发一条消息，由路由或主控拆成「先 A 后 B」或由 A 内部发布 stage_done 触发 B。

### 3.2 Topic 与 Payload

- **Topic**：`pipeline.stage_done`（或 `agent.stage_done`）。
- **Payload**：
  - `pipelineId`、`parentEventId`、`correlationId`、`sourceAgentId`（完成本阶段的 Agent）、`ts`。
  - `stageName?: string`（可选阶段名）。
  - `output: unknown`（本阶段产出：文本、结构化数据、或黑板槽位引用）。
  - `nextAgentId?: string`（可选，显式指定下一阶段由谁接；否则由订阅者按规则认领）。
  - `blackboardSnapshot?: Record<string, string>`（可选，当前黑板片段供下游使用）。

### 3.3 订阅与认领

- Agent B 订阅 `pipeline.stage_done`；收到事件后检查 `nextAgentId` 是否为自己或为空（为空则按业务规则认领，如按 stageName）。
- B 将 `output` 与 blackboard 纳入自身输入，更新 FSM 为 executing，执行完毕再发布 `pipeline.stage_done` 或直接发布 `chat.response`（若 B 为最后一环）。

### 3.4 与 chat.response 的衔接

- 流水线最后一环的 Agent 发布 `chat.response`（带同一 correlationId），Gateway 或本地终端据此回传用户；中间环节仅发布 `pipeline.stage_done`，不直接发 chat.response。

---

## 四、异步/委派模式（Async / Delegation）

### 4.1 语义

- 主控 Agent 遇到耗时子任务时，创建「委派请求」事件，指定打工人 Agent；主控自身 FSM 切到 waiting 或继续响应用户；打工人完成后发布「委派结果」事件，主控订阅后取回结果并继续。

### 4.2 Topic 与 Payload

- **委派请求**  
  - **Topic**：`delegate.request`。  
  - **Payload**：`pipelineId`、`correlationId`、`sourceAgentId`（主控）、`targetAgentId`（打工人）、`delegateId`（本次委派唯一 ID）、`task: { message, params?, blackboard? }`、`ts`。  

- **委派结果**  
  - **Topic**：`delegate.result`。  
  - **Payload**：`delegateId`、`pipelineId`、`correlationId`、`sourceAgentId`（打工人）、`targetAgentId`（主控）、`success: boolean`、`content?: string`、`error?: string`、`blackboardDelta?: Record<string, string>`、`ts`。

### 4.3 主控与打工人的行为

- **主控**：发布 `delegate.request` 后，将自身 FSM 置为 waiting（或保留 executing 但标记「等待 delegateId」）；订阅 `delegate.result` 且 `targetAgentId === 自己` 且 `delegateId` 匹配，收到后合并结果到黑板或上下文，FSM 迁回 idle/executing，必要时再发布 chat.response 或继续委派。
- **打工人**：订阅 `delegate.request` 且 `targetAgentId === 自己`；执行任务后发布 `delegate.result`，不直接发 chat.response。

### 4.4 超时与失败

- 主控可配置委派超时；超时未收到 `delegate.result` 则按失败处理（重试或向用户返回「子任务超时」）。打工人执行失败时，`delegate.result` 中 `success: false`、`error` 必填。

---

## 五、蜂群模式（Swarm）

### 5.1 语义

- 同一任务（或同一 message）**广播**给多个 Agent；各 Agent 并行执行，将各自结果发布到「汇总」topic 或写入共享黑板；再由**聚合节点**（可为专门 Agent 或主控）收集并融合，最后发布 chat.response。

### 5.2 Topic 与 Payload

- **广播任务**  
  - **Topic**：`swarm.broadcast`。  
  - **Payload**：`pipelineId`、`correlationId`、`sourceAgentId`（发起方）、`broadcastId`、`task: { message, params? }`、`targetAgentIds: string[]`（可选，空表示所有订阅者均可认领）、`ts`。  

- **单 Agent 结果**  
  - **Topic**：`swarm.contribution`。  
  - **Payload**：`broadcastId`、`pipelineId`、`correlationId`、`sourceAgentId`（贡献者）、`result: unknown`（该 Agent 的产出）、`ts`。  

- **聚合结果**（可选）  
  - **Topic**：`swarm.aggregated` 或直接由聚合方发布 `chat.response`。  
  - 聚合策略：简单拼接、按模板合并、或由 LLM 融合，留产品/实现决定；本设计仅约定「聚合方订阅 swarm.contribution 且 broadcastId 一致，收集齐或超时后产出最终结果」。

### 5.3 认领与去重

- 各 Agent 订阅 `swarm.broadcast`；若 `targetAgentIds` 包含自己或为空，则认领该任务，执行后发布 `swarm.contribution`。同一 broadcastId 可有多条 contribution；聚合方按 broadcastId 收集，可带超时或「最少 N 条」再聚合。

---

## 六、与 Agent 内 FSM 的联动

### 6.1 状态约定

- **idle**：可接受新 request 或认领 pipeline/delegate/swarm 事件。
- **executing**：正在执行自身 flow 或 runAgentLoop。
- **waiting**：已发出 delegate.request 或已发布 pipeline.stage_done 等待下游，等待 delegate.result 或下一阶段事件。
- **done**：本链路中本 Agent 职责已完成。

### 6.2 迁移示例

- 主控发布 `delegate.request` 后：主控 FSM → waiting。  
- 主控收到 `delegate.result` 后：主控 FSM → idle 或 executing（若还有后续步骤）。  
- Agent B 收到 `pipeline.stage_done` 且认领后：B 从 idle → executing。  
- 蜂群中某 Agent 认领 `swarm.broadcast` 后：idle → executing；发布 `swarm.contribution` 后：executing → idle。

---

## 七、与 Event Schema 的兼容

- `chat.request` / `chat.response` 保持不变；协作仅在「执行层内部」使用 pipeline/delegate/swarm topic。
- 若希望监控与审计统一，可在上述 payload 中统一带 `correlationId`、`pipelineId`、`ts`，与 chat 事件一起写入遥测或审计日志。

---

## 八、安全与边界

- **权限**：委派与广播仅应在「已认证/已授权」的执行层内部使用；Event Bus 若暴露给多进程，需保证仅可信节点可发布 delegate/swarm。
- **资源**：蜂群并行时限制同时执行的 Agent 数或 broadcast 的 targetAgentIds 数量，避免雪崩。
- **失败**：任一环节失败应在 payload 中显式标记（如 success: false、error），由上游或聚合方决定重试或向用户报错。

---

## 九、小结

| 模式 | 典型 Topic | 关键字段 |
|------|------------|----------|
| **流水线** | `pipeline.stage_done` | pipelineId、sourceAgentId、output、nextAgentId |
| **委派** | `delegate.request`、`delegate.result` | delegateId、sourceAgentId、targetAgentId、task、result |
| **蜂群** | `swarm.broadcast`、`swarm.contribution` | broadcastId、targetAgentIds、result、聚合策略 |

本文档为详细设计，**不包含实施计划与工单**；实施时需再拆解为「topic 固化、payload 解析、各 Agent 订阅与发布、FSM 迁移与超时」等工单并排期。Event Bus 中枢与 Gateway 降级见 `EVENT_BUS_AS_HUB_DESIGN.md`；Agent 实体见 `MULTI_AGENT_ENTITY_DESIGN.md`。
