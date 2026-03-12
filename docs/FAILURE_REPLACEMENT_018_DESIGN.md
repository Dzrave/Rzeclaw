# 失败分支标记与替换（WO-BT-018）设计要点

本文档为 **WO-BT-018「失败分支标记与替换」** 的排期与实现设计，补齐「失败率超阈值时自动触发 runTopologyIteration」的触发策略与接入方式。与主设计 `BEHAVIOR_TREE_AND_STATE_MACHINE_DESIGN.md` §8.3、§十 一致。

**已实现能力**：outcomes.jsonl（WO-BT-015）、getFlowSuccessRates、meta（WO-BT-017）、applyEditOps、runTopologyIteration（WO-BT-026）；触发条件配置、判定逻辑、失败摘要组装、Gateway 接入、markOnly、审计均已实现。**可选已落实**：（1）失败摘要拼入 op-log 工具错误（`readRecentFlowFailureEntries` + `getRecentFailureSummaryWithOpLog`）；（2）独立任务全库扫描 `runFailureReplacementScan`，Gateway 方法 `flows.scanFailureReplacement`；（3）runTopologyIteration 成功后清除 `meta.flaggedForReplacement`。

---

## 一、目标与范围

- **目标**：当某 flow 的**失败率**或**连续失败次数**超过可配置阈值时，自动（或按策略）调用 `runTopologyIteration(flowId, failureSummary)`，由 LLM 产出 EditOp[] 并经 applyEditOps 写回，实现「失败分支替换」。
- **可选**：「标记」该 flow（如 meta.flaggedForReplacement = true）便于人工或仪表盘识别，再执行替换；替换成功后可清除标记。
- **范围**：仅 BT flow；FSM 不在此工单。触发基于** flow 维度**的统计（不区分同一 flow 内不同节点/分支），失败摘要为近期失败记录的聚合文本。

---

## 二、触发条件

### 2.1 判定维度

- **flowId**：以 flow 为单位统计；同一 flowId 的多次执行（不同 params）合并计算。
- **指标**（满足其一即可触发，可配置）：
  - **失败率**：`failCount / (successCount + failCount) >= failureRateThreshold`，且总样本数 `>= minSamples`（避免样本过少误触）。
  - **连续失败**：最近 `consecutiveFailuresThreshold` 次执行均为失败（需从 outcomes 按时间倒序取最近 N 条判定）。

### 2.2 配置项草案

建议放在 `config.flows` 下，与流程库同层：

```ts
flows?: {
  // ... 现有 enabled, libraryPath, routes
  /** WO-BT-018: 失败分支替换策略 */
  failureReplacement?: {
    enabled?: boolean;
    /** 失败率阈值 0~1，超过则触发 */
    failureRateThreshold?: number;
    /** 至少多少条执行记录后才计算失败率（避免样本过少） */
    minSamples?: number;
    /** 最近连续失败次数达到此值则触发（与失败率二选一或同时生效） */
    consecutiveFailuresThreshold?: number;
    /** 触发后是否先仅标记（meta.flaggedForReplacement），不立即调用 LLM；false 则直接调用 runTopologyIteration */
    markOnly?: boolean;
    /** 异步执行 runTopologyIteration，不阻塞 chat 响应 */
    async?: boolean;
  };
};
```

### 2.3 失败摘要（failureSummary）

供 runTopologyIteration 的 LLM 参考。建议内容：

- 从 outcomes.jsonl 中取该 flowId **最近若干条失败记录**（如最近 10 条 failed），每条包含：paramsSummary、ts；可拼接为「最近失败：paramsSummary1 (ts1); paramsSummary2 (ts2); ...」。
- 可选：从 op-log 取该 flow 最近失败时的工具错误信息（需按 flowId + 时间过滤），拼入 failureSummary。**已实现**：`readRecentFlowFailureEntries`（op-log.ts）+ `getRecentFailureSummaryWithOpLog`（failure-replacement.ts）在组装 failureSummary 时拼入工具错误。

---

## 三、调用时机与接入点

### 3.1 推荐接入点

- **Gateway chat 分支**：在 flow 执行结束并完成 `appendOutcome`、`updateFlowMetaAfterRun` 之后，**同步或异步**执行「失败替换检查」：
  1. 读取该 flowId 的当前成功率（或复用 getFlowSuccessRates）及最近连续失败次数；
  2. 若未开启 failureReplacement.enabled，则跳过；
  3. 若满足触发条件：
     - 若 markOnly：更新该 flow 的 meta.flaggedForReplacement = true（需 read flow → 改 meta → replaceFlow 或通过现有 meta 写入机制），不调 LLM；
     - 否则：组装 failureSummary，调用 runTopologyIteration(flowId, failureSummary)；若 async 则 fire-and-forget，否则 await（一般不阻塞用户回复，建议 async=true）。

### 3.2 可选：独立任务

- 定时或按需跑「经验扫描」任务：遍历 listFlows，对每个 flowId 取 getFlowSuccessRates + 最近 N 条 outcomes，满足阈值则调用 runTopologyIteration。**已实现**：`runFailureReplacementScan(config, workspace, libraryPath)`；Gateway 方法 `flows.scanFailureReplacement` 按需调用；定时可由外部 cron 或调度器调用该接口。

---

## 四、与 runTopologyIteration 的衔接

- **入参**：config、workspace、libraryPath、flowId、failureSummary（由 2.3 产出）、actor = "failure_replacement_018"。
- **结果**：若 success，可选清除 meta.flaggedForReplacement（若存在）；若 failure，保留标记或记录审计，不重试（避免同一 flow 反复调 LLM）。**已实现**：performFailureReplacementAfterRun 与 runFailureReplacementScan 在 runTopologyIteration 返回 success 后均调用 `setFlowMetaFlaggedForReplacement(..., false)`。

---

## 五、审计与安全

- 每次触发（无论 markOnly 或实际调用）建议写审计：flowId、触发原因（failureRate / consecutiveFailures）、是否调用了 runTopologyIteration、结果 success/failure。
- runTopologyIteration 内部已走 applyEditOps 与 flows 审计；此处仅补「触发决策」审计即可。

---

## 六、实现顺序建议（工单拆解）

1. **配置**：flows.failureReplacement 类型与 loadConfig 解析。
2. **失败摘要**：getRecentFailureSummary(workspace, libraryPath, flowId, limit) 从 outcomes 读取并格式化为 string。
3. **触发判定**：shouldTriggerFailureReplacement(workspace, libraryPath, flowId, config) → boolean（或 { trigger: boolean, reason?: string }），内部用 getFlowSuccessRates + 最近 outcomes 计算。
4. **Gateway 接入**：在 executeFlow 成功/失败分支后，appendOutcome + updateFlowMetaAfterRun 之后调用触发判定；若 true 且非 markOnly，则组装 failureSummary 并调用 runTopologyIteration（async 可选）。
5. **可选 markOnly**：若配置 markOnly，则只写 flow meta（flaggedForReplacement）；需扩展 meta 存储或 flow JSON 的 meta 字段（当前 meta 已有 successCount/failCount/lastUsed，可加 flaggedForReplacement）。
6. **审计**：触发时写一条审计记录（flowId、reason、action）。

---

*本文档为 WO-BT-018 的排期与设计要点，执行时与 `PHASE13_WO_018_024_EXECUTION_ORDERS.md` 中的 018 子工单一致。*
