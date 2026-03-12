# RAG 与复盘机制详细设计

本文档在 **RAG设计总结与智能体对接讨论.md** 与 **docs/RAG相关内容** 的基础上，给出**可落地的详细设计**：双轨 RAG 架构、动机 RAG、外源 RAG、向量层与配置、复盘机制（系统梦境 + 架构师 Agent）、遥测与安全策略，及与 Router/Executor/会话 FSM、内嵌小模型、行为树设计的对接约定。**仅设计不实现**；实现以主计划与工单为准。

**相关文档**：`RAG相关内容`（原始讨论）、`RAG设计总结与智能体对接讨论.md`（总结与对接要点）、`BEHAVIOR_TREE_AND_STATE_MACHINE_DESIGN.md`（路由与流程库）、`内嵌小模型选型与可行性讨论.md`（localModel / vectorEmbedding 接口）。

---

## 一、目标与范围

### 1.1 设计目标

| 目标 | 说明 |
|------|------|
| **双轨 RAG 分离** | 内源性 RAG（系统进化、肌肉记忆）与外源性 RAG（领域知识）在存储、集合、检索入口上严格分离，避免上下文污染并支撑垂类/多 Agent。 |
| **用户绝对开放性** | 内源 RAG 底层可读、可编辑、可热重载；用户可查看、修改、勾选启用/禁用各集合。 |
| **动机 RAG** | 在最前端实现「模糊自然语言 → 标准事件/flowId」的零 Token 翻译，与 Router、router_v1、会话 FSM 统一数据流。 |
| **复盘机制** | 离线/定时运行，通过遥测分析对 RAG、BT/FSM、路由与 Agent 职责做修剪与优化，产出补丁经人工确认后合并。 |

### 1.2 范围与边界

- **在范围内**：内源/外源/动机 RAG 的**集合划分、存储形态、检索接口、与 Router/intentClassifier 的调用顺序**；vectorEmbedding 与 RAG 集合的**配置映射**；复盘触发时机、架构师 Agent 职责与可修改范围、遥测日志 schema、PR 审批流与早报。
- **不在范围内**：具体向量库选型（如 ChromaDB）的实现细节、复盘用 LLM 的 prompt 模板、前端早报 UI；这些留待实现阶段与工单规定。

### 1.3 术语表（固定约定）

| 术语 | 含义 |
|------|------|
| **内源 RAG** | 系统在使用中产生的、与进化相关的数据：动态上下文摘要、Skill/flow 元信息与描述、路由命中记录、**动机 RAG 条目**；用户可查看、修改、维护；对应「程序性记忆（怎么做）」。 |
| **外源 RAG** | 用户外接的领域/垂直知识（文档、设定、规则书等）；多集合/命名空间；用于执行时知识增强与垂类 Agent；用户负责灌入与维护；对应「语义性记忆（是什么）」。 |
| **动机 RAG** | 内源 RAG 的**子集**，专门存储「模糊意图表述 → 标准事件 / flowId + params」的映射；部署在入口最前端，与 Router、router_v1 对接。 |
| **集合（Collection）** | 向量索引与检索的最小逻辑单位；每个集合对应一类数据（如 `motivation`、`skills`、`flows`、`external_docs`），有独立 enabled 开关与可选存储路径。 |

---

## 二、双轨 RAG 架构详细设计

### 2.1 内源性 RAG

#### 2.1.1 存储内容与集合划分

| 子类型 | 存储内容 | 建议集合名 | 说明 |
|--------|----------|------------|------|
| **动机 RAG** | 模糊表述簇 + 翻译后事件/flowId + 可选 context_requirement | `motivation` | 见 §三；入口检索，命中则零 Token 派发。 |
| **技能/流程库** | Skill 描述、flow 元信息（id、描述、参数 schema）、成功案例摘要 | `skills`、`flows` | 路由与经验迭代时检索「有没有现成 flow/Skill」；与流程库（libraryPath）的 JSON 可映射或从元数据生成。 |
| **路由肌肉记忆** | 意图识别高频命中记录（如 hint + flowId + 成功率） | 可并入 `flows` 或单独 `routing_stats` | 经验迭代用；检索时可作「同意图优选 flow」的参考。 |
| **动态上下文（短期）** | 黑板摘要、近期 N 次对话微缩摘要 | 可选 `context_summary` | 若做「节点级/flow 级上下文」时可从黑板或会话摘要写入；检索为执行中的 flow 提供近期上下文。 |

内源 RAG 的**物理存储**设计原则：

- **拒绝黑盒**：向量库仅存 embedding + 元数据指针；**原始可读内容**存于纯文本或 JSON（如 `~/.rzeclaw/rag/endogenous/motivation/*.json`、与流程库同目录的 meta 或独立 index 描述）。
- **配置即代码**：用户可直接编辑 JSON/文本，保存后通过**热重载**触发重新 embedding 与索引更新（见 §2.1.3）。
- **路径约定**：建议在内源根目录下分子目录或按集合名分文件，便于备份与版本管理；具体路径由配置 `rag.endogenous.storagePath` 或各 collection 的 `pathOverride` 决定。

#### 2.1.2 内源集合与 vectorEmbedding 的对应

与 **内嵌小模型选型与可行性讨论.md §7.2** 对齐：内源 RAG 使用**同一套** vectorEmbedding 接口（embed、search），集合名与配置中的 `vectorEmbedding.collections` 对应：

- `motivation` → 动机 RAG 条目。
- `skills` → Skill 描述与元信息。
- `flows` → flow 描述与元信息。
- 可选 `logs`、`context_summary` 等由配置启用。

**用户可勾选**：每个内源集合在 `vectorEmbedding.collections.<name>.enabled` 下可单独开关；总开关 `vectorEmbedding.enabled` 关闭时，所有 RAG 检索（含动机）不执行。

#### 2.1.3 热重载机制

- **触发**：用户修改内源下的 JSON/文本后，可（1）由文件监听（watch）自动触发，（2）或由显式 API/命令触发（如 `POST /rag/reindex` 或 CLI `rzeclaw rag reindex --collection motivation`）。
- **动作**：对变更的集合执行「读取可读源 → embed → 更新向量索引」；不改变原始文件格式，仅更新索引。
- **一致性**：若流程库中某 flow 被 replace/applyEditOps，对应 `flows` 集合的索引应在流程库写入成功后触发更新（或由复盘/异步任务统一刷新）。

### 2.2 外源性 RAG

#### 2.2.1 命名空间与多集合

- 外源 RAG 按**命名空间（集合）**划分，例如：`external_docs`、`domain_game_dev`、`domain_narrative` 等；集合名由用户配置，可多个。
- 每个集合对应：一份或多份用户灌入的文档/文本、以及可选的存储路径（如 `rag.exogenous.collections.domain_game_dev.path`）。
- **知识隔离**：执行时（Agent 或 flow 内某节点）仅检索**当前绑定**的集合，避免代码文档与叙事设定混检。

#### 2.2.2 与 Agent / flow 的绑定（当前阶段与未来）

- **当前阶段（单会话、多 flow）**：  
  - 在 flow 元数据或节点参数中可声明「本 flow 使用的外源集合列表」（如 `externalCollections: ["domain_game_dev"]`）；  
  - 执行器在执行该 flow 时，RAG 检索仅在这些集合内进行；若未声明则可不检索外源或使用配置中的默认集合。
- **未来多 Agent 实体**：  
  - Agent 蓝图可配置 `boundExogenousCollections: ["domain_xxx"]`，该 Agent 实例执行时只访问这些外源集合；与《智能体相关》中「代码 Agent / 叙事 Agent 各挂不同 RAG」一致。

#### 2.2.3 外源集合在配置中的形态

- 在 **vectorEmbedding.collections** 下可扩展「外源」集合：命名与内源区分（如内源用 `motivation`/`skills`/`flows`，外源用 `external_*` 或用户自定义）。
- 每个外源集合需：`enabled`、可选 `path`（灌入文档的目录或索引路径）、可选 `provider` 覆盖（若该集合使用独立嵌入服务）。
- 外源 RAG 的**灌入与更新**由用户或独立导入脚本完成；系统可提供「从目录/文件列表生成 chunk 并 embed」的接口，但具体格式与分块策略属实现细节。

### 2.3 双轨协同流程（数据流）

1. **入口**：用户消息进入 Gateway → **动机 RAG 检索**（若启用）；命中则得到 `router_v1` 兼容结果（state + flowId + params），直接进入 Executor 或 Event Bus，**不调用 LLM 与 intentClassifier**。
2. **未命中动机**：进入 **Router**：规则匹配 → 若仍未命中且启用 **intentClassifier** → 本地小模型得到 router_v1；可选将「内源 skills/flows 检索结果」作为 prompt 上下文，提升小模型选 flow 的准确率。
3. **执行 flow 时**：若 flow 或节点需要领域知识，调用**外源 RAG 检索**（仅限该 flow 绑定的集合），结果注入 LLM 或工具上下文。
4. **执行成功后**：可选「反哺内源」——将本次成功路径摘要写入 `skills`/`flows` 或新 flow 入库并更新内源索引；与 BT 文档中的「进化」一致，需经安全策略（沙盒/审批）。

---

## 三、动机 RAG 详细设计

### 3.1 定位与调用顺序（与 Router、intentClassifier 的对接）

**设计决策**：动机 RAG 作为 Router 的**第一优先级数据源**，在规则与 intentClassifier **之前**执行。

- **顺序**：  
  1. **动机 RAG 检索**（若 `vectorEmbedding.enabled` 且 `motivation` 集合 enabled）：用当前用户消息做向量检索，取 top1（或 topK 再按阈值过滤）。  
  2. 若命中且置信度 ≥ 配置的 **motivationThreshold**：直接采用命中条目的 `translated_events` / `flowId` + params，**不再**执行规则匹配与 intentClassifier，产出与 router_v1 兼容的结果送入下游（Executor 或会话 FSM）。  
  3. 若未命中或置信度不足：进入 **Router 规则匹配**；若规则仍未高置信度命中且 **localModel.modes.intentClassifier.enabled**：调用 **intentClassifier** 得到 router_v1，再按 confidenceThreshold 决定走 Executor 还是 runAgentLoop。

这样避免「动机 RAG 与 intentClassifier 重复判断」且保留「先向量快查、再规则、再小模型」的清晰层次。

### 3.2 动机 RAG 条目数据结构（设计级 schema）

每条动机 RAG 条目包含可读部分（用于展示、编辑与 embedding 的文本来源）与结构化输出（用于执行）：

```json
{
  "id": "motivation_001",
  "motivation_cluster": ["项目收尾", "搞定最后一步", "准备发布"],
  "description": "用户表达项目收尾、准备发布时，触发全局 Debug 与打包可执行文件",
  "translated": {
    "state": "ROUTE_TO_LOCAL_FLOW",
    "flowId": "project_wrap_up",
    "params": {},
    "events": [
      { "action": "trigger_skill", "skill_id": "Skill_Global_Debug" },
      { "action": "trigger_skill", "skill_id": "Skill_Build_Executable" }
    ]
  },
  "context_requirement": "需要获取当前项目根目录",
  "confidence_default": 0.85,
  "updated_at": "2026-03-10T12:00:00Z"
}
```

- **motivation_cluster**：一组同义或近义的模糊表述，用于展示与可选的多文本 embedding（可拼接为一段文本做 embed）。  
- **translated**：与 **router_v1** 对齐；必须含 `state`，若为 `ROUTE_TO_LOCAL_FLOW` 则含 `flowId` 与可选 `params`；可选 `events` 供 Event Bus 形态下游消费。  
- **confidence_default**：该条目的默认置信度，检索命中时若未单独算分可直接采用；或由检索相似度换算为 0~1 与 motivationThreshold 比较。

Embedding 来源建议：将 `motivation_cluster` 与 `description` 拼接成一段文本做向量化；检索时用当前用户消息与索引中的该文本做相似度计算。

### 3.3 动机 RAG 的写入（固化）与进化

- **写入时机**：当用户消息**未命中**动机 RAG，且经 **LLM 澄清**后用户确认了「真实意图」时，由系统生成一条新动机条目并写入内源存储，再触发 `motivation` 集合的 embed + 索引更新。  
- **数据来源**：LLM 澄清对话（用户选择或确认的选项）+ 最终执行的 flowId 或 events；系统生成 `motivation_cluster`（可包含用户原句与 LLM 归纳的几种说法）、`translated`、`context_requirement`。  
- **权限**：写入动机 RAG 视为「内源写入」，须经**进化安全策略**（见 §六）：可配置为需用户确认或仅记录审计。

### 3.4 与会话 FSM 的对接

- 动机 RAG 命中后产出的 **state**（如 `ROUTE_TO_LOCAL_FLOW`）应**直接驱动**会话级 FSM 的迁移（与 **智能体设计总结与对接要点** §3.2 一致）：例如 `ROUTE_TO_LOCAL_FLOW` → Local_Intercept 或 Executing_Task，`ESCALATE_TO_CLOUD` → Deep_Reasoning。  
- 会话 FSM 不关心该 state 来自「动机 RAG 命中」还是「intentClassifier 输出」；下游统一按 router_v1 的 state + flowId + params 执行。

---

## 四、向量层与配置详细设计

### 4.1 与 vectorEmbedding 配置的完整对应

在 **内嵌小模型选型与可行性讨论.md §7.2** 基础上，扩展 **collections** 以覆盖内源与外源：

| 集合名 | 类型 | 说明 | 默认 enabled |
|--------|------|------|--------------|
| `motivation` | 内源 | 动机 RAG 条目 | 由用户勾选 |
| `skills` | 内源 | Skill 描述与元信息 | 由用户勾选 |
| `flows` | 内源 | flow 描述与元信息 | 由用户勾选 |
| `logs` | 内源（可选） | 日志/案例摘要 | 默认 false |
| `external_*` 或用户自定义 | 外源 | 领域知识 | 由用户配置并勾选 |

配置示意（设计级，与 §7.2 一致并扩展）：

```json
{
  "vectorEmbedding": {
    "enabled": false,
    "provider": "local-embed",
    "endpoint": "http://127.0.0.1:11434",
    "model": "bge-m3",
    "indexStoragePath": ".rzeclaw/embeddings",
    "collections": {
      "motivation": { "enabled": true, "pathOverride": null },
      "skills": { "enabled": true },
      "flows": { "enabled": true },
      "logs": { "enabled": false },
      "external_docs": { "enabled": true, "path": "~/.rzeclaw/rag/external/docs" }
    },
    "motivationThreshold": 0.75
  }
}
```

- **motivationThreshold**：动机 RAG 检索命中时，相似度（或换算后的 0~1）≥ 该值才采纳，否则继续走规则 + intentClassifier。  
- **pathOverride**：可选；某集合的索引或源数据路径覆盖默认 `indexStoragePath` 下的子目录。

### 4.2 统一检索与嵌入接口（设计级）

对上层暴露的抽象（与 §7.5 一致）：

- **embed(texts: string[]): float[][]**  
- **search(collection: string, query: string, topK: number, filter?: object): { id: string, score: number, metadata?: object }[]**

执行时由配置决定底层 provider（Ollama embed、OpenAI 兼容、BGE-M3 等）；集合名即上述 `collections` 的 key，且仅当 `collections.<name>.enabled === true` 时允许检索。

### 4.3 内源「绝对开放性」的配置与行为

- 内源集合对应的**可读源**路径应对用户可见、可配置（如 `rag.endogenous.motivation.path`）；用户可直接编辑该路径下的 JSON/文本。  
- 热重载/重建索引的入口（CLI 或 API）需在文档中说明，便于用户修改后主动刷新；若实现文件监听，需在配置中可选启用（避免部分环境不支持或性能敏感）。

---

## 五、复盘机制详细设计（系统梦境 + 架构师 Agent）

### 5.1 架构定位与触发

- **系统梦境（System Dreaming）**：复盘为**离线、非实时**的批处理；**不占用**主请求链路（Gateway.chat、Router、Executor、runAgentLoop）。  
- **触发方式**：  
  - **定时**：如每日凌晨固定时间（可配置 `retrospective.cron`），或系统检测到「用户长时间无交互」达阈值。  
  - **主动**：用户发送显式指令（如 `/启动系统复盘` 或等价命令），由 Gateway 或 CLI 解析后投递到复盘队列，异步执行。  
- **执行主体**：**架构师 Agent（Meta-Agent）**——逻辑上为单例、仅负责「读遥测 + 分析 + 生成补丁/报告」，**不直接写库**；所有对流程库、RAG、路由表的**写入**均通过「待审补丁 + 早报 + 用户确认」完成。

### 5.2 遥测日志（Telemetry Log）schema（设计级）

Event Bus 或 Gateway 在运转时，将**对复盘有价值**的事件异步写入遥测日志。建议每条记录包含：

| 字段 | 类型 | 说明 |
|------|------|------|
| `ts` | ISO8601 | 时间戳 |
| `type` | string | 如 `chat`、`flow_start`、`flow_end`、`tool_use`、`rag_retrieve`、`agent_turn` |
| `sessionId` | string? | 会话标识 |
| `flowId` | string? | 若为 flow 相关则必填 |
| `nodeId` | string? | BT 节点 ID（若适用） |
| `success` | boolean? | 是否成功 |
| `durationMs` | number? | 耗时毫秒 |
| `tokenCount` | number? | 本次 LLM 消耗 token（若适用） |
| `ragCollection` | string? | RAG 检索的集合名 |
| `ragScore` | number? | 检索得分（若适用） |
| `intentSource` | string? | 意图来源：`motivation_rag` / `rule` / `intent_classifier` / `none` |
| `payload` | object? | 可选扩展（如 params 摘要、错误码） |

存储建议：`workspace/.rzeclaw/telemetry/events.jsonl` 或按日分片；保留策略（如保留最近 30 天）可配置，复盘任务只读该日志。

### 5.3 针对各模块的复盘动作（设计级）

| 模块 | 复盘动作 | 产出 |
|------|----------|------|
| **动机 RAG** | 扫描条目，用 LLM 做语义聚类；合并重叠意图（如「改 Bug」与「排查代码错误」）为更泛化的一条或合并 `motivation_cluster` | 待审的「动机 RAG 合并/删除」补丁（diff 或 JSON 编辑列表） |
| **内源/外源 RAG** | 分析遥测中 `rag_retrieve` 与 `ragScore`；统计低分或未命中请求，按集合汇总 | 《知识库缺失报告》或「建议补充外源集合 XXX」 |
| **BT/FSM** | 按 flowId/nodeId 统计失败率与耗时；识别「某节点反复失败」或「某分支从未成功」；可选调用 LLM 生成脚本重写或编辑操作序列 | 待审的 `applyEditOps` 或脚本替换补丁（含沙盒测试结果摘要） |
| **路由/Agent 职责** | 分析「某类意图常被派发到 A 却更适合 B」；产出路由表或动机 RAG 的修正建议 | 待审的路由/动机条目修改补丁 |

架构师 Agent **不直接执行** replaceFlow、写 RAG 文件、改路由表；仅输出**结构化补丁 + 自然语言早报摘要**。

### 5.4 PR 审批流与早报

- **补丁存储**：复盘运行结束后，将当次产出的所有补丁写入**待审区**（如 `workspace/.rzeclaw/retrospective/pending/YYYY-MM-DD/`），格式为可读的 diff 或 JSON patch。  
- **早报（Morning Report）**：次日或下次用户活跃时，通过配置的渠道（如 Gateway 推送给客户端、或 CLI 输出、或邮件）发送一条**结构化消息**，包含：  
  - 复盘日期；  
  - 各模块的变更摘要（Token 优化、意图合并、知识盲区建议、脚本重构等）；  
  - 「是否批准应用」的入口（Y/N 或链接）。  
- **人工确认**：用户确认后，系统将待审补丁**按序应用**（调用流程库 API、写 RAG 文件、更新路由表等）；应用失败则记录并可在早报中提示「部分变更应用失败」。  
- **回滚**：应用前可备份当前状态（如流程库版本、RAG 索引）；若支持，可提供「撤销本次复盘应用」的选项。

### 5.5 架构师 Agent 的权限与可修改范围

| 允许 | 禁止 |
|------|------|
| 读取遥测日志、流程库元数据、RAG 索引元数据与可读源 | 直接覆盖流程库主文件、直接覆盖用户 RAG 源文件、修改核心运行时或配置中的敏感项（如 API Key） |
| 生成「对流程库的编辑操作序列」、生成「RAG 条目的合并/删除/新增」补丁、生成《知识库缺失报告》 | 不经用户确认执行任何写操作；不执行危险系统命令或修改非项目约定路径 |
| 调用 LLM 做聚类、脚本重写、编辑序列生成（仅产出，不执行） | 以「架构师」身份参与主链路 chat 或路由决策 |

实现时需将「架构师」的调用与主业务 runAgentLoop、Router、Executor 隔离（如独立进程或独立队列消费），并限制其可读/可写的文件与 API 范围。

---

## 六、安全策略：复盘与进化统一

与 **BEHAVIOR_TREE_AND_STATE_MACHINE_DESIGN.md**（进化安全）、**智能体设计总结与对接要点** §3.4 一致：

- **统一原则**：所有对「流程库、Skill、动机 RAG、内源/外源索引与可读源」的**写入**，均须满足：  
  - **沙盒/测试**：脚本或 flow 变更须在沙盒中执行通过（若有）；  
  - **可选用户确认**：根据配置，进化/复盘产出的变更可设为「必须用户确认后才应用」或「仅记录审计」。  
- **架构师 Agent**：仅生成补丁，不直接写库；应用补丁由**独立应用流程**在用户确认后执行，并记录审计（操作类型、时间、操作者 `retrospective`）。  
- **动机 RAG 固化**：新条目写入时建议记录「由谁触发（LLM 澄清 + 用户确认）」；若需，可配置为「新动机条目需用户勾选通过才写入」。

在 Phase 13 或复盘/进化相关工单中**显式引用**本安全策略，与 BT 文档中的「LLM 只产出编辑序列、由机制校验与落盘」一致。

---

## 七、与 Router、Executor、会话 FSM 的对接汇总

### 7.1 入口数据流（最终约定）

```
Gateway.chat(message)
  → [控制命令] 直接处理?
  → [动机 RAG] vectorEmbedding.enabled && motivation.enabled?
       → search("motivation", message, 1) → 命中且 score ≥ motivationThreshold?
       → 是：产出 router_v1 兼容结果 → Executor 或 Event Bus；结束
  → [Router 规则] matchFlow(message) → matched?
  → [intentClassifier] localModel.modes.intentClassifier.enabled? → 调用本地模型 → router_v1
  → 若 state === ROUTE_TO_LOCAL_FLOW && confidence ≥ threshold → Executor.run(flowId, params)
  → 否则 runAgentLoop(...)
```

### 7.2 router_v1 与动机 RAG 产出的一致性

动机 RAG 命中时产出的 **translated** 必须与 **router_v1** 兼容：含 `state`、必要时 `flowId`、`params`；可选 `events` 供 Event Bus。下游（Executor、会话 FSM）只认 router_v1 形态，不区分来源是动机 RAG 还是 intentClassifier。

### 7.3 会话 FSM 状态迁移

- `ROUTE_TO_LOCAL_FLOW` → Local_Intercept 或 Executing_Task（由实现约定二选一或细分）。  
- `ESCALATE_TO_CLOUD` → Deep_Reasoning。  
- `NO_ACTION` / `UNKNOWN` → 保持 Idle 或按现有 FSM 设计迁移。  
在行为树或 Gateway 设计文档中应有一张 **router_v1.state → 会话 FSM 状态** 的映射表，与本设计保持一致。

---

## 八、实现阶段与工单建议

### 8.1 阶段划分（建议）

| 阶段 | 内容 | 依赖 |
|------|------|------|
| **RAG-1** | 向量层基础：vectorEmbedding 配置扩展、embed/search 抽象、indexStoragePath 与 collections 读写；内源 `skills`/`flows` 的索引与检索（可从流程库元数据生成） | Phase 13 流程库与 Router 基础 |
| **RAG-2** | 动机 RAG：条目 schema、存储路径、动机检索接入 Router 第一优先级、motivationThreshold；固化流程（LLM 澄清后写入） | RAG-1、Router.match |
| **RAG-3** | 外源 RAG：多集合配置、灌入接口、flow/节点绑定集合与检索调用 | RAG-1 |
| **RAG-4** | 复盘机制：遥测 schema 与写入点、离线触发、架构师 Agent 只读分析 + 补丁生成、待审区与早报、用户确认与应用 | RAG-1、流程库 CRUD、RAG 可读源路径 |

### 8.2 文档交叉引用

- 在 **BEHAVIOR_TREE_AND_STATE_MACHINE_DESIGN.md** 或 **MASTER_IMPLEMENTATION_PLAN_AND_PHASES.md** 中增加一节或链接：指向 **RAG相关内容**、**RAG设计总结与智能体对接讨论.md**、**本文档**，说明内源/外源/动机 RAG 与流程库、Router、vectorEmbedding 的对应关系，以及复盘与进化安全的统一策略。  
- 在 **CONFIG_REFERENCE.md**（若存在）或配置示例中补充 `vectorEmbedding.collections`、`motivationThreshold`、`rag.endogenous`、`retrospective.cron` 等设计级配置说明。

---

## 九、小结

本文档给出了**双轨 RAG（内源/外源）**的集合划分、存储与开放性、**动机 RAG** 的入口优先顺序与条目 schema、**向量层**与 vectorEmbedding 配置的完整对应、**复盘机制**的触发与架构师 Agent 职责、**遥测 schema** 与 **PR 审批流**、以及与 **Router/router_v1/会话 FSM** 的对接约定和**统一安全策略**。实现时以本设计为权威参考，具体模块划分与代码以主计划与工单为准。
