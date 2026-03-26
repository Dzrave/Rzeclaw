/**
 * Phase 16 WO-1602 / WO-1603: Gatekeeper — 负向条件与正向触发条件
 * 决定请求是否进入探索层（不进入则直通执行层）。
 */

import type { RezBotConfig } from "../config.js";
import { isComplexRequest } from "../agent/planning.js";
import { readTelemetry } from "../retrospective/telemetry.js";

/** 开放性/复杂任务关键词，用于正向触发 */
const OPEN_INTENT_PATTERN = /设计|重构|先|再|然后|步骤|第一步|分步|依次|首先|接着|最后|多个|几个文件|多个命令/i;

/** 不确定性关键词/模式：消息含此类则给 0.5～0.7 得分（WO-1603 uncertaintyThreshold） */
const UNCERTAINTY_PATTERN = /[?？]|可能|也许|不确定|不太确定|说不定|或许|大概|试试|尝试一下/i;

/**
 * WO-1602: 是否应跳过探索层（负向条件）
 * 当 exploration.enabled === false 或已命中某 flow 时，不进入探索层。
 */
export function shouldSkipExploration(
  config: RezBotConfig,
  matched: { flowId: string; params: Record<string, string> } | null,
  meta?: { explorationOptOut?: boolean }
): boolean {
  if (config.exploration?.enabled !== true) return true;
  if (matched != null) return true;
  if (meta?.explorationOptOut === true) return true;
  return false;
}

/** 简单不确定性得分 0～1：含 ?/可能/也许等给 0.5～0.7 */
function getUncertaintyScore(message: string): number {
  const m = (message ?? "").trim();
  if (!m) return 0;
  if (UNCERTAINTY_PATTERN.test(m)) return 0.6;
  return 0;
}

/** 近期执行失败率（exploration_outcome + flow_end），0～1 */
async function getRecentFailureRate(workspace: string, since: string): Promise<number> {
  const events = await readTelemetry(workspace, since);
  const relevant = events.filter(
    (e) => e.type === "exploration_outcome" || e.type === "flow_end"
  );
  let fail = 0;
  let total = 0;
  for (const e of relevant) {
    if (e.success === false) fail++;
    if (e.success === true || e.success === false) total++;
  }
  if (total === 0) return 0;
  return fail / total;
}

/**
 * WO-1603: 当未命中 flow 时，是否应进入探索层（正向触发）
 * 满足任一向条件且无负向时判定为「需探索」。支持 uncertaintyThreshold、failureRateThreshold（需传 workspace）。
 */
export async function shouldEnterExploration(
  config: RezBotConfig,
  message: string,
  options?: { workspace?: string }
): Promise<boolean> {
  if (config.exploration?.enabled !== true) return false;

  const trigger = config.exploration.trigger;
  const thresholdChars =
    trigger?.complexThresholdChars ??
    config.planning?.complexThresholdChars ??
    80;

  if ((message ?? "").trim().length >= thresholdChars) return true;
  if (OPEN_INTENT_PATTERN.test(message ?? "")) return true;

  if (trigger?.openIntents?.length) {
    const lower = (message ?? "").toLowerCase();
    for (const intent of trigger.openIntents) {
      if (lower.includes(intent.toLowerCase())) return true;
    }
  }

  if (config.planning?.enabled && isComplexRequest(message, config)) return true;

  if (
    typeof trigger?.uncertaintyThreshold === "number" &&
    trigger.uncertaintyThreshold > 0
  ) {
    const score = getUncertaintyScore(message);
    if (score >= trigger.uncertaintyThreshold) return true;
  }

  if (
    typeof trigger?.failureRateThreshold === "number" &&
    trigger.failureRateThreshold > 0 &&
    options?.workspace
  ) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const rate = await getRecentFailureRate(options.workspace, since);
    if (rate >= trigger.failureRateThreshold) return true;
  }

  return false;
}
