# 任务与 Gateway 解耦 — 详细设计

本文档为**任务与 Gateway 解耦**的详细设计：将**长任务**（如单次 chat 触发的 runAgentLoop 或 executeFlow）从 Gateway 进程剥离到**独立执行层/Worker**，使 Gateway 重启或断开时**不终止进行中的任务**；用户重连后可通过任务 ID 或会话查询状态与结果。

**设计依据**：与「Event Bus 为中枢、Gateway 降为节点」配合；用户诉求「改配置/重启 Gateway 不打断多智能体任务」。**本文档仅做设计**，不包含实施计划与工单。

---

## 一、目标与范围

### 1.1 设计目标

| 目标 | 说明 |
|------|------|
| **任务存活独立于 Gateway** | 任务在执行层（独立进程或独立运行时）运行；Gateway 进程退出或重启时，执行层与任务继续存在，结果可被后续连接的客户端或同一 correlationId 的订阅者获取。 |
| **可查询与可恢复** | 用户或客户端可通过「任务 ID / correlationId / sessionId」查询任务状态（排队中、执行中、已完成、失败）；已完成任务可拉取结果（content、stream 摘要等）。 |
| **结果投递** | 任务完成后，结果通过 Event Bus 的 chat.response（及可选 chat.stream）或等价通道投递；若原 Gateway 连接已断开，则结果仍可被「任务状态查询」接口返回，或由新连接的客户端按 sessionId/correlationId 拉取。 |

### 1.2 范围边界

| 在范围内 | 在范围外 |
|----------|----------|
| 任务与执行层的归属关系、任务状态模型、查询接口、结果存储与过期策略、与 Event Bus 的衔接 | 具体 Worker 进程模型（多进程 vs 线程池 vs 单进程多协程），留实施时定 |
| Gateway 断开后「未完成请求」的语义（超时、重连后拉取） | 分布式任务队列与跨机调度 |

### 1.3 与当前实现的衔接

- **现状**：Gateway 进程内同步执行 Router → executeFlow / runAgentLoop；连接断开或进程退出即中断执行。
- **目标**：Gateway 收到 chat 后，将请求**派发**到执行层（如通过 Event Bus 发布 chat.request）；执行层在**独立上下文**中执行，将结果发布到 chat.response；Gateway 仅订阅 response 并回传连接。若 Gateway 在任务完成前断开，执行层仍完成任务并发布 response；新连接或「任务查询」接口可基于 correlationId/sessionId 取回结果。

---

## 二、任务状态模型

### 2.1 任务标识

- **correlationId**：与 chat.request 一致，唯一标识「本次用户请求」；response 与状态查询均带此 ID。
- **可选 taskId**：执行层内部生成的唯一 ID，便于日志与存储；对外可仅暴露 correlationId，或同时暴露 taskId。

### 2.2 状态枚举

- **pending**：已入队，尚未被 Worker 接管。
- **running**：正在执行（Router + executeFlow 或 runAgentLoop）。
- **completed**：执行成功，结果已就绪（已发布 chat.response 或已写入结果存储）。
- **failed**：执行失败，错误信息已就绪。
- **cancelled**：被取消（可选能力，如用户主动取消或超时取消）。
- **timeout**：执行超时（可选）。

### 2.3 结果存储

- 任务进入 **completed** 或 **failed** 后，执行层将结果（content、error、citedMemoryIds 等）与 correlationId 写入**结果存储**（内存 Map 或持久化如 workspace/.rzeclaw/task_results/<correlationId>.json），并设置**过期时间**（如 24 小时）；过期后可删除或归档。
- 同时照常发布 **chat.response** 到 Event Bus；订阅者（Gateway 或本地终端）若仍连接则可实时收到；若已断开，则依赖「任务状态查询」拉取该 correlationId 的结果。

---

## 三、执行层与 Gateway 的职责划分

### 3.1 执行层

- **订阅** chat.request（若使用 Event Bus）或接收来自 Gateway 的派发请求。
- **入队或直接执行**：为每条 request 生成或使用 correlationId，创建任务记录（状态 pending → running），在独立进程/线程/协程中执行 Router → Executor / runAgentLoop。
- **发布结果**：执行完成后发布 chat.response（及可选 chat.stream 的摘要）；将结果写入结果存储；任务状态置为 completed/failed。
- **提供查询接口**：支持「按 correlationId 或 sessionId 查询任务状态与结果」；可通过 Event Bus 的 admin topic（如 `task.status` 请求/响应）或独立 HTTP/本地 socket 提供。

### 3.2 Gateway

- **发布 request**：收到用户消息后发布 chat.request（带 correlationId），并维护「connection/session → correlationId」的映射（用于将 response 回传给对应连接）。
- **订阅 response**：收到 chat.response 时，根据 correlationId 找到对应连接，推送结果并清理映射；若连接已断开，则丢弃或仅记录日志，不抛错。
- **可选：任务查询代理**：若客户端重连后请求「拉取某 sessionId 或 correlationId 的未取回结果」，Gateway 可代理请求到执行层的查询接口，再将结果返回客户端。

### 3.3 断开与重连语义

- **Gateway 断开**：进行中的任务在执行层继续；完成后 response 发布到 Bus，但无订阅者（Gateway 已退出）时，结果仅存在于执行层的结果存储中。
- **用户重连**：新连接建立后，客户端可调用「获取该 session 下未取回的结果」或「按 correlationId 查询」；Gateway 转发到执行层查询接口，若有则返回结果并标记已取回（可选），实现「重启/重连后仍能拿到结果」。

---

## 四、查询接口设计

### 4.1 按 correlationId 查询

- **请求**：`task.getResult` 或等价，params: `{ correlationId: string }`。
- **响应**：`{ status: "pending" | "running" | "completed" | "failed" | "cancelled" | "timeout", content?: string, error?: string, citedMemoryIds?: string[], completedAt?: string }`；若 status 为 completed/failed 且结果未过期，则带 content/error 等。

### 4.2 按 sessionId 查询（可选）

- **请求**：`task.listBySession`，params: `{ sessionId: string, limit?: number }`。
- **响应**：该 session 下最近 N 条任务的 correlationId、status、completedAt；客户端可再按 correlationId 调用 getResult 拉取具体结果。用于「本会话未取回的结果列表」。

### 4.3 过期与清理

- 结果存储中每条记录带 `expiresAt`；查询时若已过期则返回「已过期」或从存储删除并不再返回。定时任务可周期性清理过期记录。

---

## 五、与 Event Bus 的衔接

### 5.1 请求路径

- 用户消息 → Gateway → 发布 **chat.request**（correlationId、message、sessionId、…）→ 执行层订阅并执行 → 发布 **chat.response**（同一 correlationId）→ Gateway 或本地终端订阅并回传（若仍连接）。

### 5.2 任务状态事件（可选）

- 执行层可在任务状态变更时发布 **task.status** 事件：`{ correlationId, status, ts }`；监控或 Dashboard 可订阅以展示实时状态，不强制 Gateway 依赖此 topic。

### 5.3 无 Event Bus 时的退化

- 若暂未引入 Event Bus，可退化为「Gateway 将 request 通过本地 socket 或 HTTP 转发给执行层进程，执行层执行后通过同一通道回写 response」；Gateway 仍不执行 runAgentLoop，仅做转发与连接管理，重启时执行层进程不退出，任务不中断。查询接口由执行层直接提供（本地 socket 或 HTTP）。

---

## 六、配置与部署

### 6.1 配置建议

- `taskExecution?: { mode?: "in_process" | "worker" }`：in_process 表示与 Gateway 同进程（当前行为，无解耦）；worker 表示派发到独立 Worker，实现解耦。
- `taskResults?: { retentionMinutes?: number }`：结果保留时长，过期删除。

### 6.2 部署形态

- **形态 A**：Gateway 与执行层为同一进程，但「执行」在异步任务队列中运行（如 setImmediate/queueMicrotask 或内部 Worker 线程）；Gateway 重启仍会拉掉整个进程，仅适合「同一进程内异步化」、为未来拆进程做准备。
- **形态 B**：执行层独立进程，通过 Event Bus 或 socket 与 Gateway 通信；Gateway 重启不影响执行层进程，任务与结果存储均在执行层，**推荐**用于「重启不打断任务」。

---

## 七、安全与审计

- **查询接口**：应校验调用方（如仅本机或仅已认证 Gateway）；避免未授权方按 correlationId 枚举拉取他人结果。
- **结果存储**：若持久化到 workspace，需与现有权限与 workspace 隔离一致；建议结果文件权限与 ops.log 等一致。
- **审计**：任务创建、完成、失败可写审计日志（correlationId、sessionId、status、duration），便于与现有审计串联。

---

## 八、小结

| 维度 | 约定 |
|------|------|
| **任务归属** | 任务在执行层创建与执行；Gateway 仅发布 request、订阅 response、维护连接与 correlationId 映射。 |
| **状态** | pending → running → completed/failed（及可选 cancelled/timeout）；结果写入存储并设过期。 |
| **查询** | 按 correlationId 查状态与结果；可选按 sessionId 列未取回任务。 |
| **断开与重连** | Gateway 断开后任务继续；重连后客户端可通过查询接口拉取未取回结果。 |
| **与 Event Bus** | request/response 经 Bus；执行层可发布 task.status；无 Bus 时可退化为本地转发。 |

本文档为详细设计，**不包含实施计划与工单**；实施时需再拆解为「执行层剥离、任务状态与存储、查询接口、Gateway 改造、过期与清理」等工单并排期。与「Event Bus 为中枢」「配置热重载」配合可最大程度减少重启对任务的影响，见 `EVENT_BUS_AS_HUB_DESIGN.md`、`CONFIG_HOT_RELOAD_DESIGN.md`。
