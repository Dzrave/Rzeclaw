# Phase 16 探索层 — Event Bus 形态实现说明

本文说明 **「Event Bus 形态：探索层订阅/发布到 Bus，依赖 Phase 14」** 的具体实现，以及与「同进程直连」形态的差异。

---

## 一、Phase 14 依赖是什么

**Phase 14** 引入了进程内 **Event Bus**（见 `docs/EVENT_BUS_AS_HUB_DESIGN.md`、`src/event-bus/`）：

- **Topic**：`chat.request`（用户请求）、`chat.response`（执行层回复）、`chat.stream`（流式 chunk）、`task.status` 等。
- **契约**：接入层（如 Gateway WS）将用户消息封装为 `ChatRequestEvent`，通过 `requestResponse(request)` **发布到 `chat.request`** 并等待 **`chat.response`**；执行层 **订阅 `chat.request`**，执行 Router/executeFlow/runAgentLoop 后 **发布 `chat.response`**。
- **配置**：`config.eventBus.enabled === true` 时，Gateway 不再在 WS 回调里直接调用 `handleChatRequest`，而是 `requestResponse(request)`；server 内已注册的 **订阅者** 收到 `chat.request` 后执行逻辑并发布 `chat.response`。

因此 **「依赖 Phase 14」** 即：探索层要挂在「已存在的 Event Bus + chat.request/chat.response 管线」上，而不是自己造一套 Bus。

---

## 二、Event Bus 形态下探索层的具体实现

当 **`config.eventBus.enabled === true` 且 `config.exploration.enabled === true`** 时：

### 2.1 两段式管线

1. **探索层** 作为 **唯一** 对 `chat.request` 的订阅者：
   - 收到 `ChatRequestEvent` 后执行 Gatekeeper（`shouldSkipExploration` / `shouldEnterExploration`）与 `tryExploration`。
   - 若 **不进入探索** 或 **探索后仅透传**：将原 event 加上 `meta.fromPlanReady: true`，**发布到 `task.plan_ready`**。
   - 若 **探索得到编译结果**：将 event 的 `message` 置为编译后的 `compiledMessage`，并设置 `meta.fromPlanReady`、`meta.fromExploration`、`meta.explorationRecordId`，**发布到 `task.plan_ready`**。
   - 若 **探索得到 Fallback**：直接 **发布 `chat.response`**（用户可见说明），并可选写入黑板、发布 `skill.request`（见下）；**不**发布到 `task.plan_ready`。

2. **执行层** 只订阅 **`task.plan_ready`**（不再直接订阅 `chat.request`）：
   - 收到的 payload 仍是 `ChatRequestEvent` 形状（可能已改 `message` 与 `meta`）。
   - 调用现有 `handleChatRequest(config, event, streamCb)`；其中通过 `event.meta.fromPlanReady` 识别「已由探索层处理」，跳过探索逻辑，直接用 `event.message` 做 runAgentLoop，并用 `meta.explorationRecordId` 做结果回写。

### 2.2 新增 Topic 与类型

- **`task.plan_ready`**（`TOPIC_PLAN_READY`）：探索层输出、执行层输入；payload 与 `ChatRequestEvent` 一致，可能带 `meta.fromPlanReady`、`meta.fromExploration`、`meta.explorationRecordId`。
- **`skill.request`**（`TOPIC_SKILL_REQUEST`）：WO-1623 可选；Planner 产出 Plan_Fallback 时发布，payload 为 `SkillRequestEvent`（correlationId、content、message、sessionId、ts），供复盘或技能扩展消费。

### 2.3 代码位置

| 职责           | 位置 |
|----------------|------|
| 探索层订阅 chat.request、发布 plan_ready/response | `src/gateway/server.ts`：`config.exploration?.enabled` 时分发到 `runExplorationLayerForEventBus`，再 `publish(TOPIC_PLAN_READY | TOPIC_CHAT_RESPONSE)` |
| 探索层逻辑（Gatekeeper + tryExploration）         | `src/gateway/chat-executor.ts`：`runExplorationLayerForEventBus()` |
| 执行层订阅 plan_ready、调用 handleChatRequest     | `src/gateway/server.ts`：`subscribe(TOPIC_PLAN_READY, runExecutionHandler)` |
| 执行层内跳过探索、使用 event.message / explorationRecordId | `src/gateway/chat-executor.ts`：`handleChatRequest` 内 `event.meta?.fromPlanReady` 分支 |
| Topic / Schema                                 | `src/event-bus/schema.ts`：`TOPIC_PLAN_READY`、`TOPIC_SKILL_REQUEST`、`SkillRequestEvent` |

### 2.4 与「同进程直连」的对比

- **直连形态**（无 Event Bus，或 Event Bus 开启但 exploration 关闭）：  
  - 仅有一个订阅者订阅 `chat.request`，直接执行 `handleChatRequest`；探索逻辑在 `handleChatRequest` 内部（Gatekeeper + tryExploration），编译后的 `messageForAgent` 在同一调用栈内交给 runAgentLoop。

- **Event Bus 形态**（eventBus.enabled && exploration.enabled）：  
  - 探索层与执行层在 **事件上** 解耦：探索层只订阅 `chat.request`，执行层只订阅 `task.plan_ready`；探索层通过 **发布** `task.plan_ready` 或 `chat.response` 驱动下游，与设计文档中「探索层订阅 chat.request、发布编译 Event」一致。

---

## 三、Fallback 与 skill.request（WO-1623 可选）

- **黑板**：当 Planner 产出 Plan_Fallback、返回 `fallbackContent` 时，在返回前将 `session.blackboard["__exploration_skill_request"] = fallbackContent`，随 response 回写会话。
- **skill.request**：同一时机下若 `config.eventBus?.enabled`，发布 `TOPIC_SKILL_REQUEST`，payload 为 `SkillRequestEvent`，便于复盘或技能扩展模块订阅并记录「缺失能力」需求。

---

## 四、Gatekeeper 可选触发（uncertainty / failureRate）

- **uncertaintyThreshold**：对消息做简单规则打分（如含 `?`、「可能」「也许」「不确定」等给 0.6）；若配置了 `trigger.uncertaintyThreshold` 且得分 ≥ 该值，则进入探索。
- **failureRateThreshold**：读取近期遥测（`exploration_outcome`、`flow_end`），计算最近 24 小时内失败率；若配置了 `trigger.failureRateThreshold` 且失败率 ≥ 该值，则进入探索。需在调用 `shouldEnterExploration` 时传入 `options.workspace`（已实现）。

---

*实现依据：`docs/EXPLORATION_PLANNER_DESIGN.md`、`docs/PHASE16_EXPLORATION_WORK_ORDERS.md`（WO-1605、WO-1634、WO-1623）、`docs/EVENT_BUS_AS_HUB_DESIGN.md`。*
