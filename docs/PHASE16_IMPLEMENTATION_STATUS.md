# Phase 16 探索层 — 实现状态排查

基于 `docs/PHASE16_EXPLORATION_WORK_ORDERS.md` 与代码库的对照排查结果。**最后更新**：按当前代码与工单逐项核对后生成。

---

## 一、已实现且验收满足的工单

| 范围 | 工单 | 状态 | 说明 |
|------|------|------|------|
| 16A | WO-1601 | ✅ | 配置 schema（ExplorationConfig/trigger/planner/critic/snapshot/experience）、loadConfig 解析、RELOADABLE |
| 16A | WO-1602 | ✅ | shouldSkipExploration：enabled 关、matched 非空、meta.explorationOptOut |
| 16A | WO-1603 | ✅ | shouldEnterExploration：长度、关键词、openIntents、isComplexRequest；uncertainty/failureRate 为可选占位 |
| 16A | WO-1604 | ✅ | chat-executor 中未命中 flow 且 Gatekeeper 放行时调用 tryExploration，编译后交 runAgentLoop |
| 16A | WO-1606 | ✅ | CONFIG_REFERENCE 含 exploration 全块（含 timeoutMs、trigger、experience、storeOutcome、maxEntries） |
| 16B | WO-1610～1614 | ✅ | SnapshotContext、FSM/黑板占位、availableActions、snapshot_digest、buildSnapshotContext |
| 16C | WO-1620～1626 | ✅ | 类型、Planner 模板与 LLM、解析与 actionId 校验、Fallback 返回 fallbackContent、Critic 权重与 callCritic、串联 |
| 16D | WO-1632～1635 | ✅ | compilePlanToMessage、同进程下发（compiledMessage 作 userMessage）、timeoutMs + Promise.race |
| 16E | WO-1640～1645 | ✅ | 经验 schema/JSONL、writeEntry、findBestMatch/listRecent、复用与 requireSnapshotMatch、explorationRecordId 与 updateOutcome、遥测 5 类事件 |
| 16F | WO-1644, 1655, 1656～1659 | ✅ | 回写与遥测、复盘 exploration_trim 与 reportExplorationExperience、CONFIG/MASTER 索引、Gatekeeper/编译/经验测试 |

---

## 二、原「可选」项 — 已实现

| 工单 | 名称 | 实现说明 |
|------|------|----------|
| **WO-1605** | 执行管道接入点（Event Bus 形态） | 当 eventBus.enabled && exploration.enabled 时，探索层单独订阅 chat.request，发布 task.plan_ready 或 chat.response（fallback）；执行层订阅 task.plan_ready。见 `docs/PHASE16_EVENT_BUS_EXPLORATION.md`。 |
| **WO-1634** | 发布编译后 Event（Event Bus） | 探索层将编译后 event（含 meta.fromExploration、explorationRecordId）发布到 TOPIC_PLAN_READY；执行层消费后 runAgentLoop。 |
| **WO-1623 可选** | Fallback 写入黑板 / 发布技能请求 topic | 返回 fallbackContent 前写入 session.blackboard['__exploration_skill_request']；若 eventBus.enabled 则 publish(TOPIC_SKILL_REQUEST, SkillRequestEvent)。 |
| **Gatekeeper** | uncertaintyThreshold / failureRateThreshold | uncertaintyThreshold：规则打分（?、可能、也许等 → 0.6）；failureRateThreshold：读遥测 exploration_outcome/flow_end 近 24h 失败率。shouldEnterExploration 改为 async 并接受 options.workspace。 |

详见 `docs/PHASE16_EVENT_BUS_EXPLORATION.md`。

---

## 三、已做的小完善（本次排查中补齐）

| 项 | 修改 |
|------|------|
| **experience.maxEntries** | 配置已支持但未使用：`tryExploration` 中 `listRecent(workspace, 50)` 改为使用 `config.exploration?.experience?.maxEntries ?? 50`。 |
| **CONFIG_REFERENCE** | 补充 `experience.maxEntries` 字段说明。 |
| **Critic 权重** | `buildCriticPrompt` 原先写死 0.6/0.2/0.2；改为接收 `config.exploration.critic.weights`，在 prompt 中注入公式系数。 |

---

## 四、建议后续可做（非必须）

1. **WO-1658 扩展**：在 mock LLM 的前提下增加「先验扫描 → Planner → Critic → 编译」的集成测试，验证整条路径（当前已有编译单测）。  
2. **Planner maxVariants**：Prompt 中「3～5 种预案」可改为从 `config.exploration.planner.maxVariants` 读取并写入提示词。  
3. **复盘 applyPending 调用方**：Gateway 的 `retrospective.apply` 已正确调用 `applyPending(workspace, date, applyFlowEdit, applyMotivation)`；`exploration_trim` 在 `applyPending` 内部通过动态 import 处理，无需调用方改动。

---

## 五、结论

- **核心路径**：16A～16E 与 16F 中 WO-1644、1655、1656～1659 均已实现并可验收。  
- **可选能力**：WO-1605、1634、Fallback 扩展、uncertainty/failureRate 触发为设计允许的未实现项。  
- **小完善**：maxEntries 使用、CONFIG_REFERENCE 补充、Critic 权重注入已在本轮排查中完成。

实现时以 `EXPLORATION_PLANNER_DESIGN.md` 与 `PHASE16_EXPLORATION_WORK_ORDERS.md` 为准。
