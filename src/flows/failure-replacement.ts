/**
 * Phase 13 WO-BT-018: 失败分支标记与替换。触发判定、失败摘要、runTopologyIteration 接入与审计。
 */

import type { RezBotConfig } from "../config.js";
import { getFlowSuccessRates, getRecentOutcomes, getRecentFailureSummary } from "./outcomes.js";
import { setFlowMetaFlaggedForReplacement } from "./meta.js";
import { appendAudit, listFlows } from "./crud.js";
import { runTopologyIteration } from "./topology-iterate.js";
import { readRecentFlowFailureEntries } from "../observability/op-log.js";

const ACTOR = "failure_replacement_018";

export type ShouldTriggerResult = { trigger: boolean; reason?: string };

/** 默认 minSamples 避免样本过少误触 */
const DEFAULT_MIN_SAMPLES = 5;
/** 默认失败率阈值 */
const DEFAULT_FAILURE_RATE_THRESHOLD = 0.5;
/** 默认连续失败次数 */
const DEFAULT_CONSECUTIVE_FAILURES_THRESHOLD = 3;
/** 失败摘要最多取几条 */
const FAILURE_SUMMARY_LIMIT = 10;
/** op-log 工具错误最多取几条（018 可选） */
const OPLOG_FAILURE_LIMIT = 10;

/**
 * WO-BT-018 可选：在 outcomes 失败摘要基础上，拼入该 flow 最近失败时的 op-log 工具错误信息。
 */
async function getRecentFailureSummaryWithOpLog(
  workspace: string,
  libraryPath: string,
  flowId: string,
  limit: number
): Promise<string> {
  const fromOutcomes = await getRecentFailureSummary(workspace, libraryPath, flowId, limit);
  const opEntries = await readRecentFlowFailureEntries(workspace, flowId, OPLOG_FAILURE_LIMIT);
  if (opEntries.length === 0) return fromOutcomes;
  const toolErrors = opEntries
    .map((e) => `${e.tool}: ${e.result_summary || "failed"} (${e.ts})`)
    .join("; ");
  return fromOutcomes
    ? `${fromOutcomes} Tool errors: ${toolErrors}`
    : `Tool errors: ${toolErrors}`;
}

/**
 * WO-BT-018-3: 判定是否应触发失败替换。基于 getFlowSuccessRates 与最近 outcomes 计算失败率与连续失败次数。
 */
export async function shouldTriggerFailureReplacement(
  workspace: string,
  libraryPath: string,
  flowId: string,
  config: RezBotConfig
): Promise<ShouldTriggerResult> {
  const fr = config.flows?.failureReplacement;
  if (!fr?.enabled) return { trigger: false };

  const minSamples = fr.minSamples ?? DEFAULT_MIN_SAMPLES;
  const failureRateThreshold = fr.failureRateThreshold ?? DEFAULT_FAILURE_RATE_THRESHOLD;
  const consecutiveThreshold = fr.consecutiveFailuresThreshold ?? DEFAULT_CONSECUTIVE_FAILURES_THRESHOLD;

  const rates = await getFlowSuccessRates(workspace, libraryPath);
  const rate = rates.get(flowId);
  const total = rate ? rate.successCount + rate.failCount : 0;

  if (total >= minSamples && rate) {
    const failRate = rate.failCount / total;
    if (failRate >= failureRateThreshold) {
      return { trigger: true, reason: `failureRate=${failRate.toFixed(2)} >= ${failureRateThreshold}` };
    }
  }

  const recent = await getRecentOutcomes(workspace, libraryPath, flowId, consecutiveThreshold);
  if (recent.length >= consecutiveThreshold) {
    const allFailed = recent.slice(-consecutiveThreshold).every((e) => !e.success);
    if (allFailed) {
      return { trigger: true, reason: `consecutiveFailures=${consecutiveThreshold}` };
    }
  }

  return { trigger: false };
}

/**
 * WO-BT-018-4/5/6: flow 执行后若触发则执行「仅标记」或「调用 runTopologyIteration」并写审计。
 * 由 Gateway 在 appendOutcome、updateFlowMetaAfterRun 之后调用；async 时不阻塞。
 */
export async function performFailureReplacementAfterRun(
  workspace: string,
  libraryPath: string,
  flowId: string,
  config: RezBotConfig
): Promise<void> {
  const fr = config.flows?.failureReplacement;
  if (!fr?.enabled) return;

  const { trigger, reason } = await shouldTriggerFailureReplacement(
    workspace,
    libraryPath,
    flowId,
    config
  );
  if (!trigger || !reason) return;

  const ts = new Date().toISOString();

  if (fr.markOnly) {
    await setFlowMetaFlaggedForReplacement(workspace, libraryPath, flowId, true);
    await appendAudit(workspace, libraryPath, {
      op: "failureReplacement",
      flowId,
      actor: ACTOR,
      ts,
      detail: `${reason}; markOnly=true`,
    });
    return;
  }

  const doRun = async (): Promise<void> => {
    const failureSummary = await getRecentFailureSummaryWithOpLog(
      workspace,
      libraryPath,
      flowId,
      FAILURE_SUMMARY_LIMIT
    );
    const result = await runTopologyIteration({
      config,
      workspace,
      libraryPath,
      flowId,
      failureSummary: failureSummary || undefined,
      actor: ACTOR,
    });
    if (result.success) {
      await setFlowMetaFlaggedForReplacement(workspace, libraryPath, flowId, false);
    }
    await appendAudit(workspace, libraryPath, {
      op: "failureReplacement",
      flowId,
      actor: ACTOR,
      ts: new Date().toISOString(),
      detail: `${reason}; runTopologyIteration=${result.success ? "success" : "failure"}${result.success ? ` applied=${(result as { appliedCount: number }).appliedCount}` : ` error=${(result as { error: string }).error}`}`,
    });
  };

  if (fr.async !== false) {
    void doRun();
    await appendAudit(workspace, libraryPath, {
      op: "failureReplacement",
      flowId,
      actor: ACTOR,
      ts,
      detail: `${reason}; runTopologyIteration=async_scheduled`,
    });
  } else {
    await doRun();
  }
}

export type RunFailureReplacementScanResult = {
  scanned: number;
  triggered: string[];
  runCount: number;
  errors: string[];
};

/**
 * WO-BT-018 可选：独立任务 — 遍历流程库，对每个 flowId 做触发判定，满足则执行失败替换（与 performFailureReplacementAfterRun 同逻辑）。
 * 可由定时任务或 Gateway 方法 flows.scanFailureReplacement 按需调用。
 */
export async function runFailureReplacementScan(
  config: RezBotConfig,
  workspace: string,
  libraryPath: string
): Promise<RunFailureReplacementScanResult> {
  const fr = config.flows?.failureReplacement;
  if (!fr?.enabled) return { scanned: 0, triggered: [], runCount: 0, errors: [] };
  const list = await listFlows(workspace, libraryPath);
  const triggered: string[] = [];
  const errors: string[] = [];
  let runCount = 0;
  for (const { flowId } of list) {
    const { trigger, reason } = await shouldTriggerFailureReplacement(
      workspace,
      libraryPath,
      flowId,
      config
    );
    if (!trigger || !reason) continue;
    triggered.push(flowId);
    if (fr.markOnly) {
      await setFlowMetaFlaggedForReplacement(workspace, libraryPath, flowId, true);
      await appendAudit(workspace, libraryPath, {
        op: "failureReplacement",
        flowId,
        actor: ACTOR,
        ts: new Date().toISOString(),
        detail: `scan: ${reason}; markOnly=true`,
      });
      continue;
    }
    try {
      const failureSummary = await getRecentFailureSummaryWithOpLog(
        workspace,
        libraryPath,
        flowId,
        FAILURE_SUMMARY_LIMIT
      );
      const result = await runTopologyIteration({
        config,
        workspace,
        libraryPath,
        flowId,
        failureSummary: failureSummary || undefined,
        actor: ACTOR,
      });
      if (result.success) {
        await setFlowMetaFlaggedForReplacement(workspace, libraryPath, flowId, false);
        runCount++;
      }
      await appendAudit(workspace, libraryPath, {
        op: "failureReplacement",
        flowId,
        actor: ACTOR,
        ts: new Date().toISOString(),
        detail: `scan: ${reason}; runTopologyIteration=${result.success ? "success" : "failure"}`,
      });
    } catch (e) {
      errors.push(`${flowId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return {
    scanned: list.length,
    triggered,
    runCount,
    errors,
  };
}
