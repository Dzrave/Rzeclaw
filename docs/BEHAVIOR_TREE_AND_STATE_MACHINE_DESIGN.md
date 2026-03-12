# 行为树与状态机：流程性任务零 Token 执行设计

本文档基于「将流程性、可程式化任务从 LLM 路径剥离，通过行为树（BT）与状态机（FSM）在零 Token 下稳定执行，并支持动态构建与经验迭代」的目标，给出**完整设计方案**与**实现阶段拆解**。设计覆盖 BT/FSM 的角色划分、路由架构、数据结构、执行引擎、动态构建、经验迭代及与现有 Gateway/Agent/工具层的集成。

**相关讨论**：参见此前设计讨论中关于 token 消耗点、可行性、效率本质的结论；本文档为其正式设计落稿。  
**与 OpenClaw 讨论文档的对比与融合建议**：见 `BEHAVIOR_TREE_STATE_MACHINE_DESIGN_COMPARISON.md`。会话级 FSM、黑板模式、进化出新 Tool 并插入树左侧已作为**正式设计**在本文 §十二 中落实，后续阶段实现；上下文与 Skill 的讨论见 `BEHAVIOR_TREE_CONTEXT_AND_SKILL_DESIGN.md`。

---

## 一、目标与范围

### 1.1 设计目标

| 目标 | 说明 |
|------|------|
| **降低 Token 消耗** | 对可识别的「流程性」请求，不经过 `runAgentLoop`，整次请求零 LLM 调用。 |
| **提升稳定性与可执行性** | 已知流程由 BT/FSM 确定性执行，无模型幻觉、无错误工具顺序。 |
| **动态按任务构建** | 根据任务特点（意图/参数）选择或生成对应 BT/FSM，而非所有请求都经 Gateway→Agent。 |
| **经验迭代** | 通过成功/失败反馈优选树或分支，形成「越用越准」的流程库，类似数据驱动的可学习系统。 |

### 1.2 范围与边界

- **在范围内**：  
  - 行为树（BT）与有限状态机（FSM）均纳入项目；BT 负责有分支/回退/多策略的流程，FSM 负责线性或简单分支的序列。  
  - 路由在 Gateway `chat` 入口处执行：匹配则走 BT/FSM 执行器，不匹配则走现有 `runAgentLoop`。  
  - 执行器复用现有工具层（bash、read、write、edit、process 等），不重复实现工具逻辑。  
  - 支持「选树 + 填参」的规则路由、以及可选的「从轨迹或 LLM 生成新树」的动态构建。  
  - 支持结果反馈与树/分支优选（经验迭代），不实现可微/反向传播式的神经网络学习。

- **不在范围内**：  
  - 开放域对话、创造性任务、无法归纳为固定流程的请求仍全部走 Agent。  
  - 「类似神经网络」限定为离散结构的经验优选与案例库，不做梯度更新或端到端策略网络训练（可留作后续独立设计）。

### 1.3 与现有 Phase 的关系

本设计作为**后续阶段**（建议编号 **Phase 13** 或按当前主计划顺延），依赖 Phase 0～6（工具、记忆、Agent、Canvas、Heartbeat 等）。与 Phase 7～12 无强依赖，可与终端、安全、知识库等并行规划；实现时需对接 Gateway、config、tools、observability。

### 1.4 设计原则：手脚与大脑分离（LLM 仅负责决策与触发）

**核心约束**：项目中 **LLM 只承担「大脑」角色**——决策、触发、高层推理、在未知情况下的泛化处理。**所有「动手」类工作**——流程的增删改查、结构化编辑、校验、版本管理、执行——均由**事先构建好的稳定底层机制**完成；**绝不让 LLM 去「用手拿起杯子」**（即不让 LLM 直接产出整棵 BT/FSM 由系统照单全收，或代替系统做校验/持久化等应由代码保证的步骤）。

| 角色 | 负责内容 | 不负责内容 |
|------|----------|------------|
| **底层机制（手脚）** | 流程库 CRUD、结构化编辑（插入/删除/替换/重排）、校验、版本与审计、flow 执行、路由匹配、经验统计与优选。 | 不做「是否该生成/修改某 flow」的决策；不做开放域推理。 |
| **LLM（大脑）** | 开放域理解与推理、在未知或复杂情况下做决策、**触发**「生成新 flow」或「对某 flow 应用一组编辑」、产出**编辑操作序列**或**生成请求**（而非整棵树的裸 JSON）；BT 内 LLM 兜底节点仅在左侧本能全失败时做推理。 | 不直接构建/验证整棵 BT；不替代底层做校验与持久化；不承担本应由规则或状态机完成的快思考（如路由、状态迁移）。 |

因此：**生成 / 移除 / 维护 / 修改** flow 的**执行**一律走底层 API；LLM 仅在「需要时」输出**结构化指令**（如生成请求、编辑操作列表），由系统解析后调用底层机制执行并校验。详见 §十 流程库底层机制 与 §十 10.5 拓扑自我迭代。

**LLM 参与边界审查**（仅大脑、不动手）：

| 场景 | LLM 职责 | 底层机制职责 | 禁止 |
|------|----------|--------------|------|
| 用户开放域对话 / 复杂任务 | 理解与推理、决定工具调用顺序与参数 | 提供工具列表、执行工具、校验与审计 | LLM 不替代工具执行、不替代校验 |
| 路由 / 会话状态迁移 | 不参与（规则或本地小模型） | matchFlow、FSM 迁移 | 不以云端 LLM 做「是否走 flow」的每请求判断 |
| BT 内 LLM 兜底节点 | 仅在左侧全失败时做一次推理，返回结果 | 执行整棵 BT、决定何时调 LLM 节点 | LLM 不编排工具顺序，仅产出单轮回复或结构化结果 |
| 生成新 flow | 输出**生成请求**（意图+步骤摘要）或极简 spec | createFlow(spec)、校验、落盘、绑定路由 | LLM 不直接产出整棵 BT/FSM JSON 由系统无校验写入 |
| 替换失败分支 / 拓扑重构 | 输出**编辑操作序列** EditOp[] | applyEditOps、校验、版本、落盘 | LLM 不产出整棵新树、不替代校验与持久化 |
| 进化插入树（新 Tool + 节点） | 产出功能代码 + 节点定义 + 可选测试代码 | 沙盒测试、工具注册、insertNode 等、热更新 | LLM 不执行代码、不直接改库文件 |
| 意图分类（可选 intentClassifier） | 本地小模型输出枚举/JSON，高置信度选 flow | 路由表、Executor | 云端 LLM 不用于「每句话分类」 |

---

## 二、当前架构与 Token 消耗点

### 2.1 现有请求路径

```
Gateway.chat(message)
  → runAgentLoop(config, userMessage, sessionMessages, ...)
     → 每轮: LLM(system + messages + tools) → tool_use 或 text
     → 工具执行 → 结果回填 → 下一轮或结束
```

- **Token 消耗**：每轮均为「system（工具表、bootstrap、目标、记忆、角色）+ 上下文 + 用户消息 → LLM 响应」。多轮工具调用即多轮请求。  
- **复杂请求**：`planning.isComplexRequest` 为真时先 `fetchPlanSteps` 再进主循环，额外一次 LLM 调用。

### 2.2 已有零 Token 组件

- `extractTaskHint(userMessage)`：规则/关键词 → task_hint，无 LLM。  
- `isComplexRequest(userMessage, config)`：长度 + 正则，无 LLM。  
- `runProactiveInference`：任务/画布/记忆规则生成提议，无 LLM。  
- Heartbeat `check()`：解析清单与优先级，无 LLM（`checkUseLLM` 为 true 时除外）。

### 2.3 设计结论

- 在 **Gateway.chat** 入口处增加**路由**：若请求被识别为「某 BT/FSM 可处理」，则**不调用 runAgentLoop**，改为执行 BT/FSM，从而该次请求**零 Token**。  
- 路由与 BT/FSM 执行均复用现有 workspace、权限、审计、工具 handler，保持单一日志与安全策略。

---

## 三、行为树与状态机的角色划分

### 3.1 何时用状态机（FSM）

| 适用场景 | 说明 |
|----------|------|
| 线性步骤 | 严格顺序：步骤 1 → 2 → 3，无分支、无回退。 |
| 简单分支 | 少量固定分支（如「成功→下一步，失败→报错」），迁移条件简单。 |
| 实现成本 | 状态 + 迁移表即可，易于从「成功轨迹」反推为状态序列。 |

**典型用途**：单次「读文件 → 改一段 → 写回」、固定命令序列（如 build → test）、简单确认流程（确认 → 执行 → 通知）。

### 3.2 何时用行为树（BT）

| 适用场景 | 说明 |
|----------|------|
| 分支与回退 | 先尝试 A，失败则 B；或「准备 → 执行 → 若失败则回滚」。 |
| 优先级与选择 | Selector：多子节点按序尝试直到一个成功。 |
| 组合与复用 | Sequence、Fallback、并行等，子节点可复用为其他树的子树。 |

**典型用途**：带重试的部署、带校验的发布、多策略错误恢复、Heartbeat 中「若条件 C 则执行 A 否则 B」的规则化分支。

### 3.3 统一抽象与共存

- **FSM 可视为 BT 的特例**：线性 FSM 等价于 BT 的单一 Sequence 节点；或实现上 FSM 作为独立执行引擎，与 BT 引擎并列，由路由或「树内节点」决定调用谁。  
- **本设计采用「BT 与 FSM 双引擎」**：  
  - **FSM 引擎**：状态集合、初始状态、迁移表（state → event/condition → nextState + optional action）。执行效率高、序列易从轨迹生成。  
  - **BT 引擎**：节点树（Control + Condition + Action）。支持 Selector/Sequence/Fallback、条件节点、调用工具的 Action 节点。  
- **路由层**：对每条「流程」配置为 `type: "fsm"` 或 `type: "bt"`，并绑定意图/匹配规则；执行时根据类型分发到对应引擎。

---

## 四、整体架构：路由与执行路径

### 4.1 请求路径（含路由）

```
Gateway.chat(message)
  → [第一层] 纯控制命令？如「退出」「断开」→ 直接处理，不断开 Agent/flow
  → Router.match(message, context)  →  { matched: true, flowId, params } | { matched: false }
  → 若 matched: true
       → Executor.run(flowId, params, { workspace, config, sessionId? })
       → 返回 { content, toolResults?, success }，不调用 LLM
  → 若 matched: false
       → 照旧 runAgentLoop(...)
```

- **第一层**：在路由前可处理**纯控制命令**（如退出、断开连接），由 Gateway 直接响应，不进入 Router 也不调用 runAgentLoop，实现零 Token、毫秒级响应。  
- **Router**：基于规则（关键词、task_hint、可选正则/槽位）判断是否匹配某条已注册流程（flow），并抽取参数（如 file path、env name）。**可选**：启用本地小模型意图分类（如 Ollama 8B）时，高置信度匹配 flow 则走 Executor，低置信度再走 Agent，见第十一节配置。  
- **Executor**：根据 flow 定义（`type: "bt"` | `type: "fsm"`）调用 BT 引擎或 FSM 引擎，传入 workspace、config、sessionId（可选）；引擎内部调用现有 tool handler（与 runAgentLoop 共用），写审计/op-log。  
- **热更新**：流程库（libraryPath）下的 flow JSON 支持热更新；Gateway 在每次 match 前或按间隔重新加载库，**无需重启服务**即可使用新增/修改的 flow。所有 BT/FSM 调用的工具均通过现有 ToolDef 接口；若未来支持进化生成新 Tool，也需符合同一接口方可注册。

### 4.2 数据流

- **输入**：`message`、`workspace`、`config`、可选 `sessionId`、可选 `sessionContext`（如当前画布步骤）。  
- **输出**：与 Agent 回复对齐：`content: string`（给用户看的摘要）、可选 `toolResults`（用于审计或前端展示）、`success: boolean`。  
- **审计**：BT/FSM 内每次工具调用均经同一套 `appendOpLog`、权限与危险命令检查，便于与 Agent 路径统一审计。

### 4.3 与 Heartbeat / 主动模式的衔接

- Heartbeat 的 **Act** 阶段当前可调用 `runAgentLoop`。可扩展为：若待执行项匹配某条 flow（如「运行备份」对应 flowId `backup`），则优先走 **Executor.run("backup", params)**，零 Token；否则再走 runAgentLoop。  
- 提议（proactive.suggest）仅生成建议文案，不直接执行；若用户点击「执行」且客户端发 chat(suggestedInput)，则仍经上述路由，可能被 BT/FSM 接管。

---

## 五、行为树设计

### 5.1 节点类型

| 类型 | 说明 | 子节点 | 执行语义 |
|------|------|--------|----------|
| **Sequence** | 顺序执行 | 有 | 依次执行子节点，全部 success 才 success；任一 failure 则 failure。 |
| **Selector** | 选择其一 | 有 | 依次尝试子节点，直到一个 success 则 success；全 failure 则 failure。 |
| **Fallback** | 同 Selector | 有 | 与 Selector 同义，常用于「尝试 A 失败再 B」。 |
| **Parallel** | 并行（可选） | 有 | 同时执行子节点；成功数/失败数策略可配置（如全部成功才成功）。 |
| **Condition** | 条件判断 | 无 | 根据上下文/环境变量/读文件结果返回 true/false，不调用工具。 |
| **Action** | 调用工具 | 无 | 调用单一工具（bash/read/write/edit/process 等），参数可来自树参数或上一步结果。 |
| **FSM** | 子状态机 | 无（内部为状态表） | 执行内嵌 FSM 定义，用于线性子流程。 |
| **LLM**（可选） | 兜底推理 | 无 | 仅当父为 Selector/Fallback 且左侧兄弟全 failure 时执行；调用 runAgentLoop 或单轮 LLM，结果作为节点返回值。将 Token 严格压缩在「未知情况」。 |

- **Action 节点**：与现有 `ToolDef` 一一对应；参数为 JSON 对象，支持占位符（如 `{{workspace}}`、`{{params.file}}`）。  
- **Condition 节点**：支持简单谓词（如 `fileExists(path)`、`env(KEY)==value`），不消耗 token，不调用 LLM。  
- **LLM 节点**（可选扩展）：实现「左侧本能、右侧大脑」；Selector/Fallback 最右子节点可为 LLM 节点，仅当左侧全失败时执行，实现单次请求内「先试 flow 再局部用大脑」，进一步降低 token。实现见 Phase B 之后工单（如 WO-BT-021）。

### 5.2 树的结构化表示（JSON）

```json
{
  "id": "deploy_prod",
  "version": "1",
  "type": "bt",
  "root": {
    "type": "Sequence",
    "children": [
      {
        "type": "Action",
        "tool": "bash",
        "args": { "command": "npm run build", "dryRun": false }
      },
      {
        "type": "Fallback",
        "children": [
          {
            "type": "Action",
            "tool": "bash",
            "args": { "command": "npm run test" }
          },
          {
            "type": "Action",
            "tool": "bash",
            "args": { "command": "echo 'Tests skipped'" }
          }
        ]
      },
      {
        "type": "Action",
        "tool": "bash",
        "args": { "command": "npm run deploy --env={{params.env}}" }
      }
    ]
  }
}
```

- 支持 **参数注入**：`params` 由路由层传入（如 `{ env: "production" }`），在 `args` 中通过 `{{params.xxx}}` 引用。  
- 可选：`resultOf` 引用前序 Action 的 result（如将 read 的输出作为下一 edit 的输入），用于多步串联。

### 5.3 执行引擎（BT）

- **Tick 模型**：从 root 开始，按节点类型递归 tick；子节点返回 `success` | `failure` | `running`（若支持长时动作）。  
- **Action 执行**：解析 args 中的占位符 → 调用 `getMergedTools` 中对应 tool 的 handler，传入 workspace、timeout；结果写 op-log，并作为该节点返回值（成功/失败由 tool 的 ok 决定）。  
- **与安全策略一致**：bash 的 dangerous 检查、process kill 的 protectedPids、permissionScopes 等与 runAgentLoop 中共用，不绕过。

### 5.4 占位符与上下文

- **全局**：`{{workspace}}`、`{{params.<key>}}`（路由抽取的参数）。  
- **可选扩展**：`{{resultOf.<nodeId>}}` 表示前序某 Action 的 content（需在引擎内维护 nodeId → lastResult 的映射）。  
- **Condition**：可读 `{{params}}`、`{{env.VAR}}`、或调用内置 `fileExists(relativePath)` 等，不开放任意脚本以避免注入风险。

---

## 六、状态机设计

### 6.1 FSM 结构

- **状态集合**：`states: string[]`，其一为 `initial`。  
- **迁移表**：`transitions: { from, to, on: "success"|"failure"|"event"?, guard?: conditionRef }[]`，每条可绑定 **action**（即调用某工具或执行某子 BT）。  
- **执行语义**：从 initial 开始，执行当前状态的 action（若有）→ 根据结果（success/failure）或事件查迁移表 → 进入下一状态，直到进入终态（如 `done`、`error`）或无合法迁移。

### 6.2 FSM 的 JSON 表示

```json
{
  "id": "simple_build",
  "version": "1",
  "type": "fsm",
  "initial": "build",
  "states": [
    { "id": "build", "action": { "tool": "bash", "args": { "command": "npm run build" } } },
    { "id": "test", "action": { "tool": "bash", "args": { "command": "npm run test" } } },
    { "id": "done" },
    { "id": "error" }
  ],
  "transitions": [
    { "from": "build", "to": "test", "on": "success" },
    { "from": "build", "to": "error", "on": "failure" },
    { "from": "test", "to": "done", "on": "success" },
    { "from": "test", "to": "error", "on": "failure" }
  ]
}
```

- **action** 与 BT 的 Action 节点一致：tool + args，占位符规则相同。  
- **guard**（可选）：仅当条件为真时才允许迁移，条件为简单谓词（同 BT Condition）。

### 6.3 FSM 引擎

- 维护当前状态；每步执行当前 state 的 action（若有）→ 得到 success/failure → 查表迁移 → 若为终态则返回整体 success/failure 与摘要 content。  
- 工具调用同样走统一 handler 与审计。

### 6.4 BT 与 FSM 的互嵌

- **BT 中嵌 FSM**：BT 的「FSM」节点类型，携带 fsm 定义（或 fsmId），执行时调用 FSM 引擎，将 FSM 的最终结果映射为 success/failure。  
- **FSM 中嵌 BT**：某 state 的 action 可设为 `{ "runFlow": "bt_flow_id", "params": {...} }`，由执行器解析为执行另一棵 BT，实现子流程复用。

---

## 七、动态构建：选树/参数填充与树的生成

### 7.1 运行时「选树 + 填参」（零 Token）

- **意图 → flow 映射表**：在配置或库中维护 `intent → flowId`（或 `task_hint → flowId`），例如「运行命令」「部署」「写文档」→ 对应 flowId。  
- **参数抽取**：从 `message` 中用规则或简单正则抽取槽位（如文件路径、环境名、命令片段），填入 `params`。若使用现有 `extractTaskHint`，可扩展为返回 `{ hint, slots }`（slots 即 params）。  
- **多候选**：若同一 hint 对应多个 flowId，可按「经验迭代」的权重或最近成功率排序后选第一个；见第八节。

**实现要点**：  
- 新增或扩展 `task-hint`/router：`matchFlow(message): { flowId, params } | null`。  
- 规则可放在配置（如 `flows.routes: { hint: string, flowId: string, slotRules?: [...] }[]`）或从「流程库」的元数据生成。

### 7.2 从成功轨迹生成树/状态机（可选，零或低 Token）

- **输入**：会话或 ops 日志中的「用户消息 + 工具调用序列」（tool name + args + result ok/fail）。  
- **成功定义**：会话正常结束且用户未 undo、或最后一步为成功且无高风险记录。  
- **生成逻辑**：  
  - **FSM**：工具序列直接对应状态序列，每步的 tool+args 为 state 的 action；迁移为 success→next、failure→error。  
  - **BT**：生成单一 Sequence，每步为 Action 节点；若轨迹中有「失败后换方案」，可归纳为 Fallback 子序列。  
- **去重与入库**：生成后与现有库按「意图 + 步骤签名」做简单相似度比较，若与已有树重复则仅更新统计信息，否则作为新 flow 入库（可标记为「自动生成」便于后续人工审核）。

**实现要点**：  
- 轨迹来源：现有 `ops.log`、session 消息中的 tool_use 序列；需能关联到「会话结果」（成功/失败）。  
- 离线或定时任务：`trajectoryToFlow(trajectory): FlowDef`，输出 FSM 或 BT 的 JSON；**写入流程库须经 createFlow(spec)**（§十），校验后落盘；可选触发「经验」权重初始化。

### 7.3 由 LLM 触发生成新树（一次性 Token，走底层机制）

- **触发**：用户显式请求「帮我做一个 XXX 的流程」或路由层发现无匹配且策略允许「生成新流程」。  
- **LLM 职责（仅大脑）**：输出**生成请求**（意图描述 + 步骤摘要 + 可选 hint），或极简 spec；**不**要求 LLM 直接产出整棵 BT/FSM 的完整 JSON。  
- **底层机制职责**：系统将生成请求转为 `createFlow(spec)` 的 spec（可由模板或规则生成初始树）；**校验、落盘、绑定路由**均由 §十 CRUD 完成；可选 status 为「待审核」。  
- **兼容**：若实现上仍支持「LLM 输出整棵 JSON」作为 spec 的一种，则**必须**经 `createFlow(spec)` 校验后写入，禁止未校验直接写库。

**实现要点**：  
- Prompt 约定输出为「生成请求」结构（如 `{ intent, steps[], hint? }`），由机制调用 createFlow。  
- 生成后建议「待审核」状态，首次执行可记录审计，便于人工复查。

---

## 八、经验迭代与「可学习」机制

### 8.1 数据基础

- **每次执行记录**：flowId、params（或摘要）、执行结果（success/failure）、可选 sessionId、时间戳。  
- **存储**：可放在 `workspace/.rzeclaw/flows/outcomes.jsonl` 或现有 metrics/审计扩展字段。  
- **成功定义**：执行到终态且无安全告警、且（若可获取）用户未在后续短时内执行 undo 或投诉。

### 8.2 优选策略

- **同一意图多棵候选树**：按 flowId 统计历史成功率（或加权近因），路由时优先选成功率最高的一棵。  
- **同一树内分支**：若某 Fallback 子分支经常被选中且成功，可提升其优先级（如调整子节点顺序）；若某分支经常失败，可标记为「待替换」或由 LLM 生成替代分支（低频调用）。  
- **权重存储**：在流程库元数据中维护 `flowId → { successCount, failCount, lastUsed }` 或更细粒度（如 per-params 的统计）；路由与执行器只读，由独立「经验更新」任务写。

### 8.3 树/分支的进化

- **替换失败分支**：当某 Action 或某 Fallback 分支失败率超过阈值，可触发「建议替换」：**LLM 仅输出编辑操作序列**（如 `replaceSubtree`、`insertNode` + `removeNode`），由底层 **applyEditOps(flowId, ops)** 执行；校验与落盘由机制完成，A/B 或待审核可选。禁止 LLM 直接产出「替代子序列的整棵子树」由系统无校验写回。  
- **合并相似树**：若两棵自动生成的树意图与步骤高度相似，可合并为一棵并保留两套 params 模板，减少冗余；合并操作通过 CRUD/编辑接口完成。  
- **不做**：连续参数上的梯度更新、端到端策略网络、自动改写树结构 without 人工或明确策略（避免误删安全步骤）。

### 8.4 与「类似神经网络」的对应关系

- **数据驱动**：更多执行数据 → 更准的选树与更稳的流程，等价于「用数据优化决策」。  
- **离散结构**：优化对象是「选哪棵树、选哪条分支」，不是连续权重；因此是案例库 + 统计优选，不是反向传播。  
- 若未来要引入「小模型输出 flowId/params」，可在此基础上再加一层，本设计不依赖该层。

---

## 九、与现有组件的集成

### 9.1 Gateway

- **chat** 入口：在调用 `runAgentLoop` 前调用 `router.match(message, { workspace, sessionId, sessionType? })`。  
  - 若返回 `{ flowId, params }`：调用 `executor.run(flowId, params, { config, workspace, sessionId })`，将返回的 `content` 作为助手回复，并可选推送 stream（若执行器支持逐步输出）。  
  - 若返回 `null`：保持现有 `runAgentLoop` 逻辑。  
- **会话与快照**：BT/FSM 执行后，可将本次「用户消息 + 助手 content」追加到 session.messages，并可选写 snapshot，以便会话连续性（与 Agent 路径一致）。

### 9.2 工具层

- **复用**：BT/FSM 的 Action 与 FSM 的 state.action 均通过现有 `getMergedTools`（或至少 CORE_TOOLS + 同权限策略）解析 tool name 并调用 handler。  
- **权限与安全**：与 runAgentLoop 一致——使用同一套 `validateToolArgs`、`checkDangerousCommand`、`getEffectivePolicy`、`appendOpLog`。  
- **不新增工具**：不因 BT/FSM 增加新 tool 类型；仅新增「调用现有工具」的编排能力。

### 9.3 配置与记忆

- **config**：新增 `flows` 配置块（见第十节）。  
- **记忆**：BT/FSM 执行完成后，可选与 Agent 路径类似地写 L1 摘要（如「用户通过流程 X 完成了 Y」），以便后续检索时知道「该 workspace 曾成功执行过某流程」；是否写入可由配置控制，默认可关闭以减少噪音。

### 9.4 Canvas 与 Heartbeat

- **Canvas**：若 flow 有步骤概念（如 BT 的 Sequence 或 FSM 的 states），执行器可选择性更新 `canvas.currentPlan`（goal = flowId，steps = 步骤列表，currentStepIndex 随执行推进），与现有规划模式一致。  
- **Heartbeat**：Act 阶段在调用 runAgentLoop 前，可先 `router.match(suggestedInput, ...)`；若匹配到 flow 则执行器执行，否则再 runAgentLoop。

### 9.5 审计与可观测

- 每次工具调用经 `appendOpLog`，并在 op 中标注来源为 `flow` 及 `flowId`，便于区分 Agent 与 BT/FSM 的执行。  
- 可选：`metrics` 中增加「flow 执行次数、成功率」的聚合，便于经验迭代与运维看板。

### 9.6 与现有代码的对接点（实现时参考）

| 功能 | 现有路径 | 对接方式 |
|------|----------|----------|
| 配置加载 | `src/config.ts` loadConfig、RzeclawConfig | 扩展类型 `FlowsConfig`，在 loadConfig 中解析 `config.flows`。 |
| 路由入口 | `src/gateway/server.ts` 中 `method === "chat"` 分支 | 在调用 runAgentLoop 前调用 `matchFlow(message, context)`；若匹配则调用 executor，否则不变。 |
| 工具执行 | `src/tools/merged.ts` getMergedTools；各工具 handler | 执行器通过 getMergedTools 按 name 取 ToolDef，调用 `tool.handler(args, cwd)`；与 loop.ts 中工具调用一致。 |
| 权限与安全 | `src/agent/loop.ts` 中 validateToolArgs、checkDangerousCommand、getEffectivePolicy、appendOpLog | 执行器内每步工具调用前/后复用同一套逻辑（可抽为共享函数或直接调用）。 |
| 任务意图 | `src/memory/task-hint.ts` extractTaskHint | 路由可基于 extractTaskHint 结果查表；或扩展返回 slots。 |
| 流程库与 outcomes | 新目录 `workspace/.rzeclaw/flows/` | 由 config.flows.libraryPath 指定；outcomes 由执行器写入、经验模块读取。 |

---

## 十、流程库底层机制（CRUD + 结构化编辑）

本节规定 flow（BT/FSM）的**完整底层能力**：创建、读取、更新、删除与**结构化编辑**（插入节点、删除节点、替换子树、重排子节点等），以及校验、版本与审计。所有「生成 / 修改 / 移除」均由该机制执行；LLM 或人工仅产出**触发指令**（生成请求或编辑操作序列），由系统调用本机制完成实际操作，符合 §1.4「手脚与大脑分离」。

### 10.1 原则与角色

- **机制层**：提供稳定、可复用的 API；不依赖 LLM 输出整棵树的 JSON 才能工作。  
- **触发层**：LLM（或人工、脚本）仅输出「做什么」——例如「创建一棵新 flow」「对 flowId 应用下列编辑」；「怎么做」由本机制实现。  
- **校验与持久化**：一律在机制内完成；LLM 产出经解析后送入 API，由机制校验再落盘，避免未校验数据直接写入。

### 10.2 CRUD 接口

| 操作 | 接口语义 | 说明 |
|------|----------|------|
| **Create** | `createFlow(spec): { flowId, version }` | `spec` 可为完整 FlowDef（BT/FSM JSON），或「生成请求」（意图描述 + 步骤摘要）；若为生成请求，由系统或模板生成初始树再写入。写入前校验；支持可选 `status: "pending_review"`。 |
| **Read** | `getFlow(flowId, version?): FlowDef \| null` | 按 flowId 读取；可选 version 读指定版本。 |
| **Update（全量）** | `replaceFlow(flowId, newDef): boolean` | 用新定义整体替换；校验通过后写入，可选写新版本或覆盖。 |
| **Delete** | `deleteFlow(flowId): boolean` | 从流程库移除该 flow；路由表需同步移除或标记不可用。 |
| **Archive** | `archiveFlow(flowId): boolean` | 软删除：标记为已归档，不再参与路由与加载，可恢复。 |
| **List** | `listFlows(option?): { flowId, type, version, meta? }[]` | 列出库内 flow，支持按 type、meta 过滤；供路由与经验模块使用。 |

- 存储：libraryPath 下 `{flowId}.json` 或 `{flowId}_v{version}.json`；CRUD 读写该目录并维护索引或元数据表（可选）。  
- 热更新：create/replace/delete/archive 后，下次 match 或 list 即可见，无需重启服务。

### 10.3 结构化编辑操作（Structured Edit Ops）

以下操作在**现有 flow 上做增量修改**，无需 LLM 输出整棵新树；LLM 仅输出**操作序列**，由机制逐条应用并校验。

**BT 编辑操作**：

| 操作 | 参数 | 语义 |
|------|------|------|
| **insertNode** | `flowId, parentNodeId, position, nodeDef` | 在 `parentNodeId` 下、`position`（如 0=最左）处插入节点 `nodeDef`；parent 须为 Control（Sequence/Selector/Fallback）或 root。 |
| **removeNode** | `flowId, nodeId` | 移除节点 `nodeId`（及其子树）；若为 root 则 flow 置空或视为无效，需后续 replace 或 create。 |
| **replaceSubtree** | `flowId, nodeId, newSubtree` | 用 `newSubtree`（单节点或子树）替换以 `nodeId` 为根的子树。 |
| **reorderChildren** | `flowId, parentNodeId, order: nodeId[]` | 将 parent 的子节点顺序调整为 `order`；用于调整 Selector 优先级或 Sequence 顺序。 |
| **wrapWithDecorator** | `flowId, nodeId, decoratorType` | 用装饰器（如 Retry、Timeout）包裹 `nodeId`；若当前节点类型支持装饰器则扩展，否则等价于 replaceSubtree 包一层。 |

**FSM 编辑操作**（可选，与 BT 并列）：

| 操作 | 参数 | 语义 |
|------|------|------|
| **addState** | `flowId, stateId, action?` | 在 FSM 中新增状态。 |
| **removeState** | `flowId, stateId` | 移除状态并删除相关迁移。 |
| **addTransition** | `flowId, from, to, on, guard?` | 新增迁移。 |
| **removeTransition** | `flowId, from, to?, on?` | 移除一条或一批迁移。 |
| **setStateAction** | `flowId, stateId, action` | 设置某状态的 action（tool + args）。 |

**统一应用接口**：

- `applyEditOps(flowId, ops: EditOp[]): { success, appliedCount, error?: string }`  
  - 按序应用 `ops`；每步应用后做**轻量结构校验**（无悬空引用、tool 名合法等）；任一步失败则中止，可选回滚已应用步。  
  - 全部成功后再做**整树/整机校验**，通过则持久化并可选 bump version。

- **EditOp 的表示**：JSON 结构，例如 `{ "op": "insertNode", "parentNodeId": "root", "position": 0, "node": { "type": "Action", "tool": "bash", "args": {...} } }`，便于 LLM 输出或脚本生成。

### 10.4 校验、版本与审计

- **校验**：  
  - **结构**：BT 无环、nodeId 唯一、parent 引用存在；FSM 的 initial 存在、transitions 的 from/to 存在。  
  - **语义**：Action 的 tool 名在 getMergedTools 中存在；args 符合 tool 的 inputSchema（或放宽为必填存在）。  
  - 校验失败时拒绝写入并返回明确错误，不落盘。

- **版本**：  
  - 每次 `replaceFlow` 或 `applyEditOps` 成功后可写新版本（如 `flowId_v2.json`），保留上一版本便于回滚。  
  - 路由与执行器默认读「当前版本」；可选接口 `getFlow(flowId, version)` 读历史版本。

- **审计**：  
  - 每次 create/replace/delete/archive/applyEditOps 记录：操作类型、flowId、操作者（如 "evolution" / "llm" / "user"）、时间戳、可选 diff 或 ops 摘要。  
  - 存于 `workspace/.rzeclaw/flows/audit.jsonl` 或现有审计通道，便于追溯与回滚。

### 10.5 拓扑自我迭代（LLM 重构 BT）：LLM 仅触发编辑

**目标**：在「某 flow 失败率偏高或需优化拓扑」时，由 LLM **仅输出编辑操作序列或生成请求**，由底层机制执行并校验，**避免 LLM 直接输出整棵 BT JSON**，从而降低 token、提高成功率与可维护性。

**触发条件**（可配置）：

- 某 flowId 的失败率或连续失败次数超过阈值；或  
- 用户显式请求「优化 / 重构某流程」；或  
- 进化流程（§12.3）中决定「修改现有树」而非仅插入新节点。

**流程**：

1. **输入准备**：系统将当前 flow 的 JSON（或摘要）、近期失败案例摘要（错误类型、节点 id、工具结果）组装为上下文。  
2. **LLM 调用**：一次调用，Prompt 约定「仅输出编辑操作序列」，格式为 `EditOp[]`（见 10.3），例如：  
   - `[{ "op": "wrapWithDecorator", "nodeId": "n2", "decoratorType": "retry" }, { "op": "reorderChildren", "parentNodeId": "root", "order": ["n1","n3","n2"] }]`  
   - 或输出「生成请求」：`{ "action": "createFlow", "intent": "...", "steps": ["..."] }`，由系统转为 createFlow(spec) 的 spec。  
3. **执行**：系统解析 LLM 输出；若为编辑序列则调用 `applyEditOps(flowId, ops)`；若为生成请求则调用 `createFlow(spec)`。  
4. **校验与落盘**：由机制完成；失败则返回错误，可选将错误回传 LLM 做一次修正（Retry 上限可配置）。  
5. **可选**：新版本先进入「待审核」或 A/B 分支，通过后再设为默认版本。

**与 §7.3、§8.3 的衔接**：

- **§7.3 由 LLM 生成新树**：优先改为「LLM 输出生成请求（意图 + 步骤摘要）」→ 系统通过 `createFlow(spec)` 或模板生成初始 BT/FSM 并校验入库；仅在必要时（如用户明确要求「给我一整棵树的 JSON」）才接受整棵 JSON，且仍须经 createFlow 校验后写入。  
- **§8.3 替换失败分支**：改为「LLM 输出编辑操作」（如 `replaceSubtree` 或 `insertNode` + `removeNode`）→ `applyEditOps` 执行；不再由 LLM 直接产出「替代子序列的整棵子树」由系统无校验写回。

**工单归属**：底层机制（CRUD + applyEditOps）为 Phase G 或并入 Phase F 后期；拓扑自我迭代（触发条件 + LLM 输出 EditOp[] + 调用 applyEditOps）为单独工单（如 WO-BT-025、WO-BT-026），依赖底层机制就绪。

---

## 十一、配置与存储

### 11.1 配置项（config.flows）

```json
{
  "flows": {
    "enabled": true,
    "libraryPath": ".rzeclaw/flows",
    "routes": [
      { "hint": "运行命令", "flowId": "run_cmd", "slotRules": [{ "name": "command", "pattern": "运行(.+)" }] },
      { "hint": "部署", "flowId": "deploy_prod" }
    ],
    "intentClassifier": {
      "enabled": false,
      "type": "ollama",
      "model": "llama3.2:8b",
      "confidenceThreshold": 0.85
    },
    "experience": {
      "enabled": true,
      "outcomesPath": ".rzeclaw/flows/outcomes.jsonl",
      "preferHighSuccessRate": true
    },
    "dynamicGeneration": {
      "fromTrajectory": false,
      "fromLLM": false
    }
  }
}
```

- **enabled**：关闭则所有请求仍走 Agent。  
- **libraryPath**：相对 workspace，存放 flow 的 JSON 文件（如 `deploy_prod.json`、`simple_build.json`）。  
- **routes**：意图/ hint 到 flowId 的映射；可选 slotRules 用于从 message 抽取 params。  
- **intentClassifier**（可选）：本地小模型意图分类。`enabled` 为 true 时，先对小模型做意图分类；若某意图置信度 ≥ `confidenceThreshold` 且对应 flowId 存在，则走 Executor，否则走 Agent。`type` 可为 `ollama` 等；`model` 为模型名。不启用时仅用规则路由。  
- **experience**：是否启用经验优选及 outcomes 存储位置。  
- **dynamicGeneration**：是否允许从轨迹或 LLM 生成新树（可默认 false，上线稳定后再开）。

### 11.2 流程库存储

- **目录**：`workspace/<libraryPath>/`，例如 `workspace/.rzeclaw/flows/`。所有对 flow 的增删改查与结构化编辑均通过 **§十 流程库底层机制**（CRUD + applyEditOps）进行，不绕过机制直接写文件。  
- **文件**：每个 flow 一个 JSON 文件，文件名建议 `{flowId}.json`；或 `{flowId}_v{version}.json` 支持多版本。  
- **元数据**：每个 flow 可含 `id`、`version`、`type`（bt|fsm）、可选 `meta.successCount`、`meta.failCount`、`meta.lastUsed`（由经验更新任务维护）。

### 11.3 内置/示例流程

- 可在代码或默认配置中内置少量示例 flow（如「列出目录」「读文件前 N 行」），便于开箱即用与测试；用户可在 libraryPath 下覆盖或新增。

---

## 十二、安全、审计与边界

### 12.1 安全

- **工具执行**：与 Agent 完全共用危险命令检查、permissionScopes、protectedPids；BT/FSM 不绕过。  
- **参数注入**：仅允许 `{{params.*}}`、`{{workspace}}` 等白名单占位符；禁止执行用户消息中的任意片段作为命令（除非经过与 bash 相同的校验）。  
- **流程来源**：仅加载 libraryPath 下及内置白名单的 flow；不从网络或未信任目录加载。

### 12.2 审计

- 每次 flow 执行开始/结束写一条审计（flowId、params 摘要、success、duration）。  
- 每次工具调用已通过 appendOpLog 记录，需带 `source: "flow"`、`flowId`，便于过滤与回溯。

### 12.3 边界

- **超时**：单次 flow 执行总超时（如 5 分钟），与单步 tool 超时分别配置；超时视为 failure 并记录。  
- **回退**：若执行中某步失败且 flow 未定义 Fallback，则整体失败并返回清晰错误信息；不自动 fallback 到 runAgentLoop（避免混淆执行路径）。  
- **用户确认**：若某步涉及高风险（如 bash 的 confirm 策略），与 Agent 一致，可要求确认或 dryRun；BT/FSM 执行器需支持「暂停并返回待确认」状态（可选实现）。

---

## 十三、会话级 FSM、黑板与进化插入树（正式设计，后续阶段落实）

以下三项已确认为**正式设计内容**，在后续实现阶段（Phase F 及之后）中落实。与 Phase A～E 的「请求级路由 + 双引擎」形成完整分层：会话级状态与共享上下文、进化产物直接挂载到现有树。

### 13.1 会话级 FSM（Session-Level FSM）

**目标**：用 FSM 管理**会话生命周期与模式**，每次 chat 先做状态迁移，再决定走「本地拦截（Router→Executor）」还是「深度推理（runAgentLoop）」；状态切换不依赖 LLM，实现低成本、可扩展的会话调度。

**状态定义（建议）**：

| 状态 | 说明 |
|------|------|
| **Idle** | 会话就绪，等待用户输入。 |
| **Local_Intercept** | 当前请求由 Router 匹配到某 flow，正在或即将由 Executor 执行。 |
| **Executing_Task** | 正在执行 flow 或 Agent 的多步任务（可与子状态或黑板配合）。 |
| **Deep_Reasoning** | 已决定或正在调用 runAgentLoop（云端/本地大模型）。 |

**迁移条件**：基于 Router.match 结果、纯控制命令、可选本地小模型输出（如 `ROUTE_TO_LOCAL_SCRIPT` / `ESCALATE_TO_CLOUD`）；不调用云端 LLM。例如：message 匹配 flow → 迁至 Local_Intercept；不匹配 → 迁至 Deep_Reasoning；纯命令「退出」→ 保持或迁回 Idle 并断开。

**与现有架构的衔接**：在 Gateway 的 session 对象上增加 `sessionState: SessionFSMState` 及可选 `sessionStateHistory`；每次 chat 入口先根据 message + 当前状态执行迁移，再根据新状态决定调用 Router+Executor 还是 runAgentLoop。Heartbeat、proactive 等入口可复用同一套状态定义或走简化路径。

**实现要点**：扩展 session 结构；定义状态集与迁移表（配置或代码）；与现有「无状态会话」兼容（state 仅增字段，不破坏 messages/snapshot）。

---

### 13.2 黑板模式（Blackboard）

**目标**：提供**会话级 key-value 共享存储**，供 Router、BT/FSM、Agent 读写；调用 LLM 时仅从黑板组装「当前任务必要」的上下文，减少送入大模型的 history token，实现极致的 Token 隔离与低消耗。

**黑板内容约定**：

- **全局（轻量）**：仅保留极简数据，如 `sessionId`、`currentIntent`（用户核心意图摘要）、`lastFlowId`、`lastError`（若有）、`conclusion`（最终结论或待传递结果）。不存放长文本。
- **可选槽位**：由 BT/FSM 或 Agent 写入的中间结果（如 `currentFile`、`envVars`、某节点输出）；runAgentLoop 或 buildContextMessages 时只读取与当前 Deep_Reasoning 任务相关的槽，组装为 system/user 片段，而非整段 session.messages。

**与现有组件的协同**：

- **buildContextMessages / sessionSummary**：可与黑板协同——黑板槽位优先于或补充「最近 N 轮」；L0 摘要可写入黑板供 Deep_Reasoning 使用。
- **BT/FSM 执行器**：节点执行结果可写回黑板（如 `resultOf.<nodeId>` 同时写入黑板键）；后续 LLM 节点或 Agent 仅读黑板摘要。
- **用完即收**：节点或任务结束后，可将该节点/任务对应的临时槽封存或清空，仅向黑板保留干练结果（与讨论文档中「用完即毁」一致）。
- **节点级/技能级上下文**：可选地，为 flow 或节点配置「专属上下文槽」（按 flowId/nodeId 命名），执行时仅加载该槽、用毕摘要写回并清空过程细节，实现分布式上下文与「技能胶囊」；详见 `BEHAVIOR_TREE_CONTEXT_AND_SKILL_DESIGN.md`。

**实现要点**：在 session 或 request 上维护 blackboard: Record<string, unknown>；定义槽位命名规范与生命周期；在 runAgentLoop 或 buildContextMessages 中增加「从黑板取槽组 context」的逻辑，与现有 summary/window 并存。

---

### 13.3 进化出新 Tool 并插入树左侧（Evolution: New Tool + Insert into Tree）

**目标**：LLM 解决新问题后，不仅可生成新 flow 独立入库，还可生成**可执行代码**（如 Python 脚本）并注册为新 Tool，同时将对应 BT 节点**插入到现有某棵 BT 的 Selector 左侧**，使「同一棵树的左侧本能池」随使用增长，下次同意图优先走新节点，实现真正的「肌肉记忆生长」。

**流程概要**：

1. **触发**：某次 runAgentLoop 或 BT 内 LLM 节点成功解决新问题（可定义成功条件：任务完成、无高风险、可选用户确认）。
2. **生成**：调用 LLM 提炼为「功能逻辑代码 + 行为树节点 JSON」；可选要求同时生成**单元测试代码**（见「行为树与状态机下上下文与skill相关」中的沙盒试飞）。
3. **安全**：脚本在沙盒或受限环境中执行测试；测试通过后方可注册为 Tool 并写入节点。
4. **挂载**：将新 Tool 注册到工具表（热加载）；将新节点插入到指定 flow 的 Selector 左侧（树结构可编辑并持久化）；流程库热更新生效。

**实现要点**：安全执行生成代码（沙箱/子进程/权限限制）；工具动态注册与 getMergedTools 热加载；flow JSON 的「树结构可编辑」API（插入子节点、版本/回滚）；进化触发时机与 Prompt 设计；与现有「新 flow 独立入库」并存（两种进化产物形态可选）。

---

### 13.4 三者在后续阶段的落实顺序

- **建议实现顺序**：先**黑板**（与现有 context/summary 协同，收益直接），再**会话级 FSM**（明确状态与迁移，与路由协同），最后**进化插入树**（依赖工具热注册与树编辑，成本最高）。
- 工单归属：见 §十四 Phase F。

---

## 十四、实现阶段与工单拆解

以下按**依赖顺序**拆分为可落地的工单，便于排期与验收。

### Phase A：基础设施（路由 + 单引擎 + 单流程）

| 工单 | 内容 | 验收标准 |
|------|------|----------|
| **WO-BT-001** | 配置：`config.flows` 的 TypeScript 类型与 loadConfig 解析；`flows.enabled`、`libraryPath`、`routes`。 | 配置项可读，未配置时默认关闭。 |
| **WO-BT-002** | 流程库加载：从 `workspace/<libraryPath>` 读取 JSON，解析为 FlowDef（BT 或 FSM）；校验 id、type、root/states。 | 能加载内置或示例 flow，非法 JSON 或缺少字段时明确报错。 |
| **WO-BT-003** | 路由：实现 `matchFlow(message, context)`，基于 `extractTaskHint` 或扩展的 hint + routes 表返回 `{ flowId, params } \| null`；支持简单 slotRules（正则抽取）。 | 对示例消息能命中示例 flow 并返回 params。 |
| **WO-BT-004** | FSM 引擎：给定 FSM 的 JSON，从 initial 状态执行 action 序列，按 transitions 迁移，调用现有 tool handler；占位符替换；返回 content + success。 | 对示例 FSM（如 simple_build）能完整执行并返回正确结果。 |
| **WO-BT-005** | BT 引擎：给定 BT 的 JSON，实现 Sequence/Selector/Fallback + Action 节点；Action 调用现有 tool handler；占位符替换；返回 content + success。 | 对示例 BT 能完整执行并返回正确结果。 |
| **WO-BT-006** | Gateway 集成：在 chat 入口调用 router；若匹配则调用 executor（先 FSM 后 BT 分发），将返回 content 作为回复并更新 session.messages；不调用 runAgentLoop。 | 发匹配 flow 的消息时无 LLM 调用且得到预期回复。 |
| **WO-BT-007** | 审计与安全：flow 执行中每次 tool 调用经同一套 validation、dangerous、permission、appendOpLog，并标注 source=flow、flowId。 | op-log 中可区分 flow 与 agent，安全策略一致。 |

### Phase B：BT 完善与 FSM 互嵌

| 工单 | 内容 | 验收标准 |
|------|------|----------|
| **WO-BT-008** | Condition 节点：支持简单谓词（fileExists、env 等），不调工具；BT 引擎根据 Condition 结果决定分支。 | 含 Condition 的 BT 能正确分支。 |
| **WO-BT-009** | BT 内嵌 FSM：BT 的 FSM 节点类型，执行时调用 FSM 引擎，结果映射为 success/failure。 | 含 FSM 子节点的 BT 能执行并返回正确结果。 |
| **WO-BT-010** | FSM 内嵌 BT（可选）：state.action 支持 `runFlow: "bt_flowId"`，执行器解析并执行对应 BT。 | 含 runFlow 的 FSM 能执行子 BT。 |
| **WO-BT-011** | resultOf 占位符（可选）：Action 结果可被后续节点通过 `{{resultOf.<nodeId>}}` 引用；引擎维护 nodeId→lastResult。 | 多步读写（如 read→edit）能正确传参。 |

### Phase C：动态构建

| 工单 | 内容 | 验收标准 |
|------|------|----------|
| **WO-BT-012** | 从轨迹生成 FSM：读取 ops 或会话中的工具序列，生成 FSM JSON（states + transitions）；写入 libraryPath 并绑定 hint（可配置）。 | 给定轨迹能生成可执行的 FSM 并入库。 |
| **WO-BT-013** | 从轨迹生成 BT：工具序列生成 Sequence；若有「失败后换方案」可归纳为 Fallback；写入 libraryPath。 | 给定轨迹能生成可执行的 BT 并入库。 |
| **WO-BT-014** | LLM 触发生成 flow（可选）：LLM 输出生成请求（意图+步骤摘要）；系统经 createFlow(spec) 校验落盘；见 §7.3、§十。 | 用户说「做一个备份流程」能生成并保存 flow，且可执行；无整棵 JSON 照单全收。 |

### Phase D：经验迭代

| 工单 | 内容 | 验收标准 |
|------|------|----------|
| **WO-BT-015** | 执行结果记录：每次 flow 执行结束写 outcomes.jsonl（flowId、params 摘要、success、ts）；可选 sessionId。 | 执行后能查到对应 outcome。 |
| **WO-BT-016** | 路由优选：当同一 hint 对应多个 flowId 时，按 outcomes 统计成功率排序，优先选最高；配置 `experience.enabled`、`preferHighSuccessRate`。 | 多候选时能选到历史成功率更高的 flow。 |
| **WO-BT-017** | 元数据更新：定时或执行后更新 flow 元数据（successCount、failCount、lastUsed）；经验更新任务只写不读业务逻辑。 | 库中 flow 的 meta 随执行更新。 |
| **WO-BT-018** | 失败分支标记与替换策略（可选）：某分支失败率超阈值时标记；LLM 输出 EditOp[]，由 applyEditOps 执行并写回库；见 §8.3、§十。 | 替换通过编辑操作完成，校验由机制保证。 |

### Phase E：文档与验收

| 工单 | 内容 | 验收标准 |
|------|------|----------|
| **WO-BT-019** | CONFIG_REFERENCE 补充 flows 配置说明；README 或 USAGE_AND_VERIFICATION 增加「流程执行」小节与验证步骤。 | 配置与使用可被新用户按文档完成。 |
| **WO-BT-020** | 端到端验收：启用 flows、配置至少一条 route、执行匹配消息，确认零 LLM 调用（可观察日志或 mock）；确认不匹配时仍走 Agent。 | 自动化或手动的 E2E 用例通过。 |

### Phase F：会话级 FSM、黑板与进化插入树（§十二 正式设计）

| 工单 | 内容 | 验收标准 |
|------|------|----------|
| **WO-BT-021** | BT 内 LLM 兜底节点：节点类型 LLM；Selector/Fallback 最右子节点可为其；执行时调用 runAgentLoop 或单轮 LLM，结果作为节点返回值。 | 含 LLM 节点的 BT 在左侧全失败时能正确唤醒 LLM 并继续。 |
| **WO-BT-022** | 黑板：session 上 blackboard 结构与槽位约定；BT/FSM 与 runAgentLoop 可读写；buildContextMessages 支持从黑板取槽组 context。 | 送 LLM 的 context 可仅含黑板指定槽，token 可观测减少。 |
| **WO-BT-023** | 会话级 FSM：session 上 sessionState、迁移表；chat 入口先迁移再路由；状态 Idle/Local_Intercept/Executing_Task/Deep_Reasoning。 | 每次 chat 先迁移后决策，不匹配时走 Deep_Reasoning。 |
| **WO-BT-024** | 进化插入树：生成脚本 + 节点 JSON；沙盒测试通过后注册为新 Tool；将节点插入指定 flow 的 Selector 左侧；流程库热更新。 | 新本能可挂到现有树左侧，下次同意图优先执行。 |

Phase F 依赖 Phase A～E 稳定；022 与 023 可部分并行，024 建议在 022、023 之后。

### 工单依赖关系（建议实现顺序）

- **Phase A** 为最小闭环：001 → 002 → 003 → 004 与 005（可并行）→ 006 → 007。完成 A 后即可在 Gateway 上实现「匹配即走 flow、否则走 Agent」。
- **Phase B** 依赖 A（引擎与 Gateway 已接入）：008～011 可依序或部分并行。
- **Phase C** 依赖 A（流程库与路由已存在）：012、013 依赖轨迹/会话数据接口；014 依赖 LLM 客户端。
- **Phase D** 依赖 A 且建议在 B 之后（执行稳定后再做统计）：015 → 016 → 017，018 可选。
- **Phase E** 可与 B/C/D 末段并行：019、020 在 A 完成后即可着手文档与 E2E 用例，随功能完善更新。  
- **Phase F** 落实 §十三 正式设计：021（BT 内 LLM 节点）、022（黑板）、023（会话级 FSM）、024（进化插入树）；依赖 A～E，022/023 可部分并行，024 建议最后。  
- **Phase G** 流程库底层机制与拓扑自我迭代（§十）：025（CRUD + applyEditOps）、026（拓扑自我迭代）；依赖 Phase A 流程库与执行器，可与 Phase F 部分并行或在其后。

### Phase G：流程库底层机制与拓扑自我迭代（§十）

| 工单 | 内容 | 验收标准 |
|------|------|----------|
| **WO-BT-025** | 流程库底层机制：实现 createFlow/getFlow/replaceFlow/deleteFlow/archiveFlow/listFlows；实现 applyEditOps（insertNode、removeNode、replaceSubtree、reorderChildren、wrapWithDecorator）；校验、版本与审计。 | CRUD 与编辑操作可编程调用；校验失败不落盘；审计可追溯。 |
| **WO-BT-026** | 拓扑自我迭代：触发条件（失败率/用户请求）→ 组装上下文 → LLM 输出 EditOp[] 或生成请求 → 调用 applyEditOps 或 createFlow → 校验落盘；可选待审核/A/B。 | LLM 仅输出操作序列或生成请求，由机制执行；无整棵 JSON 照单全收。 |

---

## 十五、文档与主计划衔接

- 本文档可作为**后续 Phase（建议 Phase 13）**的正式设计依据；工单编号 WO-BT-xxx 与现有 WO-xxx 区分，便于追踪。  
- 实现前建议：确认 Phase A 工单与现有 Gateway、config、tools 的接口（如 getMergedTools、appendOpLog、loadConfig）无冲突；Phase A 完成后即可获得「零 Token 流程执行」的最小闭环。  
- 动态构建与经验迭代（Phase C、D）可在 Phase A/B 稳定后再上，并视需要开关 `dynamicGeneration`、`experience.enabled`。

---

*本文档为行为树与状态机设计的完整说明；具体实现以工单与代码为准，安全与审计策略与现有项目保持一致。*
