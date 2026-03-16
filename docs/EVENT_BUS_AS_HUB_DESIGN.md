# Event Bus 为中枢、Gateway 降为节点 — 详细设计

本文档为**下一阶段**架构演进的核心设计：将 **Event Bus（事件总线）** 作为系统神经中枢，**Gateway 降级为总线上的一个接入节点**，实现「总线中心化、I/O 边缘化」，使配置变更或 Gateway 重启不中断底层任务与 Agent 运行。

**设计依据**：`docs/智能体相关`（架构蓝图：神经中枢与感官节点）、`docs/智能体设计总结与对接要点.md`（Event Bus 与 Gateway 关系、渐进演进）。**当前实现**：无 Event Bus，Gateway 直接调用 Router/Executor/runAgentLoop；本设计为后续引入显式 Event Bus 与统一 Event Schema 的详细规格。**本文档仅做设计**，不包含实施计划与工单拆解。

---

## 一、目标与范围

### 1.1 设计目标

| 目标 | 说明 |
|------|------|
| **中枢转移** | Event Bus 成为唯一「消息脊髓」：所有用户意图、任务请求、执行结果均经总线流转；Gateway 仅负责协议翻译与鉴权，向总线发布/订阅，不再承载路由与执行逻辑。 |
| **Gateway 可独立重启** | 升级或配置变更 Gateway 时，重启 Gateway 进程不影响 Event Bus 与执行层；进行中的任务在 Worker/Executor 侧继续运行，本地直连终端与 Agent 蜂群不受影响。 |
| **多端统一入口** | 本地 CLI/终端与远程 Gateway（如 Telegram/Web）均以同一 Event Schema 向总线发布消息；执行层不区分来源，实现本地零延迟、远程同协议。 |
| **可观测与监控** | 总线上的事件流可被统一监听与记录，便于监控大屏、审计与复盘，且不依赖 Gateway 进程存活。 |

### 1.2 范围边界

| 在范围内 | 在范围外 |
|----------|----------|
| Event Bus 的职责定义、部署形态、Event Schema、订阅/发布契约 | 具体消息中间件选型（Redis/MQTT/内存队列）的实现细节，留工单阶段定 |
| Gateway 作为「发布者+结果订阅者」的接口与行为 | Gateway 内部现有 chat 逻辑的逐行迁移步骤 |
| 执行层（Router/Executor/runAgentLoop）与总线的对接方式 | 多 Agent 实体、流水线/蜂群协作（见 EVENT_BUS_COLLABORATION_DESIGN.md） |
| 配置热重载与任务解耦与本设计的衔接点 | 配置热重载、任务解耦的完整设计（见各自设计文档） |

### 1.3 与现有架构的关系

- **现状**：`Gateway.chat` 收消息 → 内存 session → Router 匹配 → 匹配则 `executeFlow`，否则 `runAgentLoop`；全部在同一进程内完成，配置在进程启动时加载一次。
- **目标**：用户消息无论来自本地终端还是 Gateway，先**发布到 Event Bus**；**执行层**（独立进程或同一进程内独立模块）**订阅**总线上的 chat 事件，执行 Router/Executor/runAgentLoop，将结果**发布回总线**；Gateway 与本地终端仅订阅「自己发出的请求」的响应，再通过 WS/stdio 回传给用户。
- **演进原则**：可渐进迁移——先在同一进程内引入「逻辑总线」（内存 Pub/Sub），Gateway 的 chat 入口改为「发布 → 等待订阅者消费并发布结果 → 订阅到结果后回复」；再视需要将总线与执行层拆为独立进程或引入 Redis/MQTT。

---

## 二、Event Bus 的职责与形态

### 2.1 职责（仅做「脊髓」）

- **接收**：任何节点发布的、符合 Event Schema 的 JSON 消息。
- **路由**：按 **topic**（或等价概念）将消息投递给已订阅该 topic 的节点；不解析 payload 业务内容、不做鉴权（鉴权在发布前由 Gateway 等节点完成）。
- **不负责**：不执行 Router/Executor/runAgentLoop、不存储会话状态、不加载配置；仅做消息的接收与按 topic 分发。

### 2.2 部署形态（选型留工单阶段）

- **形态 A — 进程内内存总线**：单进程内维护 topic → 订阅者回调 Map；发布时同步或异步调用订阅者。实现简单，Gateway 与执行层仍可在同一进程，但「Gateway 重启」仍会拉掉整个进程，仅适合作为第一步或开发态。
- **形态 B — 独立进程 + 内存/本地 socket**：独立「Bus 进程」监听本地 socket 或 Unix domain socket，各节点通过 socket 连接发布/订阅；Gateway 与 Executor 为不同进程，重启 Gateway 不影响 Bus 与 Executor。
- **形态 C — 外部中间件**：Redis Streams / Pub-Sub、MQTT（如 Mosquitto）等；多节点、多机可扩展，需额外部署与运维。

本设计**约定**：Event Bus 必须支持 **topic 订阅** 与 **请求-响应关联**（如 `correlationId` 或 `replyTo`），以便「谁发谁收」；具体选型在实施阶段确定。

### 2.3 Topic 设计建议

| Topic | 方向 | 说明 |
|-------|------|------|
| `chat.request` | 接入层 → Bus | 用户消息请求：含 source、message、sessionId、correlationId 等 |
| `chat.response` | Bus → 接入层 | 执行层完成后的回复：含 correlationId、content、citedMemoryIds 等 |
| `chat.stream` | Bus → 接入层 | 流式输出 chunk（可选），与 chat.response 二选一或并存 |
| `task.status` | 执行层 → Bus | 长任务进度/状态（可选），供监控与「任务与 Gateway 解耦」使用 |

其他 topic（如 `heartbeat.tick`、`proactive.suggest`）可后续按需扩展；本阶段最小集为 `chat.request` / `chat.response`（及可选 `chat.stream`）。

---

## 三、Event Schema（世界语）

所有经总线流转的 payload 必须符合统一结构，便于接入层与执行层解耦。

### 3.1 chat.request（用户请求事件）

```ts
interface ChatRequestEvent {
  /** 唯一关联 ID，用于匹配 response */
  correlationId: string;
  /** 来源节点标识：local_ui | gateway_ws | gateway_telegram | … */
  source: string;
  /** 用户原始消息 */
  message: string;
  /** 会话 ID，默认 "main" */
  sessionId?: string;
  /** 会话类型：dev | knowledge | pm | swarm_manager | general */
  sessionType?: string;
  /** 覆盖 workspace（可选） */
  workspace?: string;
  /** 蜂群团队 ID（可选） */
  teamId?: string;
  /** 隐私模式：true 时不写 L1、不持久化快照 */
  privacy?: boolean;
  /** 扩展字段，预留 */
  meta?: Record<string, unknown>;
}
```

### 3.2 chat.response（执行层回复事件）

```ts
interface ChatResponseEvent {
  /** 与 request 的 correlationId 一致 */
  correlationId: string;
  /** 成功时正文 */
  content?: string;
  /** 失败或需确认时的错误信息 */
  error?: string;
  /** 引用的记忆 ID（memory 启用时） */
  citedMemoryIds?: string[];
  /** 是否建议进化（evolution.insertTree） */
  evolutionSuggestion?: boolean;
  /** 若为 flow 执行，可带 generatedFlowId / suggestedRoute 等 */
  [key: string]: unknown;
}
```

### 3.3 chat.stream（可选，流式 chunk）

```ts
interface ChatStreamEvent {
  correlationId: string;
  chunk: string;
}
```

- 执行层在 runAgentLoop 流式输出时，可对同一 correlationId 多次发布 `chat.stream`，最后再发布一次 `chat.response` 表示结束。

### 3.4 通用约束

- 所有事件建议带 `ts`（ISO 时间戳）便于审计与监控。
- `correlationId` 由**发布 request 的节点**生成（如 UUID），执行层原样带回 response，订阅者据此匹配自己的请求。

---

## 四、Gateway 降为节点后的行为

### 4.1 角色定义

- **发布者**：收到用户消息（WS/HTTP/Telegram 等）并完成鉴权后，将消息**翻译为 ChatRequestEvent**，发布到 `chat.request` topic。
- **订阅者**：订阅 `chat.response`（及可选 `chat.stream`），仅处理 `correlationId` 属于本连接/本会话的响应，再通过 WS/HTTP/Telegram 回传给用户。
- **不再承担**：不执行 Router、不调用 executeFlow、不调用 runAgentLoop；不持有 session 的「当前消息列表」以外的执行状态（会话列表、快照恢复等可仍由 Gateway 提供，但「谁在执行」改为执行层 + 总线）。

### 4.2 接口契约（Gateway 侧）

- **输入**：来自外部的用户消息 + sessionId + 可选 sessionType/workspace/teamId/privacy。
- **输出**：向总线发布一条 `ChatRequestEvent`，并在本地记录 `correlationId → 连接/会话` 的映射；在收到对应 `ChatResponseEvent`（及可选 stream）后，向用户连接推送结果并清理映射。
- **超时与失败**：若在可配置时间内未收到 response，可向用户返回「请求超时」；Gateway 重启时丢弃未完成的 correlationId 映射，由客户端重试或用户感知中断（执行层任务可继续，见「任务与 Gateway 解耦」设计）。

### 4.3 会话与快照

- **选项 A**：会话与快照仍由 Gateway 维护（当前实现）；执行层从 request 中读取 sessionId/sessionType，必要时通过「总线上的 session 查询」或「执行层直接读 workspace 快照」获取历史消息；回复时执行层不写快照，由 Gateway 在收到 response 后写快照。
- **选项 B**：会话与快照迁移到执行层或独立服务；Gateway 仅做透传。本阶段设计**不强制**选项 B，可在实施时选 A 以最小改动落地。

---

## 五、执行层与总线的对接

### 5.1 执行层职责

- **订阅** `chat.request`。
- 对每条 request：按现有逻辑执行 **Router → 匹配则 Executor（executeFlow），否则 runAgentLoop**；执行过程中可发布 `task.status`（可选）。
- 执行完成后，发布 **chat.response**（及此前可选的 chat.stream chunks）到总线，payload 中带同一 `correlationId`。

### 5.2 执行层形态

- **与 Bus 同进程**：执行层作为 Bus 的订阅者回调，在 Bus 进程内运行；Gateway 为另一进程时，重启 Gateway 不影响执行。配置热重载可只重载「执行层」使用的 config，而不重启 Bus。
- **独立 Worker 进程**：执行层单独进程，通过 socket/Redis 等订阅 request、发布 response；Bus 若为独立进程则只做中转；Gateway 再单独。这样 Gateway / Bus / Worker 三者均可独立重启与扩缩。

### 5.3 配置与 workspace

- 执行层需能加载 config、解析 workspace；可从环境变量或配置文件读取，或由 Bus 在 request 中携带 workspace 等（本设计建议执行层自行 loadConfig，request 中的 workspace 仅作覆盖）。
- 若引入配置热重载，执行层可定期或按信号重新 loadConfig，而不依赖 Gateway。

---

## 六、本地直连终端

- 与 Gateway 对称：终端将用户输入封装为 **ChatRequestEvent**（source 如 `local_ui`），发布到 `chat.request`；订阅 `chat.response`（及 stream），将结果展示给用户。
- 不经过 Gateway，延迟最低；Gateway 宕机或重启时，本地终端与 Event Bus、执行层的通信不受影响。

---

## 七、安全与审计

- **鉴权**：在**发布前**由 Gateway 完成（如 apiKey、会话身份）；Event Bus 不解析 body 做鉴权，仅按 topic 投递。若 Bus 为独立进程且暴露 socket，需通过「仅本机可连」或独立 ACL 保证只有合法节点可发布/订阅。
- **审计**：执行层在执行 flow/runAgentLoop 时照常写 ops.log、audit、appendOpLog；可选地，Bus 或执行层将「request/response 的 ts、correlationId、source」写入统一审计日志，便于与现有审计串联。

---

## 八、与相关设计的衔接

- **多 Agent 实体**：引入后，执行层可能由「单一路由+Executor」变为「按 Agent 分发」；Event Bus 仍为中枢，request 中可增加 `targetAgentId` 等字段，由执行层内部分发。见 `MULTI_AGENT_ENTITY_DESIGN.md`。
- **流水线/蜂群协作**：多 Agent 间通过总线传递中间结果时，可复用同一 Event Schema 或扩展 topic（如 `agent.result`）。见 `EVENT_BUS_COLLABORATION_DESIGN.md`。
- **配置热重载**：执行层独立于 Gateway 后，重载配置不再依赖 Gateway 重启；见 `CONFIG_HOT_RELOAD_DESIGN.md`。
- **任务与 Gateway 解耦**：长任务在执行层运行，结果经 Bus 回传；Gateway 重启后可通过「任务状态查询」或 Bus 上的 task.status 让用户继续获取结果。见 `TASK_GATEWAY_DECOUPLING_DESIGN.md`。

---

## 九、小结

| 维度 | 约定 |
|------|------|
| **Event Bus** | 仅做消息接收与按 topic 分发；不执行业务逻辑；支持 chat.request / chat.response（及可选 chat.stream、task.status）。 |
| **Event Schema** | correlationId 关联请求-响应；source、message、sessionId、sessionType 等统一；扩展用 meta。 |
| **Gateway** | 仅做协议翻译与鉴权，发布 request、订阅 response；不承载 Router/Executor/runAgentLoop。 |
| **执行层** | 订阅 request，执行现有路由与执行逻辑，发布 response；可与 Bus 同进程或独立进程。 |
| **本地终端** | 与 Gateway 对称，直接与 Bus 发布/订阅，不经过 Gateway。 |

本文档为详细设计，**不包含实施计划与工单**；实施时需再拆解为「总线选型、Schema 固化、Gateway 改造、执行层对接、本地终端对接」等工单并排期。
