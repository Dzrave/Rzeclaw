# Phase 16：探索层与预案 Planner — 工单

基于 `docs/EXPLORATION_PLANNER_DESIGN.md` 进行工单拆解。**实现前需确认该设计文档。**

---

## 一、工单列表

### 16A：配置与 Gatekeeper、接入点

| 工单 ID | 名称 | 依赖 | 范围 | 验收标准 |
|---------|------|------|------|----------|
| **WO-1601** | 探索层配置 schema | 无 | 在 config 中增加 `exploration`：enabled、trigger（openIntents、complexThresholdChars、uncertaintyThreshold、failureRateThreshold）、planner（maxVariants、readOnlyRAGOnly）、critic（weights）、snapshot（maxRelevantSkills）、experience（enabled、collection、reuseThreshold、requireSnapshotMatch、storeOutcome、maxEntries）；类型定义与默认值 | 配置可被 loadConfig 解析，与设计 §九、§11.8 一致 |
| **WO-1602** | Gatekeeper：负向条件 | 1601 | 当 `exploration.enabled === false` 或已命中某 flow（matchFlow 返回非 null）时，**不**进入探索层；会话/用户级 meta.explorationOptOut 可选 | 命中 flow 或关闭开关时请求直通执行层 |
| **WO-1603** | Gatekeeper：正向触发条件 | 1601 | 当未命中 flow 时：若消息长度 ≥ complexThresholdChars、或匹配 openIntents/关键词（如「设计」「重构」「先/再/然后/步骤」）、或可选 uncertainty 得分 ≥ 阈值、或某类任务近期失败率 ≥ failureRateThreshold，则判定「需探索」；复用或扩展 isComplexRequest（planning.ts） | 满足任一向条件且无负向时，Gatekeeper 产出「进入探索层」 |
| **WO-1604** | 执行管道接入点（无 Event Bus） | 1602, 1603 | 在执行层消费到用户请求后、调用 Router/executeFlow 或 runAgentLoop **之前**：若 Gatekeeper 判定需探索，则先进入探索层；否则直接走现有路由与执行 | 请求可被路由到探索层或直通执行，与设计 §3.1 一致 |
| **WO-1605** | 执行管道接入点（Event Bus 形态，可选） | WO-1406 或等价 | 当 Event Bus 存在时：探索层订阅 chat.request（或专用 topic）；Gatekeeper 在探索层内对每条 request 判断；满足则消费并执行探索流程后发布编译 Event；不满足则透传或由执行层直接消费 | 与 PHASE14 执行层订阅 request 的形态兼容；探索层可先消费再发布 |
| **WO-1606** | CONFIG_REFERENCE 探索配置说明 | 1601 | 文档：exploration.* 各字段含义、trigger 示例、experience.reuseThreshold 建议值、与 planning.complexThresholdChars 的复用关系 | 配置可查、与设计衔接 |

### 16B：先验扫描（Affordance-Aware）

| 工单 ID | 名称 | 依赖 | 范围 | 验收标准 |
|---------|------|------|------|----------|
| **WO-1610** | SnapshotContext 类型定义 | 无 | 定义 SnapshotContext：fsm（状态/环境标识）、blackboard（键值摘要或片段）、availableActions（技能/flow/MCP 列表，含 id 与简短描述）、snapshot_digest（可选，availableActions 的 ID 列表排序后哈希） | 类型可被 Planner 与探索经验模块引用 |
| **WO-1611** | 先验扫描：FSM 与黑板 | 1610 | 抓取当前会话/ Gateway 的 FSM 状态（若有）；提取黑板短期上下文（若有）；填入 SnapshotContext.fsm、blackboard；无 FSM/黑板时填占位或空 | 与设计 §4.2 步骤 1 一致 |
| **WO-1612** | 先验扫描：可用技能与 MCP | 1610 | 查询流程库（flowLibrary）与已注册 MCP 工具列表；得到 availableActions；若数量大，用动机层/路由传过来的关键词做内源 RAG 或过滤，取前 K 个（maxRelevantSkills）；填入 SnapshotContext.availableActions、可选 relevantDescriptions | 与设计 §4.2 步骤 2 一致 |
| **WO-1613** | snapshot_digest 计算 | 1612 | 对 availableActions 的 id 列表排序后做稳定哈希（如 SHA256 截断或简单 hash），写入 SnapshotContext.snapshot_digest；用于探索经验复用时的兼容性检查 | 相同技能集得到相同 digest；复用时可比对 |
| **WO-1614** | 先验扫描编排 | 1611, 1612, 1613 | 在需要「完整干跑」时调用：顺序执行 1611 → 1612 → 1613，返回完整 SnapshotContext；供 Planner 与 Critic 输入使用 | 一次调用得到完整快照，与设计 §4.2 一致 |

### 16C：Planner 与 Critic

| 工单 ID | 名称 | 依赖 | 范围 | 验收标准 |
|---------|------|------|------|----------|
| **WO-1620** | PlanVariant / PlanStep / Plan_Fallback 类型 | 无 | 定义 PlanStep（step、actionId、agentId?、params?、description?）、PlanVariant（planId、title?、steps、preconditions?）、Plan_Fallback（type、subtype: Request_New_Skill、content）；与设计 §7.1、§4.3 一致 | 类型可被解析与编译使用 |
| **WO-1621** | Planner 系统提示词模板 | 1610, 1620 | 实现 Planner 的 system prompt 模板：角色、约束（黑板、FSM、仅允许的 availableActions 列表）、任务（输出 3～5 个 PlanVariant JSON）、Fallback 规则；占位符由运行时注入 SnapshotContext 与用户 message | 模板可生成完整 prompt，与设计 §八 一致 |
| **WO-1622** | Planner LLM 调用与解析 | 1621 | 调用 LLM（仅文本入出，**不**暴露写文件/执行类工具）；解析返回为 PlanVariant[] 或单条 Plan_Fallback；校验 actionId 均在 availableActions 中（可选严格校验） | 产出 3～5 个预案或 Fallback，无写操作 |
| **WO-1623** | Plan_Fallback 处理 | 1622 | 当 Planner 产出 Plan_Fallback 时：不编译为执行 Event；可选写入黑板或发布到「技能请求」topic；返回用户可读说明（「当前系统缺少 X 能力，已记录需求」）；结束本次探索，不调用 Critic | 与设计 §4.3 一致 |
| **WO-1624** | PlanScore 类型与 Critic 评分公式 | 无 | 定义 PlanScore（planId、score、estimatedSuccess、estimatedCost、estimatedRisk、reason）；实现 Score(P)=w1*E(success)-w2*Cost-w3*Risk，权重来自 config.exploration.critic.weights | 与设计 §7.2、§5.2 一致 |
| **WO-1625** | Critic 提示与 LLM 调用 | 1620, 1624 | Critic 输入：Planner 产出的预案列表 + 任务描述 + SnapshotContext 摘要；Prompt 要求对每预案打分并选出最优；解析输出为 chosenPlanId + scores: PlanScore[] | 产出单一最优 planId，可选各预案得分 |
| **WO-1626** | Planner → Critic 串联 | 1622, 1623, 1625 | 当 Planner 产出 PlanVariant[] 时调用 Critic；Critic 产出 chosenPlanId；从 PlanVariant[] 中取该预案作为「最优预案」；若为 Fallback 则不调 Critic（1623） | 端到端「预案发散 → 评分择优」与设计 §五 一致 |

### 16D：编译与下发

| 工单 ID | 名称 | 依赖 | 范围 | 验收标准 |
|---------|------|------|------|----------|
| **WO-1632** | 预案编译为 Event | 1620 | 将 PlanVariant（steps）编译为与 ChatRequestEvent 或执行层可消费的 payload 兼容的结构（如扩展的 message/params 或等价 Event 字段）；保持 correlationId 与原始 request 一致；payload 或 meta 中带 explorationRecordId（见 1644） | 与设计 §5.3、§6.1 一致；执行层可无感知执行 |
| **WO-1633** | 发布编译后 Event（同进程） | 1632, 1604 | 探索层完成后：将编译结果交给执行层（或发布到进程内 Bus 的 chat.request / task.plan_ready）；执行层按现有逻辑执行并最终发布 chat.response | 一次探索从 request 到 response 闭环（同进程） |
| **WO-1634** | 发布编译后 Event（Event Bus，可选） | 1632, 1605 | 当使用 Event Bus 时：探索层 publish 编译后的 Event 到约定 topic；correlationId 一致；执行层订阅并消费，发布 chat.response | 与 14A 的 request/response 契约一致 |
| **WO-1635** | 流式与超时 | 1633 或 1634 | 探索层执行有可配置超时；超时或 LLM 异常时返回用户可读错误或 fallback（如「规划超时，将直接执行」并降级为不探索）；不阻塞执行层 | 异常与超时有明确处理 |

### 16E：探索经验存储、复用、回写与遥测

| 工单 ID | 名称 | 依赖 | 范围 | 验收标准 |
|---------|------|------|------|----------|
| **WO-1640** | 探索经验条目 schema 与可读存储 | 1620 | 定义 ExplorationExperienceEntry（id、task_signature、intent、chosen_plan、snapshot_digest、created_at、reuse_count、last_reused_at、outcome_success_count、outcome_fail_count、last_outcome、last_token_cost、payload）；可读源存 JSON（如 workspace/.rzeclaw/rag/endogenous/exploration_experience/*.json 或单文件 JSONL） | 与设计 §11.2 一致；用户可查看/备份 |
| **WO-1641** | 探索经验写入 | 1640, 1626, 1632 | 在完整干跑并选出最优预案后：生成新条目（task_signature=message+可选 intent、chosen_plan、snapshot_digest、reuse_count=0 等）；写入可读存储；若使用向量集合则触发 embed+索引（见 1642） | 每次新探索产生一条可复用记录 |
| **WO-1642** | 探索经验检索（向量或简单匹配） | 1640 | 若已有 vectorEmbedding/search：增加集合 exploration_experience，条目的 task_signature 作为 embed 来源；search(collection, currentMessage, topK=3)。若无：可实现简单关键词或 id 映射的「最近 N 条」或占位，待 RAG 就绪后接入 | 能按当前 message（+ 可选 intent）检索候选条目 |
| **WO-1643** | 检索优先与复用逻辑 | 1642, 1603, 1613 | Gatekeeper 放行后、先验扫描（或至少 digest）**之前**或**之后**：调用检索；若 top1 score ≥ reuseThreshold：若配置 requireSnapshotMatch，则做快照并比对 snapshot_digest，兼容则复用；否则直接复用。复用则取条目 chosen_plan，更新 reuse_count、last_reused_at，跳过多步 1614→1622→1625，仅执行 1632 编译（explorationRecordId=条目 id） | 与设计 §11.3 一致；相似任务不重复干跑 |
| **WO-1644** | explorationRecordId 传递与结果回写 | 1640, 1632, 1633/1634 | 编译与发布时在 payload/meta 中带 explorationRecordId；执行层完成并发布 chat.response 时保留或回传该 id；探索层或统一模块订阅 response，按 correlationId/explorationRecordId 找到条目，更新 last_outcome、outcome_success_count/outcome_fail_count、可选 last_token_cost；若 storeOutcome 关闭则仅统计不写 | 与设计 §11.4 一致 |
| **WO-1645** | 探索层遥测事件 | 1604, 1641, 1643, 1644 | 在适当时机写入遥测（或 appendOpLog）：exploration_enter（Gatekeeper 放行）、exploration_reuse（命中复用）、exploration_full_run（完整干跑）、exploration_store（新条目写入）、exploration_outcome（结果回写）；payload 含 correlationId、explorationRecordId、score、reuse_count_after、plannerTokens、criticTokens、success 等（与设计 §11.6 一致） | 复盘可统计复用率、Token 节省、成功率 |

### 16F：复盘对接、文档与验收

| 工单 ID | 名称 | 依赖 | 范围 | 验收标准 |
|---------|------|------|------|----------|
| **WO-1655** | 复盘对探索经验的动作（可选） | 1640, 复盘机制存在 | 在复盘模块（RAG与复盘机制详细设计 §5.3）中增加「探索经验」一行：聚类/合并重叠条目、按 outcome_* 与 reuse_count 淘汰低质量或过时条目、产出《探索经验质量报告》或待审补丁（合并/删除/降权）；架构师 Agent 不直接写库，仅产出补丁 | 与设计 §11.5 一致；依赖 RAG-4 或等价复盘实现 |
| **WO-1656** | CONFIG_REFERENCE 与设计文档衔接 | 1606, 1640 | 在 CONFIG_REFERENCE 中补充 exploration 全块说明；在 MASTER_IMPLEMENTATION_PLAN 或 PHASE14_IMPLEMENTATION_PLAN 中增加 Phase 16 索引（设计文档、本工单文档） | 配置与阶段可查 |
| **WO-1657** | 端到端/集成测试：Gatekeeper 与直通 | 1604, 1602, 1603 | 测试：关闭 exploration.enabled 或命中 flow 时请求不进入探索层；满足触发条件且未命中 flow 时进入探索层 | 验收 §四 16A |
| **WO-1658** | 端到端/集成测试：完整干跑与编译执行 | 1633, 1626, 1614 | 测试：一次满足条件的请求经探索层 → 先验扫描 → Planner → Critic → 编译 → 执行层执行 → 收到 response；执行层行为与「未经过探索层」的请求一致（仅输入为编译后的计划） | 验收 §四 16B～16D |
| **WO-1659** | 端到端/集成测试：探索经验复用 | 1643, 1641, 1644 | 测试：第一次请求触发完整干跑并写入探索经验；第二次相似请求（或同一 message）命中探索经验并复用，不调用 Planner/Critic，直接编译下发；可选验证 outcome 回写 | 验收 §四 16E |

---

## 二、依赖关系简图

```
16A:
  WO-1601 ── WO-1602, WO-1603 ── WO-1604 ── WO-1606
  WO-1605（可选，依赖 14A）

16B:
  WO-1610 ── WO-1611, WO-1612 ── WO-1613 ── WO-1614

16C:
  WO-1620 ── WO-1621 ── WO-1622 ── WO-1623
  WO-1620 ── WO-1624 ── WO-1625 ── WO-1626（Planner 产出 Variant[] 时）
  WO-1626 依赖 1622, 1625

16D:
  WO-1620, WO-1626 ── WO-1632 ── WO-1633（或 WO-1634）
  WO-1635 依赖 1633/1634

16E:
  WO-1640 ── WO-1641, WO-1642
  WO-1642, WO-1613 ── WO-1643
  WO-1640, WO-1632 ── WO-1644
  WO-1645 依赖 1604, 1641, 1643, 1644

16F:
  WO-1655 依赖 1640 + 复盘实现
  WO-1656 依赖 1606, 1640
  WO-1657 依赖 1604, 1602, 1603
  WO-1658 依赖 1633, 1626, 1614
  WO-1659 依赖 1643, 1641, 1644
```

**建议实现顺序**（满足依赖前提下）：  
1601 → 1602 → 1603 → 1604 → 1610 → 1611 → 1612 → 1613 → 1614 → 1620 → 1621 → 1622 → 1623 → 1624 → 1625 → 1626 → 1632 → 1633 → 1635 → 1640 → 1641 → 1642 → 1643 → 1644 → 1645 → 1606 → 1656 → 1657 → 1658 → 1659；1605、1634、1655 按需插入（Event Bus 与复盘就绪时）。

---

## 三、设计文档索引

| 依据 | 文档 |
|------|------|
| 设计 | `docs/EXPLORATION_PLANNER_DESIGN.md` |
| 实施计划 | `docs/PHASE16_EXPLORATION_IMPLEMENTATION_PLAN.md` |
| 关联 | `docs/RAG与复盘机制详细设计.md`（探索经验集合、复盘动作、遥测）；`docs/EVENT_BUS_AS_HUB_DESIGN.md`（Event Schema、topic）；`docs/BEHAVIOR_TREE_AND_STATE_MACHINE_DESIGN.md`（actionId 与 flow/节点） |

---

## 四、WO-1644 / WO-1655 / WO-1657～1659 实现要点（补充）

### WO-1644 执行结果回写

| 要点 | 说明 |
|------|------|
| explorationRecordId 来源 | 复用：`findBestMatch` 命中条目的 `entry.id`；新写：`writeEntry` 返回的 `written.id`；在 `tryExploration` 返回值中一并返回。 |
| 回写时机 | 仅当 `config.exploration.experience.storeOutcome === true` 且本请求带有 `explorationRecordId` 时，在 chat-executor 中：`runAgentLoop` 成功则 `updateOutcome(workspace, id, { success: true })`；catch 到异常则 `updateOutcome(..., { success: false })` 后 rethrow。 |
| 遥测 | 回写时写入 `exploration_outcome` 事件（payload 含 success、explorationRecordId、correlationId）。 |
| 实现位置 | `src/exploration/experience.ts`（updateOutcome）；`src/gateway/chat-executor.ts`（保存 explorationRecordIdForOutcome、try/catch 内回写与遥测）。 |

### WO-1655 复盘对探索经验的动作

| 要点 | 说明 |
|------|------|
| 产出物 | 程序化产出《探索经验质量报告》+ 待审补丁（不由 LLM 生成）。报告内容：每条目的 id、签名摘要、复用次数、成功/失败、成功率；建议删除条件：样本≥2 且成功率&lt;20% 且复用&lt;2。 |
| 补丁 kind | `exploration_trim`；字段 `explorationDeleteIds: string[]`、`summary`。 |
| 架构师集成 | 在 `runRetrospective` 写入 pending 前调用 `reportExplorationExperience(workspace)`，将返回的 patches 并入，报告文本追加到早报 summary。 |
| 应用 | 在 `applyPending` 中处理 `kind === "exploration_trim"`：调用 `removeExplorationEntries(workspace, p.explorationDeleteIds)`。 |
| 实现位置 | `src/retrospective/exploration-experience.ts`（reportExplorationExperience）；`src/retrospective/pending.ts`（PendingPatch.explorationDeleteIds、applyPending 分支）；`src/retrospective/architect.ts`（合并报告与补丁）；`src/exploration/experience.ts`（removeExplorationEntries）。 |

### WO-1657 端到端/集成测试：Gatekeeper 与直通

| 要点 | 说明 |
|------|------|
| 用例 1 | `exploration.enabled === false` 时，`shouldSkipExploration(config, null)` 为 true。 |
| 用例 2 | 已命中 flow（matched 非 null）时，`shouldSkipExploration(config, matched)` 为 true。 |
| 用例 3 | `meta.explorationOptOut === true` 时，`shouldSkipExploration(config, null, meta)` 为 true。 |
| 用例 4 | 未命中、enabled、无 optOut 时，`shouldSkipExploration` 为 false；消息长度 ≥ complexThresholdChars 时 `shouldEnterExploration(config, message)` 为 true。 |
| 用例 5 | 消息含触发关键词（如「设计」「步骤」）时 `shouldEnterExploration` 为 true。 |
| 实现 | 使用 node:test，从 dist 引用 `shouldSkipExploration`、`shouldEnterExploration`；构造最小 config 与 matched。 |

### WO-1658 端到端/集成测试：完整干跑与编译

| 要点 | 说明 |
|------|------|
| 范围 | 可 mock LLM 做完整干跑，或仅测「编译」路径以降低依赖。 |
| 用例 1 | `compilePlanToMessage(plan, originalUserMessage)`：输入合法 PlanVariant 与用户消息，输出包含「【系统预案】」、步骤列表、用户原意。 |
| 用例 2 | 步骤含 actionId、params、description 时，编译结果中均体现。 |
| 实现 | 使用 node:test，从 dist 引用 `compilePlanToMessage`；构造最小 PlanVariant（steps 含 step、actionId、可选 params/description）。 |

### WO-1659 端到端/集成测试：探索经验复用与回写

| 要点 | 说明 |
|------|------|
| 复用 | 临时 workspace：`writeEntry` 写入一条；`listRecent` 取到；同一条 message 调用 `findBestMatch(message, entries, 0.8)` 应命中；可选 `requireSnapshotMatch` 与 digest 一致时复用。 |
| 回写 | 写入条目后调用 `updateOutcome(workspace, id, { success: true })`，再 `getEntryById(workspace, id)` 得到条目，`outcome_success_count === 1`；再调用 `updateOutcome(..., { success: false })`，条目 `outcome_fail_count === 1`。 |
| 实现 | 使用 node:test + 临时目录（mkdtemp），从 dist 引用 experience 的 writeEntry、listRecent、findBestMatch、updateOutcome、getEntryById；测试结束删除临时目录。 |

---

*实现时以 EXPLORATION_PLANNER_DESIGN.md 与本文档为准。*
