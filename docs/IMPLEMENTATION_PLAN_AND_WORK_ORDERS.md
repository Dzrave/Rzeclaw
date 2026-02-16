# Rzeclaw 实现计划与工单安排

本文档结合《优化与自我进化设计》与《长期记忆系统设计》两份设计稿，给出**实现计划**与**工单（Work Order）**安排。实现顺序按依赖关系排列，工单拆解到可单独实现、可验收的粒度，避免遗漏，并保持最小轻量版本的约束。

---

## 一、实现原则与约束

| 原则 | 说明 |
|------|------|
| **依赖先行** | 底层存储、Schema、接口先于上层管道与 Agent 集成。 |
| **可验收** | 每个工单有明确完成条件与验收标准。 |
| **最小轻量** | 不引入非必要依赖；存储优先 SQLite/JSON 文件；检索优先关键词/简单相似度，向量可选。 |
| **稳定可追溯** | 记忆只增不篡改；日志与写入可审计；错误可回溯。 |

---

## 二、阶段总览与依赖关系

```
Phase 0: 工具与可观测性（无记忆依赖）
    ├── 工具：描述+示例、参数校验+结构化错误、结果压缩、意图→工具提示
    └── 运行日志 + 轻量指标

Phase 1: 记忆底座 + L0 上下文效率
    ├── 记忆 Schema + 存储层接口（L1/L2 表与 append/query/get_provenance）
    ├── 配置扩展（memory 开关、存储路径、隔离维度）
    └── L0：固定窗口 + 按轮摘要（会话内，不写记忆）

Phase 2: L1 写入与检索 + Agent 接入
    ├── L1 写入管道（会话结束/阈值时生成摘要与事实并 append）
    ├── 会话级「学到了什么」写入文件（与 L1 摘要同源或首条）
    ├── 记忆检索服务（按条件查 L1，返回带 provenance 的列表）
    ├── 检索结果格式化为带引用的上下文块
    └── Agent：每轮前检索并注入 +「仅基于记忆作答」约束

Phase 3: 任务感知 + L2 + 隔离与安全
    ├── 任务/意图识别（当前轮 task_hint）+ 写入时带 task_hint
    ├── 任务感知检索（条件含 task 相关度或过滤）
    ├── L2 存储与从 L1 的推进（去重、冲突检测、supersedes_id/validity）
    └── 按 workspace_id（及可选 user_id）隔离 + 写入审计

Phase 4: 智能行为与自我进化收尾
    ├── 目标锚定、执行后反思、错误恢复建议（含轻量规划可选）
    ├── Bootstrap 文档（只读或用户确认追加）、Prompt 改进建议文件
    ├── 会话快照与恢复（可选）
    └── 冷归档与审计日志（可选）
```

---

## 三、Phase 0：工具与可观测性（无记忆依赖）

**目标**：提升工具调用准确率与可观测性，为后续「会话内自纠错」和「指标分析」打基础。

| 工单 ID | 工单名称 | 依赖 | 范围 | 验收标准 |
|---------|----------|------|------|----------|
| **WO-001** | 工具描述与示例 + 意图→工具映射 | 无 | 为每个 CORE_TOOLS 补充「何时用、典型用法、易错点」及 1～2 个 JSON 示例；在 system prompt 中注入「意图→推荐工具」简短表（如改文件→edit、执行命令→bash、看文件→read）。 | 1) 每个工具在代码或配置中有 description + examples 字段或等价内容；2) Agent system 中包含意图→工具表；3) 单轮调用工具选型正确率可人工抽查。 |
| **WO-002** | 工具参数校验与结构化错误 | 无 | 在现有各 tool handler 外增加一层校验：路径是否在 workspace 内、必填是否缺失、类型是否正确；失败时返回统一结构 `{ code, message, suggestion }`（如 PATH_OUTSIDE_WORKSPACE + 建议「请使用相对 workspace 的路径」）。 | 1) 每个工具调用前执行校验；2) 失败时返回含 code/message/suggestion 的结构；3) Agent 收到的 tool_result 中错误可被解析并展示建议。 |
| **WO-003** | 工具结果压缩 | 无 | 对 bash/read 等可能长输出：设定最大字符/行数，超出部分截断并保留尾部 + 说明「前省略 N 字/行，后保留 M 字/行」。write/edit 可保持短结果。 | 1) bash/read 输出超过阈值时被截断并带省略说明；2) 阈值可配置或常量；3) 不改变语义正确性。 |
| **WO-004** | 运行日志与轻量指标 | 无 | 结构化日志：每轮记录 session_id、轮次、用户消息长度、模型响应长度、工具调用列表及结果状态（成功/失败）、耗时、可选 token 数。轻量指标：每会话汇总工具调用次数、失败次数、总轮数；可写 JSON 文件或追加到日志。 | 1) 每轮有结构化日志条目；2) 会话结束可输出或持久化该会话的汇总指标；3) 不依赖外部服务，本地文件即可。 |

**产出物**：  
- `src/tools/validation.ts`（或各工具内校验逻辑）、`src/tools/compress.ts`（或各工具内压缩）；  
- `src/prompts/` 或内联的 system 增强（工具表 + 意图表）；  
- `src/observability/logger.ts`、`src/observability/metrics.ts`（或等价模块）。

---

## 四、Phase 1：记忆底座 + L0 上下文效率

**目标**：定义记忆数据结构与存储接口；实现会话内 L0 的上下文裁剪与摘要，不写 L1/L2。

| 工单 ID | 工单名称 | 依赖 | 范围 | 验收标准 |
|---------|----------|------|------|----------|
| **WO-101** | 记忆单元 Schema 与类型定义 | 无 | 定义 TypeScript 类型/接口：MemoryEntry（id, content, content_type, provenance, task_hint?, validity?, created_at, supersedes_id?）；Provenance（source_type, session_id, turn_index?, message_id?, quote_start?, quote_end?）。content_type 枚举：fact | summary | preference | task_outcome | tool_experience。 | 1) 类型与两文档一致；2) 可在代码中 import 并用于后续存储与检索。 |
| **WO-102** | 记忆存储层接口与 SQLite 实现 | WO-101 | 定义接口：append(entry), query_by_condition(conditions), get_provenance(id)。conditions 含：content_type?, validity?, session_id?, task_hint?(关键词匹配), created_after?, workspace_id?。实现基于 SQLite 的存储：单库或按 workspace 分文件；表结构包含上述字段；append 仅 INSERT。 | 1) 接口与实现分离（可后续换存储）；2) append 不覆盖；3) query 返回 MemoryEntry[]；4) get_provenance 按 id 返回 provenance。 |
| **WO-103** | 配置扩展（memory 与存储路径） | 无 | 在 RzeclawConfig 中增加：memory.enabled?, memory.storagePath?, memory.workspaceId?（或默认从 workspace 路径派生）。若未配置则记忆相关逻辑不启用。 | 1) 配置可读；2) Agent/Gateway 可据此判断是否启用记忆。 |
| **WO-104** | L0 固定窗口与轮次上限 | 无 | 会话消息列表只保留「最近 N 轮」完整消息（N 可配置，默认如 5）；超过部分不传给模型。若存在「首条用户目标」，可单独保留一份 goal 文本。 | 1) 传入模型的 messages 仅包含最近 N 轮；2) 可选保留首条目标摘要。 |
| **WO-105** | L0 按轮摘要生成与注入 | WO-104 | 每 M 轮（或会话轮次达到 M 时）调用一次摘要：将「当前已发生的事、当前状态、未完成目标」压成一段固定长度摘要；下一轮上下文 = 该摘要 + 最近 1～2 轮原文。摘要仅存于会话内存，不写 L1。 | 1) 达到阈值时生成摘要；2) 上下文组成符合「摘要 + 最近轮」；3) 不增加持久化。 |

**产出物**：  
- `src/memory/types.ts`、`src/memory/schema.ts`；  
- `src/memory/store-interface.ts`、`src/memory/store-sqlite.ts`；  
- `src/config.ts` 扩展；  
- `src/agent/context.ts` 或等价：L0 窗口与摘要逻辑。

---

## 五、Phase 2：L1 写入与检索 + Agent 接入

**目标**：会话结束或达到阈值时把 L0 产出写入 L1；提供检索并格式化为带引用块；Agent 每轮前检索并注入，并约束「仅基于记忆作答」。

| 工单 ID | 工单名称 | 依赖 | 范围 | 验收标准 |
|---------|----------|------|------|----------|
| **WO-201** | L1 写入管道（会话结束/阈值） | WO-101, WO-102, WO-103, WO-105 | 触发：会话正常结束、或轮次达到阈值、或用户显式「记住这个」。从当前 L0（最近 N 轮或摘要+轮）用模型或规则生成：1) 会话摘要（一段）；2) 若干条事实/决策/偏好。每条写入 L1 时带完整 provenance（session_id, turn_range, source_type），生成唯一 id，调用 store.append。 | 1) 触发条件可配置且生效；2) 每条写入带 id 与 provenance；3) 不覆盖已有数据。 |
| **WO-202** | 会话级「学到了什么」写文件 | WO-201 | 在 L1 写入管道同一流程中，将会话摘要（或首条事实）同时写入本地文件，如 `workspace/.rzeclaw/session_summaries/<session_id>.md`，供人工或后续只读。不自动写回 system/配置。 | 1) 会话结束有对应文件；2) 内容与 L1 摘要一致或同源。 |
| **WO-203** | 记忆检索服务（按条件查 L1） | WO-102 | 实现 retrieve(query, options)：query 为文本或关键词；options 含 workspace_id, limit, content_type?, validity?（默认仅 active）。查询 L1 表，返回 MemoryEntry[]（含 id, content, provenance）。可选：简单关键词匹配或 SQLite FTS。 | 1) 返回条目不超 limit；2) 每条含 id、content、provenance；3) validity 过滤正确。 |
| **WO-204** | 检索结果格式化为带引用块 | WO-203 | 将 MemoryEntry[] 格式化为可注入上下文的文本，形如：`[Memory#id] (来自 session_xxx 第 N 轮) content`。并生成一句 system 指令：「以下为长期记忆，请仅基于此作答；引用时标明 Memory#id。」 | 1) 格式符合设计；2) 可直接拼进 system 或 user。 |
| **WO-205** | Agent 每轮前检索并注入 + 引用约束 | WO-203, WO-204 | 在 runAgentLoop 开始时，若 memory.enabled：调用 retrieve(当前用户消息, { limit: K })；将格式化后的块注入 system（或 user 首条）；在 system 中增加「仅基于上述记忆作答，无法回答时说明记忆中无相关信息」。 | 1) 启用记忆时每轮执行检索；2) 上下文包含记忆块与约束说明；3) 不启用时行为与现有一致。 |

**产出物**：  
- `src/memory/write-pipeline.ts`（L1 写入）；  
- `src/memory/retrieve.ts`（检索 + 格式化）；  
- `src/agent/loop.ts` 修改（检索注入 + system 约束）；  
- 会话摘要文件目录与格式约定。

---

## 六、Phase 3：任务感知 + L2 + 隔离与安全

**目标**：任务/意图识别与任务感知检索；L2 存储与从 L1 的推进（去重、冲突、supersedes）；按 workspace 隔离与审计。

| 工单 ID | 工单名称 | 依赖 | 范围 | 验收标准 |
|---------|----------|------|------|----------|
| **WO-301** | 任务/意图识别（当前轮 task_hint） | 无 | 在当前用户消息上做任务标签抽取：规则（关键词）或极简模型。输出短句或关键词作为 current_task_hint。在 L1 写入时，每条事实带 task_hint（来自该轮或近期轮）。 | 1) 每轮可得到 current_task_hint；2) 写入 L1 的条目带 task_hint 字段。 |
| **WO-302** | 任务感知检索 | WO-203, WO-301 | 检索条件增加 task 相关度：如 task_hint 与 current_task_hint 关键词重叠则加分，或 WHERE task_hint LIKE %current_task%。结果按相关度与时间排序。 | 1) 检索 API 接受 task_hint 参数；2) 结果排序考虑任务相关度。 |
| **WO-303** | L2 表与从 L1 推进 | WO-102 | 新增 L2 表（或同一表加 layer='L2'）；从 L1 推进逻辑：去重（与已有 L2 内容相似度高于阈值则跳过）、冲突检测（与已有事实矛盾则写新条且新条 supersedes_id=旧 id，旧条 validity=contradicted）。 | 1) L2 可存储且可查；2) 推进规则明确；3) 不静默覆盖。 |
| **WO-304** | supersedes_id 与 validity 管理 | WO-101, WO-102, WO-303 | 支持写入时设置 supersedes_id 与旧条 validity 更新；检索默认只返回 validity=active；可选返回「已被替代」条并标注。 | 1) 修正/否定流程可走通；2) 检索过滤正确。 |
| **WO-305** | 按 workspace_id 隔离与写入审计 | WO-102, WO-103 | 所有 append/query 带 workspace_id（及可选 user_id）；存储层按 workspace 过滤。写入时记录审计信息：who（session）、when、from_where（session_id），可写审计表或日志。 | 1) 不同 workspace 数据隔离；2) 每次写入有审计记录。 |

**产出物**：  
- `src/memory/task-hint.ts`（任务识别）；  
- `src/memory/retrieve.ts` 扩展（任务感知）；  
- `src/memory/l2.ts` 或 store 扩展（L2、去重、冲突）；  
- 存储层与审计字段/表。

---

## 七、Phase 4：智能行为与自我进化收尾

**目标**：目标锚定、执行后反思、错误恢复建议；Bootstrap 文档与 Prompt 建议文件；可选会话快照与冷归档。

| 工单 ID | 工单名称 | 依赖 | 范围 | 验收标准 |
|---------|----------|------|------|----------|
| **WO-401** | 目标锚定 | WO-104, WO-105 | 在会话开始时从首条用户消息抽取「主要目标」并保留；每轮或每 N 轮在上下文中显式注入「当前会话目标：…」，减少跑题。 | 1) 首条可解析出目标；2) 目标在后续轮中可见。 |
| **WO-402** | 执行后反思与错误恢复建议 | WO-002 | 每 K 次工具调用后，在 user 或 system 中插入一句反思提示：「根据上一步结果，是否达成子目标、是否需要重试或换策略。」工具错误时除结构化错误外，在 prompt 中强调「请根据建议重试或换方案」。 | 1) K 可配置；2) 反思提示确实插入；3) 错误建议已在 WO-002 中。 |
| **WO-403** | 轻量规划（可选） | 无 | 对复杂请求（可配置或启发式判断），先让模型输出「步骤列表」不执行，再按步执行并每步更新「已完成/未完成」。可约束最大步数。 | 1) 可选开启；2) 步骤列表与执行分离；3) 不破坏现有单轮流程。 |
| **WO-404** | Bootstrap 文档（只读或确认追加） | 无 | 维护 `WORKSPACE_BEST_PRACTICES.md`（或配置路径）；会话中模型可只读该文件；可选：用户确认后追加「本次会话的一条经验」到文档末尾。 | 1) 只读可被注入；2) 追加需明确确认且仅追加不删改。 |
| **WO-405** | Prompt 改进建议写入文件 | WO-201 | 会话结束或定期，让模型输出「若改进 system/工具描述，建议…」的文本，写入如 `workspace/.rzeclaw/prompt_suggestions.md`（追加），不自动应用。 | 1) 建议写入指定文件；2) 不修改实际 prompt。 |
| **WO-406** | 会话快照与恢复（可选） | WO-104, WO-105 | 定期将会话状态（摘要 + 最近轮 + 可选工具注册）序列化到文件；恢复时从文件加载并继续。 | 1) 快照可写可读；2) 恢复后对话可继续。 |
| **WO-407** | 冷归档与审计日志（可选） | WO-102, WO-305 | L1 超过一定时间未检索的条目可移入冷表或冷文件，仍可查但不在默认热检索路径。审计日志可单独查询与导出。 | 1) 冷热分离可配置；2) 审计可追溯。 |

**产出物**：  
- `src/prompts/` 或 agent 内目标/反思/规划逻辑；  
- `src/evolution/bootstrap-doc.ts`、`src/evolution/prompt-suggestions.ts`；  
- `src/session/snapshot.ts`（可选）；  
- 冷归档与审计查询（可选）。

---

## 八、工单依赖图（简要）

```
WO-001, WO-002, WO-003, WO-004  [Phase 0，无依赖]
WO-101, WO-103, WO-104          [Phase 1 基础]
WO-102 ← WO-101
WO-105 ← WO-104

WO-201 ← WO-101, WO-102, WO-103, WO-105
WO-202 ← WO-201
WO-203 ← WO-102
WO-204 ← WO-203
WO-205 ← WO-203, WO-204

WO-301
WO-302 ← WO-203, WO-301
WO-303 ← WO-102
WO-304 ← WO-101, WO-102, WO-303
WO-305 ← WO-102, WO-103

WO-401 ← WO-104, WO-105
WO-402 ← WO-002
WO-403
WO-404
WO-405 ← WO-201
WO-406 ← WO-104, WO-105
WO-407 ← WO-102, WO-305
```

---

## 九、建议实现顺序（按批次）

| 批次 | 工单 | 说明 |
|------|------|------|
| **1** | WO-001, WO-002, WO-003, WO-004 | Phase 0 一次完成，工具与可观测性。 |
| **2** | WO-101, WO-102, WO-103, WO-104, WO-105 | Phase 1：Schema、存储、配置、L0 窗口与摘要。 |
| **3** | WO-201, WO-202, WO-203, WO-204, WO-205 | Phase 2：L1 写入、检索、格式化、Agent 接入。 |
| **4** | WO-301, WO-302, WO-303, WO-304, WO-305 | Phase 3：任务识别、任务检索、L2、隔离与审计。 |
| **5** | WO-401, WO-402, WO-403, WO-404, WO-405 | Phase 4 核心：目标、反思、规划、Bootstrap、建议文件。 |
| **6** | WO-406, WO-407 | 可选：快照、冷归档与审计增强。 |

---

## 十、验收与回归要求

- 每完成一个工单：单元测试或手工用例覆盖该工单验收标准；若涉及 Agent，保留「无记忆 / 有记忆」两种路径的兼容。
- 每完成一个 Phase：做一次小回归（如：agent 单轮、多轮、会话结束是否写 L1、检索是否返回预期）。
- 保持最小轻量：不新增运行时依赖（如向量库）除非 Phase 3/4 明确选用；存储默认 SQLite + 文件。

本文档可作为开发与排期的唯一工单来源，按批次顺序执行即可覆盖两篇设计稿中的全部实现点，且依赖关系与顺序正确、无遗漏。
