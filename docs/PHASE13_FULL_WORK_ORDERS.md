# Phase 13：行为树与状态机 — 完整工单与依赖（防遗漏）

本文档整合 **BEHAVIOR_TREE_AND_STATE_MACHINE_DESIGN.md §十四** 的 WO-BT-001～026、依赖顺序与建议实现优先级，并补充与 **RAG**、**内嵌小模型统一接口** 对接的工单，确保实施无遗漏。执行时以本工单文档与主设计文档为准。

**设计依据**：主设计 §十四（实现阶段与工单拆解）；RAG 见 `RAG与复盘机制详细设计.md` §八；内嵌小模型见 `内嵌小模型选型与可行性讨论.md` §七。

---

## 一、工单总览与优先级

| 优先级 | 阶段 | 工单范围 | 说明 |
|--------|------|----------|------|
| **P0** | Phase A | WO-BT-001～007 | 基础设施：配置、流程库加载、路由、FSM/BT 引擎、Gateway 集成、审计；**最小零 Token 闭环** |
| **P1** | Phase B | WO-BT-008～011 | BT 完善：Condition、BT/FSM 互嵌、resultOf 占位符 |
| **P2** | Phase C | WO-BT-012～014 | 动态构建：轨迹生成 FSM/BT、LLM 触发生成 flow |
| **P3** | Phase D | WO-BT-015～018 | 经验迭代：outcomes、路由优选、元数据、失败分支替换 |
| **P4** | Phase E | WO-BT-019～020 | 文档与端到端验收 |
| **P5** | Phase F | WO-BT-021～024 | 会话级 FSM、黑板、LLM 兜底节点、进化插入树 |
| **P6** | Phase G | WO-BT-025～026 | 流程库底层机制（CRUD + applyEditOps）、拓扑自我迭代 |
| **可选** | 内嵌/ RAG | WO-LM-001～004、RAG-1～4 | 本地模型接口、动机 RAG、外源 RAG、复盘（见下文） |

---

## 二、Phase A～G 工单明细（WO-BT-001～026）

与主设计 **§十四** 一致，仅列编号与要点；验收标准见主设计。

### Phase A：基础设施（P0）

| 工单 | 内容要点 | 依赖 |
|------|----------|------|
| **WO-BT-001** | 配置：`config.flows` 类型与 loadConfig 解析；`flows.enabled`、`libraryPath`、`routes` | 无 |
| **WO-BT-002** | 流程库加载：从 workspace/&lt;libraryPath&gt; 读 JSON，解析 FlowDef（BT/FSM），校验 id/type/root|states | 001 |
| **WO-BT-003** | 路由：`matchFlow(message, context)`，hint + routes 返回 `{ flowId, params } \| null`；slotRules（正则） | 002 |
| **WO-BT-004** | FSM 引擎：按 JSON 执行 action 序列、transitions、调 tool handler、占位符、返回 content + success | 002 |
| **WO-BT-005** | BT 引擎：Sequence/Selector/Fallback + Action；Action 调 tool handler；占位符；返回 content + success | 002 |
| **WO-BT-006** | Gateway 集成：chat 入口调 router；匹配则 executor（FSM/BT 分发），回复写 session，不调 runAgentLoop | 003,004,005 |
| **WO-BT-007** | 审计与安全：flow 内 tool 调用经 validation/dangerous/permission/appendOpLog，标注 source=flow、flowId | 006 |

**建议顺序**：001 → 002 → 003；004 与 005 可并行 → 006 → 007。

### Phase B：BT 完善与 FSM 互嵌（P1）

| 工单 | 内容要点 | 依赖 |
|------|----------|------|
| **WO-BT-008** | Condition 节点：fileExists、env 等谓词；BT 引擎按结果分支 | A |
| **WO-BT-009** | BT 内嵌 FSM：FSM 节点类型，调 FSM 引擎，结果映射 success/failure | A |
| **WO-BT-010** | FSM 内嵌 BT（可选）：state.action 支持 `runFlow: "bt_flowId"` | A |
| **WO-BT-011** | resultOf 占位符：`{{resultOf.<nodeId>}}`，引擎维护 nodeId→lastResult | A |

### Phase C：动态构建（P2）

| 工单 | 内容要点 | 依赖 |
|------|----------|------|
| **WO-BT-012** | 从轨迹生成 FSM：ops/会话工具序列 → FSM JSON → 入库并绑定 hint | A |
| **WO-BT-013** | 从轨迹生成 BT：工具序列 → Sequence/Fallback → 入库 | A |
| **WO-BT-014** | LLM 触发生成 flow：LLM 输出生成请求 → createFlow(spec) 校验落盘 | A，且需 Phase G 的 createFlow |

### Phase D：经验迭代（P3）

| 工单 | 内容要点 | 依赖 |
|------|----------|------|
| **WO-BT-015** | 执行结果记录：outcomes.jsonl（flowId、params 摘要、success、ts） | A |
| **WO-BT-016** | 路由优选：同一 hint 多 flowId 时按 outcomes 成功率排序 | 015 |
| **WO-BT-017** | 元数据更新：flow 的 successCount、failCount、lastUsed | 015 |
| **WO-BT-018** | 失败分支标记与替换：LLM 输出 EditOp[]，applyEditOps 写回 | A，且需 Phase G |

### Phase E：文档与验收（P4）

| 工单 | 内容要点 | 依赖 |
|------|----------|------|
| **WO-BT-019** | CONFIG_REFERENCE 补充 flows；README/USAGE 增加流程执行与验证 | A |
| **WO-BT-020** | 端到端验收：启用 flows、匹配消息零 LLM、不匹配走 Agent | A |

### Phase F：会话级 FSM、黑板、进化插入树（P5）

| 工单 | 内容要点 | 依赖 |
|------|----------|------|
| **WO-BT-021** | BT 内 LLM 兜底节点：Selector/Fallback 最右子节点可为 LLM，左侧全失败时唤醒 | A |
| **WO-BT-022** | 黑板：session.blackboard；BT/FSM 与 runAgentLoop 读写；buildContextMessages 取槽 | A |
| **WO-BT-023** | 会话级 FSM：sessionState、迁移表；chat 入口先迁移再路由；Idle/Local_Intercept/Executing_Task/Deep_Reasoning | A |
| **WO-BT-024** | 进化插入树：脚本+节点 JSON、沙盒通过后注册 Tool、插入 Selector 左侧、热更新 | 022, 025 |

### Phase G：流程库底层机制与拓扑自我迭代（P6）

| 工单 | 内容要点 | 依赖 |
|------|----------|------|
| **WO-BT-025** | 流程库 CRUD + applyEditOps（insertNode、removeNode、replaceSubtree 等）；校验、版本、审计 | A |
| **WO-BT-026** | 拓扑自我迭代：触发 → LLM 输出 EditOp[] 或生成请求 → applyEditOps/createFlow → 校验落盘 | 025 |

**说明**：WO-BT-014、018 依赖 Phase G 的 createFlow/applyEditOps，实现时可先做 025 再补 C/D 中依赖 025 的项，或 Phase C/D 先做不依赖 025 的部分。

---

## 三、与内嵌小模型对接的补充工单（可选）

实现「规则路由 + 可选本地小模型意图分类」时，在 Phase A 之后可按需接入。设计见 `内嵌小模型选型与可行性讨论.md` §七。

| 工单 ID | 内容要点 | 依赖 | 状态 |
|---------|----------|------|------|
| **WO-LM-001** | 配置：`localModel`、`vectorEmbedding` 的 TypeScript 类型与 loadConfig 解析；enabled、provider、endpoint、model、modes、collections | 无（可与 WO-BT-001 并行或稍后） | ✅ 已实现（config.ts LocalModelConfig、IntentClassifierModeConfig、loadConfig；vectorEmbedding 见 RAG-1） |
| **WO-LM-002** | 本地推理客户端：按 provider（ollama/openai-compatible）调用本地 HTTP API；超时与错误处理；不随包分发模型 | 001 | ✅ 已实现（local-model/client.ts localModelComplete） |
| **WO-LM-003** | intentClassifier 对接 Router：matchFlow 未命中且 intentClassifier.enabled 时调本地模型；解析 router_v1（state、flowId、confidence）；≥ threshold 则走 Executor | WO-BT-003, 002 | ✅ 已实现（Gateway 动机 RAG→规则→意图分类；四类边界与回退见 CONFIG_REFERENCE） |
| **WO-LM-004** | vectorEmbedding：embed(texts)、search(collection, query, topK) 抽象；按配置 provider 调用本地嵌入服务；仅当 vectorEmbedding.enabled 时启用 | 001 | ✅ 已由 RAG-1 实现（rag/embed-client、store、index） |

**router_v1 schema**（与设计一致）：`{ state: "ROUTE_TO_LOCAL_FLOW"|"ESCALATE_TO_CLOUD"|"NO_ACTION"|"UNKNOWN", flowId?, params?, confidence, reason? }`。

---

## 四、与 RAG 对接的补充工单（可选，RAG-1～4）

与 `RAG与复盘机制详细设计.md` §八 对应；可在 Phase 13 Phase A 稳定后实施。

| 阶段 | 内容要点 | 依赖 | 状态 |
|------|----------|------|------|
| **RAG-1** | 向量层基础：vectorEmbedding 配置扩展、embed/search 实现、indexStoragePath 与 collections；内源 skills/flows 索引与检索（可从流程库元数据生成） | Phase 13 流程库与 Router 基础（WO-BT-002, 003） | ✅ 已实现（src/rag） |
| **RAG-2** | 动机 RAG：条目 schema、存储路径；动机检索接入 Router **第一优先级**（先于规则）；motivationThreshold；LLM 澄清后固化写入 | RAG-1、Router.match | ✅ 已实现（motivation.ts、Gateway 动机优先） |
| **RAG-3** | 外源 RAG：多集合配置、灌入接口、flow/节点绑定集合与检索调用 | RAG-1 | ✅ 已实现（ingestToCollection、flow.meta.externalCollections、getRagContextForFlow） |
| **RAG-4** | 复盘机制：遥测 schema 与写入点、离线/定时触发、架构师 Agent 只读分析+补丁生成、待审区与早报、用户确认与应用 | RAG-1、流程库 CRUD、RAG 可读源路径 | ✅ 已实现（retrospective/、Gateway retrospective.run/report/list/apply） |

---

## 五、Phase 13 工单实现状态（WO-BT-001～026）

截至当前，主工单实现情况如下（可选工单 WO-LM-001～004、RAG-1～4 未计入）：

| 工单 | 状态 | 说明 |
|------|------|------|
| **WO-BT-001～007** | ✅ 已实现 | 配置、流程库加载、路由、FSM/BT 引擎、Gateway 集成、审计 |
| **WO-BT-008～011** | ✅ 已实现 | Condition、BT/FSM 互嵌、resultOf 占位符 |
| **WO-BT-012～013** | ✅ 已实现 | 轨迹 → FSM/BT、writeFlowToLibrary |
| **WO-BT-014** | ✅ 已实现 | LLM 触发生成 flow：配置 flows.generateFlow；显式/无匹配时 runLLMGenerateFlow → createFlow(spec)；见 flow-from-llm.ts、Gateway 接入 |
| **WO-BT-015～017** | ✅ 已实现 | outcomes、路由优选、元数据更新 |
| **WO-BT-018** | ✅ 已实现 | 失败分支替换：配置、getRecentFailureSummary、shouldTrigger、Gateway 接入、markOnly、审计（见 FAILURE_REPLACEMENT_018_DESIGN.md） |
| **WO-BT-019** | ✅ 已实现 | CONFIG_REFERENCE、USAGE 流程与验证说明 |
| **WO-BT-020** | 📋 验收项 | 端到端验收（手动/自动化测试）；文档已给验证步骤，无单独代码模块 |
| **WO-BT-021～023** | ✅ 已实现 | LLM 兜底节点、黑板、会话级 FSM |
| **WO-BT-024** | ✅ 已实现 | 进化插入树：配置与入口、LLM 生成、沙盒、evolved_skills 写入、getMergedTools 集成、insertNode、Gateway evolution.apply（见 EVOLUTION_INSERT_TREE_DESIGN.md） |
| **WO-BT-025～026** | ✅ 已实现 | 流程库 CRUD + applyEditOps、拓扑自我迭代（runTopologyIteration） |

**小结**：核心 26 项中 **25 项已实现**，**1 项为验收**（020）。018、024、014 已实现；RAG-1～4 已按 RAG与复盘机制详细设计.md §八 实现（向量层、动机 RAG、外源灌入与 flow 绑定检索、复盘遥测与待审区）。

**WO-BT-018 设计**：设计要点与排期见 `docs/FAILURE_REPLACEMENT_018_DESIGN.md`；与 024 统一执行工单见 `docs/PHASE13_WO_018_024_EXECUTION_ORDERS.md`。  
**WO-BT-024 设计**：完整设计方案见 `docs/EVOLUTION_INSERT_TREE_DESIGN.md`（触发、LLM 生成、沙盒、工具热注册、插入树、审计与配置）；统一执行工单（018 优先、024 随后）见 `docs/PHASE13_WO_018_024_EXECUTION_ORDERS.md`。

---

## 六、依赖关系简图（Phase A）

```
WO-BT-001 → WO-BT-002 → WO-BT-003
                ↓           ↓
            WO-BT-004   WO-BT-005   (可并行)
                ↓           ↓
                └─────┬─────┘
                      ↓
                 WO-BT-006 → WO-BT-007
```

---

## 七、执行建议

1. **先完成 Phase A（P0）**：001～007 完成后即可在 Gateway 上实现「匹配即走 flow、否则走 Agent」，零 Token 流程执行闭环。
2. **Phase 7 剩余**：WO-710（历史消息）、WO-719（多连接配置）与 Phase 13 无强依赖，可按总计划在 Phase 13 之前或并行收尾。
3. **内嵌小模型**：WO-LM-001～004 在 Phase A 完成后接入，可先实现 WO-BT-003 纯规则路由，再扩展 WO-LM-003。
4. **RAG**：RAG-1～4 在流程库与 Router 稳定后按 §八 顺序实施，与动机 RAG 入口数据流（先动机再规则再 intentClassifier）保持一致。

---

*本文档为 Phase 13 工单整合与防遗漏清单；具体验收标准以主设计 §十四 与 RAG/内嵌设计文档为准。*
