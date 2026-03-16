/**
 * Phase 16 WO-1655: 复盘对探索经验的动作 — 质量报告与待审补丁（合并/删除/降权）
 * 架构师不直接写库，仅产出补丁；用户确认后由 applyPending 应用。
 */

import { listRecent } from "../exploration/experience.js";
import type { PendingPatch } from "./pending.js";

const LOW_SUCCESS_RATE_THRESHOLD = 0.2;
const MIN_SAMPLES_FOR_PRUNE = 2;
const MAX_ENTRIES_FOR_REPORT = 100;

export type ExplorationQualityReport = {
  report: string;
  patches: PendingPatch[];
};

/**
 * 生成探索经验质量报告与建议补丁（删除低成功率、低复用条目）
 */
export async function reportExplorationExperience(workspace: string): Promise<ExplorationQualityReport> {
  const entries = listRecent(workspace, MAX_ENTRIES_FOR_REPORT);
  if (entries.length === 0) {
    return { report: "探索经验条目数为 0，无需修剪。", patches: [] };
  }

  const lines: string[] = ["【探索经验质量报告】", ""];
  const deleteIds: string[] = [];

  for (const e of entries) {
    const success = e.outcome_success_count ?? 0;
    const fail = e.outcome_fail_count ?? 0;
    const total = success + fail;
    const rate = total >= MIN_SAMPLES_FOR_PRUNE ? success / total : null;
    const reuse = e.reuse_count ?? 0;
    const sig = (e.task_signature ?? "").slice(0, 40) + (e.task_signature && e.task_signature.length > 40 ? "…" : "");
    lines.push(`- id=${e.id.slice(0, 8)}… 签名=${sig} 复用=${reuse} 成功=${success} 失败=${fail} 成功率=${rate != null ? (rate * 100).toFixed(0) + "%" : "-"}`);

    if (total >= MIN_SAMPLES_FOR_PRUNE && rate !== null && rate < LOW_SUCCESS_RATE_THRESHOLD && reuse < 2) {
      deleteIds.push(e.id);
    }
  }

  const patches: PendingPatch[] = [];
  if (deleteIds.length > 0) {
    patches.push({
      kind: "exploration_trim",
      explorationDeleteIds: deleteIds,
      summary: `建议删除 ${deleteIds.length} 条低成功率且低复用探索经验（成功率 < ${LOW_SUCCESS_RATE_THRESHOLD * 100}%、复用 < 2）`,
    });
  }

  lines.push("");
  if (deleteIds.length > 0) {
    lines.push(`建议修剪 ${deleteIds.length} 条条目，待用户确认后应用。`);
  } else {
    lines.push("当前无建议删除的条目。");
  }

  return {
    report: lines.join("\n"),
    patches,
  };
}
