# Phase 13：WO-BT-018 与 WO-BT-024 统一执行工单

本文档在 **WO-BT-024 完整设计**（`EVOLUTION_INSERT_TREE_DESIGN.md`）与 **WO-BT-018 设计要点**（`FAILURE_REPLACEMENT_018_DESIGN.md`）基础上，将两项未闭环工单**单独排期**并**统一**为可执行子工单，便于按序实现与验收。

**排期原则**：**WO-BT-018 优先**（依赖已就绪、仅补触发与接入），**WO-BT-024 随后**（依赖 024 设计文档与现有 022/025）。

---

## 一、总览与优先级

| 优先级 | 工单 | 设计文档 | 说明 |
|--------|------|----------|------|
| **P1** | WO-BT-018 | `FAILURE_REPLACEMENT_018_DESIGN.md` | 失败分支标记与替换：触发条件、失败摘要、调用 runTopologyIteration 的接入 |
| **P2** | WO-BT-024 | `EVOLUTION_INSERT_TREE_DESIGN.md` | 进化插入树：整条管线（触发→生成→沙盒→热注册→插树） |

**依赖关系**：018 与 024 无相互依赖；018 依赖已实现的 outcomes、meta、applyEditOps、runTopologyIteration；024 依赖已实现的 022（黑板）、025（CRUD/applyEditOps）、Skill/getMergedTools。

---

## 二、WO-BT-018 子工单（优先执行）

| 子工单 | 内容 | 验收标准 | 依赖 |
|--------|------|----------|------|
| **018-1** | 配置：`config.flows.failureReplacement` 类型与 loadConfig 解析；enabled、failureRateThreshold、minSamples、consecutiveFailuresThreshold、markOnly、async | 配置可读，未配置时跳过逻辑不报错 | 无 |
| **018-2** | 失败摘要：实现 `getRecentFailureSummary(workspace, libraryPath, flowId, limit)`，从 outcomes.jsonl 读取该 flowId 最近 limit 条失败记录，格式化为供 LLM 参考的 string | 给定 outcomes 能返回正确格式的摘要 | 无 |
| **018-3** | 触发判定：实现 `shouldTriggerFailureReplacement(workspace, libraryPath, flowId, config)`，基于 getFlowSuccessRates + 最近 outcomes 计算失败率与连续失败次数，返回是否触发及原因 | 满足/不满足阈值时返回符合配置的结果 | 018-1 |
| **018-4** | Gateway 接入：在 chat 分支 flow 执行后（appendOutcome、updateFlowMetaAfterRun 之后），调用 018-3；若触发且非 markOnly，则调用 getRecentFailureSummary + runTopologyIteration；若 async 则异步执行 | 执行 flow 后满足阈值时能触发拓扑迭代（可观察审计或日志） | 018-2, 018-3 |
| **018-5** | 可选 markOnly：若配置 markOnly 为 true，仅将 flow 标记为待替换（meta.flaggedForReplacement）；需可写入 flow 的 meta 或单独索引 | 标记后可通过 listFlows/meta 可见 | 018-1 |
| **018-6** | 审计：触发时写入一条审计记录（flowId、触发原因、是否调用 runTopologyIteration、结果） | 审计可追溯 | 018-4 |

**建议实现顺序**：018-1 → 018-2 → 018-3 → 018-4 → 018-5（可选）→ 018-6。

---

## 三、WO-BT-024 子工单（018 之后执行）

设计以 `EVOLUTION_INSERT_TREE_DESIGN.md` 为准；以下子工单与设计 §14.2 对应。

| 子工单 | 内容 | 验收标准 | 依赖 |
|--------|------|----------|------|
| **024-1** | 配置与入口：`config.evolution.insertTree` 类型与 loadConfig；实现 `runEvolutionInsertTree(params)` 空壳（参数校验、审计写入、各阶段占位） | 调用入口不报错，配置可读 | 无 |
| **024-2** | 输入组装：从 session/op-log/黑板聚合 context 的辅助函数，或约定由调用方传入；文档化 context 结构 | 能产出 LLM 所需的 sessionSummary、toolOps 等 | 无 |
| **024-3** | LLM 生成：Prompt 构建、单次 LLM 调用、EvolutionLLMOutput 解析与校验（toolName、script、btNode 等） | 合法/非法输出均能正确解析或报错 | 024-1 |
| **024-4** | 沙盒：临时目录创建、script/test 写入、子进程执行测试脚本与超时、通过标准（exit 0） | 测试通过/不通过/超时行为符合设计 | 024-3 |
| **024-5** | 进化 Skill 写入：evolved_skills 目录、.js + .json 写入、命名与冲突检查（如 evolved_ 前缀） | 写入后文件存在且格式符合现有 Skill | 024-4 |
| **024-6** | getMergedTools 集成：加载 evolved_skills 目录并与现有 Skill 合并；Tool 名与 CORE/Skill 冲突时拒绝或加前缀 | 新 Tool 在下次 getMergedTools 中可见 | 024-5 |
| **024-7** | 插入树：applyEditOps(flowId, insertNode(parent, 0, btNode))；targetFlowId/targetSelectorNodeId 来自配置；校验 node.tool 已存在 | 节点插入后 flow 可加载且可执行 | 024-6 |
| **024-8** | 调用点：Gateway 建议+确认或 CLI/异步调用 runEvolutionInsertTree；可选 autoRun 异步触发 | 满足触发条件时可执行管线并得到结果 | 024-1～024-7 |

**建议实现顺序**：024-1 → 024-2 → 024-3 → 024-4 → 024-5 → 024-6 → 024-7 → 024-8。

---

## 四、执行顺序总表

| 顺序 | 子工单 | 所属 |
|------|--------|------|
| 1 | 018-1 | WO-BT-018 |
| 2 | 018-2 | WO-BT-018 |
| 3 | 018-3 | WO-BT-018 |
| 4 | 018-4 | WO-BT-018 |
| 5 | 018-5（可选） | WO-BT-018 |
| 6 | 018-6 | WO-BT-018 |
| 7 | 024-1 | WO-BT-024 |
| 8 | 024-2 | WO-BT-024 |
| 9 | 024-3 | WO-BT-024 |
| 10 | 024-4 | WO-BT-024 |
| 11 | 024-5 | WO-BT-024 |
| 12 | 024-6 | WO-BT-024 |
| 13 | 024-7 | WO-BT-024 |
| 14 | 024-8 | WO-BT-024 |

**说明**：018 与 024 可并行排期（不同人），但建议先完成 018 再启动 024，以便资源集中、验收清晰。

---

## 五、文档索引

| 工单 | 设计/依据文档 |
|------|----------------|
| WO-BT-018 | `docs/FAILURE_REPLACEMENT_018_DESIGN.md` |
| WO-BT-024 | `docs/EVOLUTION_INSERT_TREE_DESIGN.md` |
| 主工单列表与状态 | `docs/PHASE13_FULL_WORK_ORDERS.md` |
| 主设计 §8.3、§十 | `docs/BEHAVIOR_TREE_AND_STATE_MACHINE_DESIGN.md` |

---

*执行时以本工单文档与上述设计文档为准；完成 018 与 024 子工单后，Phase 13 主工单 018、024 可标记为已实现。*
