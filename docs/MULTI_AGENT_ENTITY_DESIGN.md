# 多 Agent 实体 — 详细设计

本文档为**下一阶段**「引入 Agent 实体容器」的详细设计：将 Agent 定义为**实体（Entity/Container）**，具备独立 FSM、BT 库、局部记忆与可选专属模型；Router 产出「目标 Agent + 可选 flowId」，由执行层实例化并派发任务。多 Agent 间通过 Event Bus 协作（流水线/异步/蜂群）见 `EVENT_BUS_COLLABORATION_DESIGN.md`。

**设计依据**：`docs/智能体相关`（Agent 为实体容器、FSM 在 Agent 内、BT 挂载在 FSM 下）、`docs/智能体设计总结与对接要点.md`（路径 B：多 Agent 实体、会话 FSM 与 Agent 内 FSM 关系）。**当前实现**：单入口、多 flow，无 Agent 实例层；本设计为后续「多 Agent 阶段」的规格。**本文档仅做设计**，不包含实施计划与工单。

---

## 一、目标与范围

### 1.1 设计目标

| 目标 | 说明 |
|------|------|
| **Agent 实体化** | Agent 不再是「一条 runAgentLoop 路径」，而是**可实例化的容器**：有唯一 id、蓝图（名称、角色、绑定 flow、可选模型与局部记忆配置）、运行时状态（FSM 状态、黑板、当前任务）。 |
| **路由到 Agent** | Router 除产出 `flowId + params` 外，可产出 **targetAgentId**（或蓝图名）；调度层先选 Agent（或默认 Agent），再在其 bound flows 中匹配或直接走该 Agent 的 runAgentLoop。 |
| **隔离与归属** | 每个 Agent 实例拥有**局部黑板**、**局部记忆/ RAG**（可选）、**专属 system 片段**；工具执行与审计可带 `agentId`，便于归属与隔离。 |
| **生命周期** | Agent 实例的创建、销毁、休眠与唤醒有显式模型；与 Event Bus 的订阅、任务派发、回调通知一致。 |

### 1.2 范围边界

| 在范围内 | 在范围外 |
|----------|----------|
| Agent 蓝图与实例的数据结构、生命周期、与 Router/Executor 的对接 | Event Bus 的物理部署与 Schema（见 EVENT_BUS_AS_HUB_DESIGN） |
| 单 Agent 内 FSM、BT 库、局部记忆的职责与配置 | 多 Agent 间流水线/蜂群的具体协议（见 EVENT_BUS_COLLABORATION_DESIGN） |
| 会话 FSM 与「当前接管 Agent」的关系 | 具体 FSM/BT 引擎实现细节（沿用 Phase 13） |

### 1.3 与当前实现的对应

- **当前**：Router 产出 `{ flowId, params } | null`；Executor 执行 flow 或 runAgentLoop；会话 FSM（Idle/Local_Intercept/Executing_Task/Deep_Reasoning）在 Gateway session 上。
- **目标**：Router 产出 `{ agentId?, flowId?, params }`；若存在 agentId，则**在对应 Agent 实例**上执行（在其 flow 库中执行 flow 或 runAgentLoop）；会话 FSM 可表示「当前由哪个 Agent 接管」或保留为「会话级宏观状态」，Agent 内 FSM 表示该 Agent 内部阶段（如等待指令/执行中/等待其他 Agent）。

---

## 二、Agent 蓝图（Blueprint）

### 2.1 定义

**蓝图**是 Agent 的静态定义，可持久化在配置或独立 JSON 中；运行时根据蓝图**实例化**出 Agent 实例。

```ts
interface AgentBlueprint {
  /** 唯一标识，如 code_reviewer、system_ops、general */
  id: string;
  /** 显示名，用于日志与 UI */
  name?: string;
  /** 角色 system 片段（覆盖或补充 config.roles 按 sessionType 的片段） */
  systemPrompt?: string;
  /** 该 Agent 可用的 flow 库：flowId 列表，或与全局 libraryPath 同库但仅允许匹配此列表 */
  boundFlowIds?: string[];
  /** 若为空则使用全局 flow 库且可匹配任意 route；若非空则 Router 仅在该列表内匹配 */
  /** 局部记忆：是否启用、storage 路径或 workspace 子路径、检索上限 */
  localMemory?: {
    enabled: boolean;
    /** 相对 workspace 或独立路径 */
    storagePath?: string;
    retrieveLimit?: number;
  };
  /** 可选：该 Agent 使用的 LLM（覆盖全局 llm）；不配置则用全局 */
  llm?: LlmConfig;
  /** 可选：该 Agent 绑定的 MCP/Skill 子集（名称列表）；不配置则用全局合并工具 */
  toolsFilter?: string[];
}
```

### 2.2 配置形态

- **方式 A**：在 `config.agents` 下配置蓝图列表，如 `agents: { blueprints: [ { id: "code_reviewer", name: "代码审查", boundFlowIds: ["review_pr"], ... } ] }`。
- **方式 B**：独立文件如 `workspace/.rzeclaw/agents/*.json`，每文件一个蓝图，启动时加载。
- 本设计**不强制**选型，仅约定「存在蓝图集合，且可由 id 查找」。

---

## 三、Agent 实例（Instance）

### 3.1 定义

**实例**是蓝图在运行时的具现：持有运行时状态，处理一次或多次请求。

```ts
interface AgentInstance {
  /** 实例 ID（UUID 或 蓝图id + 会话/任务 id，便于去重） */
  instanceId: string;
  /** 所属蓝图 id */
  blueprintId: string;
  /** 当前 FSM 状态（该 Agent 的宏观状态） */
  state: AgentInstanceState;
  /** 局部黑板：key-value，仅本实例可见 */
  blackboard: Record<string, string>;
  /** 当前关联的 sessionId（若由 chat 请求创建） */
  sessionId?: string;
  /** 创建时间、最后活动时间（可选，用于回收） */
  createdAt?: string;
  lastActiveAt?: string;
}

type AgentInstanceState =
  | "idle"           // 等待指令
  | "executing"     // 正在执行 flow 或 runAgentLoop
  | "waiting"       // 等待其他 Agent 或外部回调
  | "done";         // 本次任务结束，可回收或保留
```

### 3.2 生命周期

- **创建**：当 Router 产出 targetAgentId 且该 Agent 尚无可用实例（或策略要求新实例）时，由**调度层**根据蓝图创建实例，并订阅 Event Bus 上该实例关心的 topic（若有）。
- **执行**：调度层将 request（message、sessionId、params）派发给该实例；实例内执行「FSM 迁移 → 匹配 flow 则 executeFlow，否则 runAgentLoop」，使用该蓝图的 systemPrompt、boundFlowIds、localMemory、llm。
- **休眠/回收**：任务完成后实例状态置为 `done` 或 `idle`；可配置策略：空闲超过 N 分钟回收，或常驻若干实例池。回收时释放局部资源（如局部记忆连接），不删除持久化存储。

### 3.3 与「会话」的关系

- **选项 A**：一个会话（sessionId）在任意时刻最多由一个 Agent 实例「接管」；会话 FSM 的 Executing_Task 表示「某 Agent 实例正在执行」，Idle 表示无执行中。多轮对话可先后由不同 Agent 接管（Router 每轮可产出不同 agentId）。
- **选项 B**：一个会话固定绑定一个 Agent 实例（如「本会话为 code_reviewer」），直到会话结束。本设计**建议选项 A**，更灵活；实施时可配置。

---

## 四、FSM 与 BT 在 Agent 内的位置

### 4.1 Agent 内 FSM（宏观状态）

- **作用**：表示该 Agent 当前处于「空闲」「执行中」「等待其他 Agent/回调」等；用于多 Agent 协作时「主控派发任务后自身回到空闲」等逻辑。
- **与会话 FSM 的区别**：会话 FSM 在 Gateway/总控侧，表示「当前会话由谁接管、是否在执行」；Agent 内 FSM 表示「该 Agent 实例内部」的阶段。两者可同时存在：例如会话 FSM = Executing_Task，Agent 内 FSM = waiting（等待子任务回调）。

### 4.2 BT/flow 归属

- **方式 1**：flow 库仍为全局，`boundFlowIds` 仅做**白名单**：Router 匹配到的 flowId 必须在当前 Agent 的 boundFlowIds 内，否则视为不匹配、走 runAgentLoop 或交给默认 Agent。
- **方式 2**：每个 Agent 有独立 flow 库路径（如 `workspace/.rzeclaw/agents/code_reviewer/flows`），完全隔离。本设计**建议先采用方式 1**，实现简单且与现有流程库兼容；方式 2 可作为扩展。

### 4.3 工具与权限

- Agent 实例执行时使用的工具集 = 全局 getMergedTools 经 `toolsFilter` 过滤（若配置）；否则用全局。审计与 ops.log 建议带 `agentId`/`blueprintId`，便于归属。

---

## 五、Router 与调度层

### 5.1 Router 输出扩展

- 当前：`matchFlow(message, context) → { flowId, params } | null`。
- 扩展：`route(message, context) → { agentId?, flowId?, params }`。
  - 若配置了 `config.agents.blueprints` 且存在按意图到 agent 的映射，可先选 agentId，再在该 Agent 的 boundFlowIds 内做 flow 匹配。
  - 若未配置多 Agent，则 agentId 为空，行为与现有一致（全局 flow 库 + 默认执行路径）。

### 5.2 调度层职责

- 根据 `agentId` 获取或创建 Agent 实例。
- 将 request（message、sessionId、params、flowId）派发给该实例；实例内部执行 FSM 更新、flow 或 runAgentLoop。
- 将实例执行结果（content、citedMemoryIds 等）汇总为 ChatResponseEvent 发布回总线（在 Event Bus 架构下）或直接回传 Gateway（在未引入总线前）。

### 5.3 默认 Agent

- 当 Router 未匹配到任何 flow 且未指定 agentId 时，使用**默认 Agent**：可为配置中的 `agents.defaultAgentId`，或隐式的「全局 runAgentLoop」单例。这样与当前「不匹配则 runAgentLoop」一致，兼容现有行为。

---

## 六、局部记忆与黑板

### 6.1 局部记忆

- **用途**：该 Agent 的对话与事实仅写入其局部存储，检索时仅查该 Agent 的存储，避免跨 Agent 污染。
- **实现要点**：localMemory.storagePath 指向 workspace 下子目录或独立路径；flushToL1 / retrieve 时带 `agentId` 或使用该路径；L2 提升可限定在同一 Agent 内或可选共享（配置决定）。
- **与全局记忆并存**：可配置为「仅局部」或「局部 + 全局只读」，本设计不强制，留实施时选型。

### 6.2 局部黑板

- 每个 Agent 实例已有 `blackboard: Record<string, string>`；flow 执行与 runAgentLoop 使用同一黑板，与现有 session.blackboard 语义一致；多 Agent 协作时，可将中间结果经 Event Bus 写入「目标 Agent 的黑板」或共享黑板（见 EVENT_BUS_COLLABORATION_DESIGN）。

---

## 七、与现有组件的对接

### 7.1 Gateway / Event Bus

- chat.request 中可带 `targetAgentId`（可选）；若总线已引入，执行层根据 targetAgentId 或 Router 结果选择 Agent 实例并派发。
- 会话列表、快照恢复、sessionType 等仍可由 Gateway 或总控维护；执行层仅关心「当前请求由哪个 Agent 实例处理」。

### 7.2 流程库与 Phase 13

- executeFlow、applyEditOps、getFlowLibrary 等不变；仅调用时传入「当前 Agent 的 boundFlowIds 或 libraryPath」以限定范围（若采用方式 1，则 libraryPath 仍全局，仅匹配时过滤 boundFlowIds）。

### 7.3 术语统一

- **Agent 路径**：现有文档中「走 runAgentLoop 的那条路径」。
- **Agent 实体/实例**：本设计中的容器，含 FSM、BT、局部记忆、实例状态。引入多 Agent 后，建议在术语表中明确二者，避免混淆。

---

## 八、安全与审计

- 所有工具调用与 flow 执行建议带 `agentId`/`blueprintId` 写入 ops.log / audit，便于「谁执行了哪条命令」的追溯。
- 局部记忆的存储路径应受 workspace 或配置约束，禁止越界。
- 蓝图中的 llm、toolsFilter 需在加载时校验，避免配置错误导致越权。

---

## 九、小结

| 维度 | 约定 |
|------|------|
| **蓝图** | id、name、systemPrompt、boundFlowIds、localMemory、可选 llm/toolsFilter；可配置或文件加载。 |
| **实例** | instanceId、blueprintId、state、blackboard、sessionId；创建→执行→休眠/回收。 |
| **Router** | 产出 agentId?、flowId?、params；调度层按 agentId 解析实例并派发。 |
| **FSM** | 会话 FSM 表示「谁接管」；Agent 内 FSM 表示该实例内部状态（idle/executing/waiting/done）。 |
| **flow 归属** | 建议先全局库 + boundFlowIds 白名单；可选每 Agent 独立库路径。 |
| **局部记忆/黑板** | 每实例独立黑板；局部记忆可选，存储与检索隔离。 |

本文档为详细设计，**不包含实施计划与工单**；实施时需再拆解为「蓝图配置与加载、实例生命周期、Router 扩展、调度层、局部记忆与黑板」等工单并排期。多 Agent 协作模式见 `EVENT_BUS_COLLABORATION_DESIGN.md`。
