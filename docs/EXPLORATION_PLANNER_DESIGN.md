# 探索层（Exploration Layer）与预案 Planner — 详细设计

本文档基于 **`docs/探索预案Planner相关讨论`** 的讨论结论，将「假定/探索层」形式化为可落地的架构设计：在动机层之后、具体 Agent 派发之前插入**可选的高阶规划中间件**，通过 **Planner（生成者）** 与 **Critic（评估者）** 实现「先发散预案、再收敛择优、最后降维下发」，并结合**先验扫描（Affordance-Aware Planning）** 将解空间收敛到系统当前能力与上下文的可行子集。本文档与 Event Bus 中枢、多 Agent 实体、行为树/状态机、动机 RAG、内源/外源 RAG 等既有设计对齐，**仅做设计**，不包含实施工单。

---

## 一、设计依据与目标

### 1.1 讨论来源与结论摘要

| 议题 | 结论 |
|------|------|
| **是否要探索层** | 极度必要，但**不能全局启用**；必须**严格条件触发**，避免简单请求的 Token 与延迟浪费。 |
| **探索层定位** | 动机 RAG 之后、具体 Agent 派发之前；作为「挂载在 Event Bus 上的高级中间件」。 |
| **形态** | 双轨制：分流守门员（Gatekeeper） + 探索层内双影子 Agent（Planner + Critic）。 |
| **核心机制** | 干跑（Dry Run）：预案发散 → 预案评分与淘汰 → 降维下发为 Event Bus 指令。 |
| **先验收敛** | 在生成预案前，先扫描 FSM、黑板记忆、内源 RAG、MCP/技能注册表，将可探索范围收敛到「已有节点与上下文」内，再细化预案；可选输出 `Plan_Fallback: Request_New_Skill` 驱动后续技能补全。 |

### 1.2 设计目标

| 目标 | 说明 |
|------|------|
| **提升复杂/开放任务质量** | 对高开放性、高容错成本的任务（如「设计一套新机制」「重构某系统」），先在脑内推演多种方案并择优，再执行，显著降低废代码与错误路径。 |
| **不拖垮快速路径** | 明确意图（如命中 `Skill_Git_Commit`）或简单查询类请求**直接跳过**探索层，保持「动机层 → 行为树/Agent」的极速链路。 |
| **消除幻觉执行** | 通过先验扫描与约束注入，确保预案中的每一步动作均在当前技能库与上下文中**可执行**，杜绝「调用不存在工具」的幽灵调用。 |
| **可配置与可插拔** | 通过「触发探索层的复杂度/不确定性阈值」等配置项，可在「哲学家模式」与「行动派模式」间切换，便于成本与质量权衡。 |
| **探索经验积累与复用** | 将探索预案与执行结果纳入**探索经验**存储与**复盘机制**：相似任务优先复用历史预案，避免重复推演；仅当无匹配或为新任务时再执行完整探索，从而节约 Token、提升任务效率，并随使用越用越准。 |

### 1.3 范围边界

| 在范围内 | 在范围外 |
|----------|----------|
| 探索层的触发条件（Gatekeeper）、与动机层/Event Bus/执行层的衔接 | Event Bus 物理选型、Gateway 协议细节（见 EVENT_BUS_AS_HUB_DESIGN） |
| Planner 与 Critic 的职责、输入输出、调用约束（只读 RAG、不写文件） | 具体 LLM 选型与 Prompt 工程迭代（留实施阶段） |
| 先验扫描：FSM/黑板、内源 RAG、MCP 注册表、约束注入与预案 JSON 格式 | 内源 RAG 与 MCP 的实现细节（沿用现有设计） |
| 预案评分公式、降维为 Event 的编译规则、Plan_Fallback 语义 | 多 Agent 协作协议细节（见 EVENT_BUS_COLLABORATION_DESIGN） |
| **探索经验**的存储形态（内源 RAG 集合或独立存储）、复用条件、执行结果回写；**复盘**对探索经验的修剪/合并与统计 | 复盘机制的整体触发与早报流程（见 RAG与复盘机制详细设计） |

### 1.4 与现有架构的关系

- **动机层**：已负责「用户动机 → 标准事件/意图」的转化；探索层接收的是**动机层输出**（或等价的意图 + 原始 message），并在此基础上做「多预案生成与择优」。
- **Event Bus**：探索层作为**订阅 `chat.request`（或专用 topic）的中间件**：满足触发条件时先走探索层，探索层将「最优预案」编译为一条或一组 Event（与现有 ChatRequestEvent / 协作事件兼容），再发布到总线，由执行层消费；不满足触发条件时，request 直接由执行层消费，与现有一致。
- **执行层**：Router/Executor/runAgentLoop 不变；执行层**不感知**是否经过探索层，仅按收到的 Event 按部就班执行。
- **现有 planning**：`isComplexRequest` 与 `fetchPlanSteps`（`src/agent/planning.ts`）可视为探索层的**前身**；本设计将「复杂请求先规划再执行」扩展为「先验扫描 + 多预案 + Critic 打分 + 编译为 Event」，并明确**仅在满足 Gatekeeper 条件时**进入探索层。

---

## 二、必要性评估（严格条件触发）

### 2.1 为何极其必要

- **高开放性任务**：例如「设计一套弱化传统 HP、基于装甲改造的卡牌反击结算机制」。若直接拿第一个点子调底层工具写代码，极易产生废代码与反复返工。探索层在**不执行任何写操作**的前提下，先生成 3～5 个预案，由 Critic 评估成功率、成本与风险，选出最平衡的方案再下发，可显著提升产出质量。
- **高容错成本**：一旦执行即改文件、调 API、动生产环境的任务，适合「先脑内推演、再动手」。

### 2.2 为何不能全局启用

- 探索层本质是**用海量 Token 换取逻辑深度**。若用户说「帮我查一下昨天战斗结算的报错日志」，仍走「生成三个预案（grep / Python 读 / 全盘搜索）再择优」，会造成不必要的延迟与成本。
- 因此：**只有**在「任务复杂度/不确定性」或「历史失败率」超过阈值时，才将请求路由进探索层；否则直通执行层。

### 2.3 触发条件（Gatekeeper）设计

**分流守门员**在动机层解析完用户意图之后、执行层消费 request 之前生效（可在同一消费管道内实现，或通过 topic 分流）。

建议的触发维度（可配置，满足任一即**可**进入探索层；具体是否进入还可受「探索层开关」总开关约束）：

| 维度 | 说明 | 配置示例 |
|------|------|----------|
| **意图开放性** | 动机层或 Router 产出「开放性意图」标签（如 `open_ended`、`design`、`refactor`）；或未命中任何 flow、且非简单 QA。 | `exploration.trigger.openIntents: ["design", "refactor"]` |
| **消息复杂度** | 复用或扩展 `isComplexRequest`：长度、关键词（如「先/再/然后/步骤/分步/多个文件」等）。 | `exploration.trigger.complexThresholdChars: 80`，或沿用 `planning.complexThresholdChars` |
| **不确定性得分** | 可选：对意图做轻量模型/规则打分，高于阈值则进入探索层。 | `exploration.trigger.uncertaintyThreshold: 0.7` |
| **历史失败率** | 某类任务（如按 task_hint 或 flowId 聚合）近期失败率高于阈值时，强制下一笔同类型请求先进探索层。 | `exploration.trigger.failureRateThreshold: 0.5` |

**负向条件**（满足则**不**进入探索层）：

- 已命中明确 flow（如 `Skill_Git_Commit`）：直接执行 flow，不探索。
- 总开关关闭：`exploration.enabled: false`。
- 会话/用户级禁用（可选）：如 `meta.explorationOptOut: true`。

---

## 三、探索层的构建形态：双轨制与双 Agent

### 3.1 在链路中的位置

```
用户输入
  → 动机层（动机 RAG / 意图解析）
  → [Gatekeeper] 任务复杂度/不确定性/失败率判断
       ├─ 不满足 → 直接下发 Event Bus（与现有一致）
       └─ 满足   → 探索层
                    → [探索经验检索] 查询内源「探索经验」集合（§十二）
                    → 若命中且置信度 ≥ reuseThreshold 且（可选）快照兼容
                         → 复用历史最优预案，跳过 Planner+Critic
                    → 否则
                         → 先验扫描（§四）
                         → Planner：生成 3～5 个预案（只读 RAG，不写文件）
                         → Critic：评分与淘汰，选出最优预案
                         → [探索经验写入] 将本次任务签名 + 最优预案写入探索经验（供后续复用）
                    → 编译最优预案为 Event Bus 指令并发布（带 explorationRecordId 以便结果回写）
  → 执行层订阅并执行（Router/Executor/runAgentLoop）
  → [执行完成后] 可选：按 correlationId/explorationRecordId 回写执行结果（成功/失败、Token、耗时）到探索经验条目
```

探索层是**可选的高阶状态流**：仅在 Gatekeeper 放行时进入。进入后**优先检索探索经验**：若有高置信度匹配则直接复用历史预案并编译下发，**不调用 Planner/Critic**；若无匹配或为新任务，则执行「扫描 → 生成 → 评估 → 编译」全流程，并将本次结果**写入探索经验**供日后复用。执行层完成后可回写执行结果，供复盘与经验质量统计。

### 3.2 双 Agent 角色

| 角色 | 职责 | 约束 |
|------|------|------|
| **Planner（生成者）** | 在给定「约束包」（当前 FSM、黑板、可用技能/MCP 列表）下，脑暴 3～5 条发散性路径；输出标准化的**预案 JSON**（步骤、拟调用的 Agent/节点、参数）。 | **仅可调用只读外源 RAG**（知识库）；**禁止**调用会改变本地文件的工具（如写代码、执行编译）；禁止虚构不存在的工具或节点。 |
| **Critic（评估者）** | 对预案做交叉审查：逻辑模拟（Mental Sandbox）、预估成功率与成本/风险，按统一公式打分；淘汰高风险与低效方案，选出最高分预案。 | 仅消费 Planner 输出的预案与系统提供的上下文；不执行任何真实工具调用。 |

两者均为「影子 Agent」：只做推理与文本/结构化输出，不直接改系统状态；真实执行由执行层在收到编译后的 Event 之后完成。

---

## 四、先验扫描（Affordance-Aware / Grounded Planning）

### 4.1 目的与形式化

**目的**：将大模型的解空间从「无限可能」收敛到**当前系统能力与上下文下的可行子集**，避免预案中出现系统无法执行的动作（如调用不存在的 `3D_Model_Generator`）。

设：

- \( P_{\infty} \)：大模型所有可能计划组成的集合；
- \( S \)：当前系统上下文（黑板记忆、FSM 状态等）；
- \( A \)：当前已注册的可用技能库（BT 节点、MCP 工具、flowId 等）。

探索层生成的有效预案集合 \( P_{\text{feasible}} \) 满足：

\[
P_{\text{feasible}} = \big\{\, p \in P_{\infty} \;\big|\; \text{actions}(p) \subseteq A \;\wedge\; \text{preconditions}(p) \subseteq S \,\big\}
\]

即：预案中的**每一步动作**必须在 \( A \) 中，**前提条件**必须在当前上下文 \( S \) 中可满足。

### 4.2 先遣侦察工作流（三步）

在 Planner 被调用、生成任何预案**之前**，系统先做一次**内部数据快照**，再注入到 Planner 的输入中。

#### 步骤 1：扫描当前 FSM 与黑板记忆（「我在哪」）

| 动作 | 目的 |
|------|------|
| 抓取当前 Gateway/会话的活跃状态（如 `GameMaker_IDE_环境` / `闲聊环境` / 会话 FSM 状态）。 | 约束预案的**环境前提**：例如用户正在用手机 Telegram 发消息时，不应提出「操作鼠标打开 IDE」的预案。 |
| 提取全局/会话黑板上的短期上下文（如「过去 5 轮提到卡牌数值设计」）。 | 供 Planner 生成与当前对话一致的步骤与参数。 |

输出：`SnapshotContext.fsm`、`SnapshotContext.blackboard`（或等价结构）。

#### 步骤 2：扫描内源 RAG 与 MCP 工具注册表（「我能干啥」）

| 动作 | 目的 |
|------|------|
| 查询内源 RAG（技能库）与已接入的 MCP 服务器列表。 | 得到当前可用的「积木」集合 \( A \)（如 `Skill_读写代码`、`Skill_数学计算`、`Skill_Git提交` 等）。 |
| **优化**：若技能/工具数量很大，用**动机层传过来的关键词**在内源 RAG 做轻量检索，只取最相关的 **K 个**（如 10 个）节点/工具，减少 Token 并聚焦。 | 平衡表达力与 Prompt 长度。 |

输出：`SnapshotContext.availableActions`（或 `skills` / `mcpTools` 分列），以及可选的 `relevantDescriptions`（简短描述，供 Planner 理解能力边界）。

#### 步骤 3：约束注入与预案生成（「戴着镣铐跳舞」）

将步骤 1、2 的**快照**打包进 Planner 的 **System Prompt**（或等价的上文），明确：

- 当前上下文：`[黑板数据快照]`、当前 FSM/环境；
- **仅允许**调用的系统节点与工具：`[提取出的 K 个相关 Skill + MCP 列表]`；
- **严禁**虚构不存在的工具或节点；
- 若发现无论如何组合现有节点都无法完成任务，可输出特殊预案：`Plan_Fallback: Request_New_Skill`，并简要说明缺失能力。

这样 Planner 的生成空间被限制在 \( P_{\text{feasible}} \) 内，Critic 可专注评估「哪个方案更优」而非「能不能执行」。

### 4.3 Plan_Fallback: Request_New_Skill 的语义

当 Planner 判断「现有技能组合无法满足任务」时，可输出一条** fallback 预案**：

- **类型**：`Plan_Fallback`；
- **子类型**：`Request_New_Skill`；
- **内容**：简短描述缺失的能力或节点。

系统侧行为建议：

- 探索层识别到该预案后，**不**将其编译为普通执行 Event，而是：
  - 可选 A：将「请求新技能」作为结构化结果返回（如写入黑板或发布到「技能请求」topic），由后续**架构师 Agent** 或夜间复盘流程消费，针对性开发新技能节点；
  - 可选 B：同时返回用户可读说明（「当前系统缺少 X 能力，已记录需求」），并结束本次探索，不执行任何写操作。

---

## 五、核心运作机制：干跑（Dry Run）三阶段

### 5.1 第一阶段：预案发散（Plan Generation）

- **输入**：动机层输出（意图 + 原始 message）+ 先验扫描快照（FSM、黑板、可用技能/MCP 列表）。
- **执行**：Planner 仅使用**只读**外源 RAG（如需领域知识）；**不**调用任何会改变本地文件的工具。
- **输出**：3～5 个**标准化预案 JSON**（格式见 §七），每个预案包含：设想步骤、预计调用的 Agent/节点、所需参数。

### 5.2 第二阶段：预案评分与淘汰（Simulation & Critique）

- **输入**：Planner 输出的预案列表 + 同一份快照与任务描述。
- **执行**：Critic 对每个预案进行：
  - **逻辑模拟（Mental Sandbox）**：假定执行该预案，预测可能遇到的 API 阻碍、逻辑死锁、与环境/黑板不一致之处；
  - **打分**：使用统一公式（见下）计算综合效用；
  - **排序与筛选**：淘汰高风险、低效方案，选出**最高分**的一个预案。
- **评分公式**（可配置权重）：

\[
\text{Score}(P) = w_1 \cdot E(\text{success}) - w_2 \cdot \text{Cost}(\text{tokens}, \text{time}) - w_3 \cdot \text{Risk}(\text{system})
\]

- \( E(\text{success}) \)：预估成功率（0～1）；
- \( \text{Cost} \)：预计资源消耗（Token、时间、外部 API 调用等），可归一化；
- \( \text{Risk}(\text{system}) \)：对本地环境/数据的破坏风险（0～1）。

输出：**单个最优预案**（或 Plan_Fallback 标识 + 说明）。

### 5.3 第三阶段：降维下发（Compilation to Event）

- **输入**：Critic 选出的最优预案（或 Fallback 结果）。
- **执行**：将预案**编译**为一条或一组符合 Event Bus Schema 的指令（如 `chat.request` 的扩展 payload，或 `pipeline.stage_done` / `delegate.request` 等协作事件），保持 `correlationId` 与原有 request 一致。
- **发布**：将编译结果发布到 Event Bus；执行层（Router/Executor/runAgentLoop）按现有逻辑消费，**不感知**这些指令来自探索层，按部就班执行行为树或 Agent 循环。

---

## 六、与 Event Bus、执行层的衔接

### 6.1 订阅与发布

- **探索层**作为 Event Bus 的**订阅者**：订阅 `chat.request`（或专用 topic，如 `chat.request.exploration`，由 Bus 或 Gatekeeper 按条件路由）。
- 满足 Gatekeeper 时：**消费**该 request，执行「先验扫描 → Planner → Critic → 编译」，然后**发布**：
  - 一条（或一组）与现有 **Event Schema** 兼容的「执行指令」到相应 topic（如仍用 `chat.request` 的某种内部 channel，或 `task.plan_ready` 再由执行层订阅并转为对 runAgentLoop 的调用），并保证 **correlationId** 与原始 request 一致，以便最终 **chat.response** 能正确回传用户。
- 不满足 Gatekeeper 时：不消费或透传，由执行层直接消费原始 `chat.request`。

具体 topic 命名与是「探索层先消费再转发」还是「Bus 按条件双路投递」可在实现时选定，本设计仅约定：探索层输出必须**编译为 Event**，且执行层**只看到 Event**，不区分是否经过探索层。

### 6.2 执行层纯粹性

- 执行层（Router、Executor、runAgentLoop）**不感知**探索层；只负责把收到的 Event 对应的「动作」做好。
- 行为树与 Agent 的编写保持「傻瓜式」：不需要承担宏观规划压力，仅接收已选好的预案编译结果并执行。

### 6.3 可插拔与配置

- 通过配置可**关闭**探索层（`exploration.enabled: false`）或**调高**触发阈值（如仅对极长、极开放请求启用），系统即从「哲学家模式」退回「行动派模式」，无需改执行层代码。

---

## 七、预案 JSON 与 Critic 评分结构

### 7.1 预案 JSON 格式（Planner 输出）

建议每个预案为结构化 JSON，便于 Critic 解析与编译器编译。单条预案示例：

```ts
interface PlanStep {
  /** 步骤序号 */
  step: number;
  /** 拟调用的节点/工具 ID（必须在先验扫描的 availableActions 中） */
  actionId: string;
  /** 可选：Agent/flow 标识 */
  agentId?: string;
  /** 该步骤的输入参数 */
  params?: Record<string, string>;
  /** 简短说明（可选） */
  description?: string;
}

interface PlanVariant {
  /** 预案唯一 ID（Planner 生成） */
  planId: string;
  /** 简短标题 */
  title?: string;
  /** 步骤序列 */
  steps: PlanStep[];
  /** 可选：预估前提条件或依赖 */
  preconditions?: string[];
}
```

Planner 输出：`PlanVariant[]`（3～5 个），或当无法用现有能力完成时，输出一条 `Plan_Fallback`（见 §4.3）。

### 7.2 Critic 评分输出

Critic 除选出最优 `planId` 外，可输出每个预案的得分与简要理由，便于审计与调参：

```ts
interface PlanScore {
  planId: string;
  score: number;
  /** 归一化 0～1 */
  estimatedSuccess?: number;
  estimatedCost?: number;
  estimatedRisk?: number;
  reason?: string;
}
```

存储或传递时可采用 `{ chosenPlanId: string; scores: PlanScore[] }`。

---

## 八、Planner 系统提示词模板（要点）

以下为发送给 Planner 的 **System Prompt 模板** 的要点（具体措辞在实施时固化）：

1. **角色**：你是一个严谨的架构师，在**仅使用系统已提供能力**的前提下解决问题。
2. **约束**：
   - 当前上下文：`[黑板数据快照]`、当前环境/FSM：`[FSM 状态与简要说明]`。
   - 你**只能**调用以下系统节点和工具：`[提取出的 K 个相关 Skill 与 MCP 列表，含 ID 与简短描述]`。
   - **严禁**虚构不存在的工具或节点；每一步的 `actionId` 必须来自上述列表。
3. **任务**：根据用户意图与上述约束，给出 **3 种**（或 3～5 种）组合这些现有节点完成任务的预案；每个预案为结构化 JSON（符合 `PlanVariant`）。
4. **Fallback**：若无论如何组合现有节点都无法完成任务，则输出一条 `Plan_Fallback: Request_New_Skill`，并简要说明缺失能力。

实施时可将「黑板数据快照」「FSM 状态」「技能列表」等以占位符注入，由探索层在运行时填充。

---

## 九、配置建议

以下配置项供实现时参考（命名与结构可调整）：

```ts
// 示例结构，非强制
exploration: {
  enabled: boolean;
  trigger: {
    openIntents?: string[];
    complexThresholdChars?: number;
    uncertaintyThreshold?: number;
    failureRateThreshold?: number;
  };
  planner: {
    maxVariants?: number;        // 3～5
    readOnlyRAGOnly?: boolean;   // 仅只读 RAG
  };
  critic: {
    weights?: { success: number; cost: number; risk: number };
  };
  snapshot: {
    maxRelevantSkills?: number;  // 先验扫描时取前 K 个相关技能
  };
  /** 探索经验与复用（§十一） */
  experience?: {
    enabled?: boolean;             // 是否启用探索经验存储与复用
    collection?: string;           // 内源集合名，默认 "exploration_experience"
    reuseThreshold?: number;       // 检索命中得分 ≥ 此值才复用，建议 0.82～0.88
    requireSnapshotMatch?: boolean; // 是否要求 snapshot_digest 兼容才复用
    storeOutcome?: boolean;       // 是否在执行完成后回写 success/token 等到条目
    maxEntries?: number;          // 可选：探索经验条目的上限，超出时由复盘或 LRU 淘汰
  };
}
```

---

## 十、架构总结与优势

| 维度 | 约定 |
|------|------|
| **探索层定位** | 动机层之后、执行层之前；可选高阶中间件，仅 Gatekeeper 放行时进入。 |
| **双 Agent** | Planner：只读 RAG + 约束下生成 3～5 个预案；Critic：打分与择优，输出单一最优预案（或 Fallback）。 |
| **先验扫描** | 必做：扫描 FSM/黑板、内源 RAG/MCP，将可行解空间限制为 \( P_{\text{feasible}} \)；再注入 Planner，杜绝幽灵调用。 |
| **干跑三阶段** | 预案发散 → 预案评分与淘汰 → 降维编译为 Event 并发布；执行层仅消费 Event，不感知探索层。 |
| **可插拔** | 通过 `exploration.enabled` 与触发阈值调节「哲学家模式」与「行动派模式」。 |
| **Fallback** | Planner 可输出 `Plan_Fallback: Request_New_Skill`，驱动后续技能补全或架构师 Agent。 |
| **探索经验与复盘** | 探索结果写入内源集合 `exploration_experience`；相似任务优先复用历史预案（检索优先），仅新任务或无匹配时做完整干跑；执行结果可回写；复盘对探索经验做合并/修剪/质量报告，越用越准、Token 与效率双优。 |

**优势**：执行层保持纯粹；复杂/开放任务质量提升；消除「调用不存在工具」的幻觉执行；可配置的成本/质量权衡；**探索经验复用降低重复推演、复盘闭环提升探索质量**；与现有 Event Bus、动机层、多 Agent、BT/FSM、RAG 与复盘机制设计兼容。

---

## 十一、探索经验与复盘集成

### 11.1 评估：为何将探索纳入复盘与记忆经验

| 维度 | 评估结论 |
|------|----------|
| **必要性** | **强烈建议**。探索层单次成本高（Planner + Critic 多轮 LLM），若同类任务每次均做完整干跑，Token 与延迟会持续偏高。将「任务签名 → 所选预案 + 执行结果」沉淀为**探索经验**，相似任务优先复用，可显著降低重复推演、提升整体效率。 |
| **主旨对齐** | 「探索使用越多，越有经验」：历史探索结果写入内源存储，随复用与结果回写形成**可检索的经验库**；「遇到新任务且探索经验中不存在时再探索」：在 Gatekeeper 放行后、调用 Planner 之前先查探索经验，命中则复用，未命中再完整探索并写入新条目。与动机 RAG「越用越准」、流程库经验迭代（成功率优选）一致。 |
| **Token 与效率** | 复用一次历史预案可避免 1 次 Planner 调用 + 1 次 Critic 调用（及可能的多轮），直接编译下发，节省大量 Token 与延迟；同时减少重复方案推演，任务响应更快。 |
| **风险与缓解** | **预案过时**：技能集或上下文变化后，历史预案可能不再可行。缓解：① 探索经验条目带 **snapshot_digest**（如可用技能 ID 列表的哈希或版本）；复用前校验当前快照与 digest 兼容再复用，否则走完整探索。② 复盘定期修剪/淘汰长期失败或过时条目。**误复用**：任务相似但实际目标不同。缓解：① 复用阈值 `reuseThreshold` 设得较高（如 0.85）；② 条目存储「任务描述 + 意图标签」，检索时用消息+意图联合相似度。 |

**设计原则**：探索经验作为**内源 RAG 的一部分**（与动机 RAG、skills、flows 并列），参与统一的热重载、可读性与复盘策略；复盘机制**显式增加对探索经验**的消费与产出，使探索层与系统梦境闭环。

### 11.2 探索经验存储（形态与 Schema）

- **归属**：内源 RAG 新集合，建议集合名 **`exploration_experience`**（与 RAG与复盘机制详细设计 §2.1.1 中的 `motivation`、`skills`、`flows` 并列）；若实现上更倾向独立存储（如独立 JSONL 或 SQLite），也需提供**按任务签名检索**的能力（等价于向量检索或键值+相似度）。
- **Embedding 与检索**：条目的**可检索文本** = 任务签名（见下）的规范化表示（如 user message 摘要 + intent 标签拼接）；对该文本做 embed，检索时用**当前请求的 message（+ 可选动机层产出的 intent）** 做向量 search，取 topK（如 1 或 3），再按相似度与复用条件过滤。

**单条探索经验条目（设计级 Schema）**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 唯一标识（如 UUID） |
| `task_signature` | string | 用于检索与展示：用户消息摘要或原文、可选 intent/hint；embed 来源 |
| `intent` | string? | 动机层/路由产出的意图或 hint，便于与路由肌肉记忆对齐 |
| `chosen_plan` | object | 当时选中的最优预案（PlanVariant，含 steps）；复用时直接用于编译 |
| `snapshot_digest` | string? | 先验扫描的摘要哈希（如 availableActions 的 ID 列表排序后 hash）；复用前若当前快照 digest 与之一致或兼容则复用，否则不复用 |
| `created_at` | ISO8601 | 首次写入时间 |
| `reuse_count` | number | 被复用次数，复盘与统计用 |
| `last_reused_at` | ISO8601? | 最近一次复用时间 |
| `outcome_success_count` | number? | 执行成功次数（回写累计） |
| `outcome_fail_count` | number? | 执行失败次数（回写累计） |
| `last_outcome` | boolean? | 最近一次执行是否成功 |
| `last_token_cost` | number? | 最近一次执行消耗的 Token（可选） |
| `payload` | object? | 可选：Critic 得分、correlationId 与 explorationRecordId 映射等 |

- **可读源**：与内源 RAG 约定一致，原始条目存于可读 JSON（如 `rag/endogenous/exploration_experience/*.json`），向量索引仅存 embedding + id 指针；用户可查看、备份或手工修剪。

### 11.3 检索优先（先查探索经验，再决定是否干跑）

在 Gatekeeper 判定「需要进入探索层」之后、调用先验扫描/Planner **之前**，增加一步：

1. **检索**：`search("exploration_experience", currentMessage, topK=3)`（可选：将动机层产出的 intent 拼入 query 提升相关性）。
2. **命中判断**：取最高分条目，若 `score >= exploration.experience.reuseThreshold`（如 0.85）则视为命中。
3. **快照兼容（可选）**：若配置了 `exploration.experience.requireSnapshotMatch`，则对当前先验扫描得到的 `snapshot_digest` 与命中条目的 `snapshot_digest` 做比较；仅当一致或兼容（如「当前技能集为命中条目的超集」）时才复用，否则视为不命中。
4. **复用**：若命中且通过兼容性检查，则直接使用命中条目的 `chosen_plan`，**跳过** Planner 与 Critic；编译该预案为 Event 并发布，并在条目上更新 `reuse_count`、`last_reused_at`；发布时 payload 带 `explorationRecordId = 条目 id`，便于执行完成后回写。
5. **不复用**：若不命中或未通过兼容性检查，则按现有流程执行**先验扫描 → Planner → Critic**；选出最优预案后，**写入一条新的探索经验条目**（task_signature、intent、chosen_plan、snapshot_digest、reuse_count=0 等），并发布编译结果，同样带 `explorationRecordId`。

这样实现「类似任务不重复推演；新任务或技能/上下文变化后才做完整探索」。

### 11.4 执行结果回写（探索经验的质量信号）

执行层完成一次由探索层下发的任务后，会发布 `chat.response`（或 flow_end 等）。若该请求曾经过探索层且带有 `explorationRecordId`：

- **回写内容**：根据 response 或遥测，更新对应探索经验条目的 `last_outcome`（成功/失败）、可选 `last_token_cost`、`last_duration_ms`；并递增 `outcome_success_count` 或 `outcome_fail_count`。
- **触发时机**：可在执行层发布 response 时由探索层或统一「结果汇聚」模块订阅，按 correlationId/explorationRecordId 找到条目并更新；或由遥测流水异步写入，复盘时再批量回填（实现时选其一即可）。

回写使探索经验不仅「可复用」，还「可评估」：复盘可据此识别高成功率预案（保留或推广）、低成功率或过时预案（修剪或降权）。

### 11.5 复盘对探索经验的动作

在 **RAG与复盘机制详细设计** §5.3「针对各模块的复盘动作」中，**新增「探索经验」一行**：

| 模块 | 复盘动作 | 产出 |
|------|----------|------|
| **探索经验** | ① 按 `task_signature` 或 embedding 做语义聚类，合并高度重叠的条目（如同一类「设计卡牌机制」的多种表述合并为一条或合并 `task_signature`）。② 按 `outcome_success_count`/`outcome_fail_count` 与 `reuse_count` 统计：淘汰长期未复用且失败率高的条目；标记或提升「高成功率、高复用」的优质预案。③ 可选：分析某类任务的 Critic 得分与真实成功率相关性，产出对 Critic 权重的调整建议（仅建议，不直接改配置）。 | 待审的「探索经验合并/删除/降权」补丁；《探索经验质量报告》（优质 vs 待修剪）；可选的 Critic 权重建议 |

- 架构师 Agent **不直接覆盖**探索经验存储；仅产出**待审补丁**（如「删除条目 id=xxx」「将条目 A 与 B 合并为 A'」），经用户确认后由应用流程执行，与动机 RAG、流程库的 PR 审批流一致。

### 11.6 遥测扩展（探索层与复盘可见性）

在 **RAG与复盘机制详细设计** §5.2 遥测 schema 的 `type` 与 `payload` 中，扩展与探索层相关的事件类型，便于复盘与统计：

| type | 说明 | payload 建议 |
|------|------|--------------|
| `exploration_enter` | 进入探索层（Gatekeeper 放行） | correlationId, triggerReason? |
| `exploration_reuse` | 命中探索经验并复用 | correlationId, explorationRecordId, score, reuse_count_after |
| `exploration_full_run` | 未复用，执行完整干跑 | correlationId, explorationRecordId (新), plannerTokens?, criticTokens? |
| `exploration_store` | 新条目写入探索经验 | explorationRecordId, task_signature_summary |
| `exploration_outcome` | 执行结果回写（若实现） | explorationRecordId, success, tokenCount?, durationMs? |

复盘任务可据此统计「复用率」「完整干跑次数」「Token 节省量」以及按 explorationRecordId 聚合的成功率，支撑 §11.5 的修剪与报告。

### 11.7 与动机 RAG、流程库经验的关系

- **动机 RAG**：解决「模糊说法 → 直接走某 flow/事件」，**零探索**（零 Planner/Critic）。  
- **探索经验**：解决「需要探索的任务 → 若历史上已有类似探索结果则复用，否则做一次探索并记下来」。  
二者互补：动机命中则不经探索层；未命中动机但 Gatekeeper 判定需探索时，先查探索经验再决定是否干跑。  
- **流程库经验**（如 flow 成功率优选）：影响的是「选哪条 flow」或「同一 hint 下优选哪个 flowId」；探索经验影响的是「选哪条**预案**」（多步计划）。若某次探索产出的预案被编译为对某 flow 的调用，执行结果既可更新 flow 成功率，也可回写到探索经验条目，两套统计可并存。

### 11.8 配置建议（探索经验与复用）

在 §九 配置建议中扩展 `exploration`：

```ts
exploration: {
  // ... 现有 trigger、planner、critic、snapshot ...
  experience: {
    enabled: boolean;              // 是否启用探索经验存储与复用
    collection?: string;           // 内源集合名，默认 "exploration_experience"
    reuseThreshold?: number;      // 检索命中得分 ≥ 此值才复用，建议 0.82～0.88
    requireSnapshotMatch?: boolean; // 是否要求 snapshot_digest 兼容才复用
    storeOutcome?: boolean;       // 是否在执行完成后回写 success/token 等到条目
    maxEntries?: number;          // 可选：探索经验条目的上限，超出时由复盘或 LRU 淘汰
  };
}
```

---

## 十二、与相关文档的衔接

| 文档 | 衔接点 |
|------|--------|
| **EVENT_BUS_AS_HUB_DESIGN.md** | 探索层作为 Bus 订阅者，消费 request、发布编译后的 Event；Schema 与 correlationId 一致。 |
| **MULTI_AGENT_ENTITY_DESIGN.md** | 预案中可指定 `agentId`/flowId，编译为 Event 后由调度层派发到对应 Agent 实例。 |
| **EVENT_BUS_COLLABORATION_DESIGN.md** | 若最优预案为多阶段/多 Agent，编译结果可为 `pipeline.stage_done` 或 `delegate.request` 等协作事件。 |
| **BEHAVIOR_TREE_AND_STATE_MACHINE_DESIGN.md** | 预案中的 `actionId` 对应 BT 节点或 flowId；执行层按现有 BT/FSM 引擎执行。 |
| **RAG设计总结与智能体对接讨论.md** | 动机 RAG 在前；内源 RAG 用于先验扫描的「可用技能」检索；外源 RAG 仅供 Planner 只读检索领域知识。 |
| **RAG与复盘机制详细设计.md** | 探索经验作为内源新集合 `exploration_experience` 与 motivation/skills/flows 并列；复盘机制 §5.3 增加对**探索经验**的复盘动作（合并/修剪/质量报告）；遥测 schema 增加 exploration_* 事件类型；探索经验的可读源与热重载遵循内源 RAG 统一约定。 |
| **planning.ts（isComplexRequest / fetchPlanSteps）** | Gatekeeper 可复用或扩展 `isComplexRequest`；探索层为「先规划再执行」的增强版，并增加先验扫描与多预案+Critic。 |

---

本文档为探索层与预案 Planner 的详细设计；**实施计划与工单**见 **`PHASE16_EXPLORATION_IMPLEMENTATION_PLAN.md`** 与 **`PHASE16_EXPLORATION_WORK_ORDERS.md`**（WO-1601～1659），覆盖 Gatekeeper、先验扫描、Planner/Critic、预案编译与下发、探索经验存储与复用、执行结果回写、遥测、复盘对接与验收。
