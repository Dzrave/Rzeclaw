/**
 * RAG-4: 待审区与早报。复盘产出的补丁写入此处，用户确认后应用。
 */

import { writeFile, readFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";

const RETROSPECTIVE_DIR = ".rezbot/retrospective";
const PENDING_DIR = "pending";

export type PendingPatch = {
  kind: "flow_edit" | "motivation_merge" | "report" | "exploration_trim";
  flowId?: string;
  ops?: unknown[];
  motivation?: unknown;
  /** WO-1655: 探索经验修剪 — 待删除的条目 id 列表 */
  explorationDeleteIds?: string[];
  summary: string;
};

export type PendingRun = {
  date: string;
  summary: string;
  patches: PendingPatch[];
  applied?: boolean;
  /** WO-1741: 记忆折叠产出的「昨日未完成任务」，供早报展示；用户通过 memory.rollingLedger.includePendingInReport 开启 */
  rollingLedgerPendingTasks?: string[];
};

function pendingDatePath(workspace: string, date: string): string {
  return join(workspace, RETROSPECTIVE_DIR, PENDING_DIR, date);
}

export async function writePending(
  workspace: string,
  date: string,
  run: PendingRun
): Promise<void> {
  const dir = pendingDatePath(workspace, date);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "report.json"),
    JSON.stringify(run, null, 2),
    "utf-8"
  );
}

export async function getMorningReport(
  workspace: string,
  date: string
): Promise<PendingRun | null> {
  const file = join(pendingDatePath(workspace, date), "report.json");
  try {
    const raw = await readFile(file, "utf-8");
    return JSON.parse(raw) as PendingRun;
  } catch {
    return null;
  }
}

export async function listPendingDates(workspace: string): Promise<string[]> {
  const dir = join(workspace, RETROSPECTIVE_DIR, PENDING_DIR);
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((d) => d.isDirectory()).map((d) => d.name).sort().reverse();
  } catch {
    return [];
  }
}

/**
 * WO-1741: 将记忆折叠产出的「昨日未完成任务」合并入指定日期的早报；若该日无报告则创建仅含此字段的报告。
 * reportDate 通常为「今天」，表示早报日期；tasks 为折叠得到的 pending_tasks。
 */
export async function mergeRollingLedgerPendingIntoReport(
  workspace: string,
  reportDate: string,
  tasks: string[]
): Promise<void> {
  if (!tasks.length) return;
  const existing = await getMorningReport(workspace, reportDate);
  const run: PendingRun = existing
    ? { ...existing, rollingLedgerPendingTasks: tasks }
    : { date: reportDate, summary: "", patches: [], rollingLedgerPendingTasks: tasks };
  await writePending(workspace, reportDate, run);
}

/**
 * 应用待审补丁：仅执行 flow_edit（applyEditOps）与 report 记录；motivation 需单独写入。
 */
export async function applyPending(
  workspace: string,
  date: string,
  applyFlowEdit: (flowId: string, ops: unknown[]) => Promise<boolean>,
  applyMotivation?: (entry: unknown) => Promise<boolean>
): Promise<{ applied: number; failed: string[] }> {
  const run = await getMorningReport(workspace, date);
  if (!run?.patches?.length) return { applied: 0, failed: [] };
  let applied = 0;
  const failed: string[] = [];
  for (const p of run.patches) {
    if (p.kind === "flow_edit" && p.flowId && Array.isArray(p.ops)) {
      try {
        if (await applyFlowEdit(p.flowId, p.ops)) applied++;
        else failed.push(`flow_edit ${p.flowId}`);
      } catch (e) {
        failed.push(`flow_edit ${p.flowId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    } else if (p.kind === "motivation_merge" && applyMotivation && p.motivation) {
      try {
        if (await applyMotivation(p.motivation)) applied++;
        else failed.push("motivation_merge");
      } catch (e) {
        failed.push(`motivation_merge: ${e instanceof Error ? e.message : String(e)}`);
      }
    } else if (p.kind === "exploration_trim" && Array.isArray(p.explorationDeleteIds) && p.explorationDeleteIds.length > 0) {
      try {
        const { removeExplorationEntries } = await import("../exploration/experience.js");
        removeExplorationEntries(workspace, p.explorationDeleteIds);
        applied++;
      } catch (e) {
        failed.push(`exploration_trim: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  run.applied = true;
  await writePending(workspace, date, run);
  return { applied, failed };
}
