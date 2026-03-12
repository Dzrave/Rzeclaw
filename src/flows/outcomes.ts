/**
 * Phase 13 WO-BT-015: 执行结果记录。每次 flow 执行结束写 outcomes.jsonl（flowId、params 摘要、success、ts、可选 sessionId）。
 */

import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export type OutcomeEntry = {
  flowId: string;
  paramsSummary: string;
  success: boolean;
  ts: string;
  sessionId?: string;
};

const OUTCOMES_FILENAME = "outcomes.jsonl";

/**
 * 解析 outcomes 路径：若为相对路径则相对于 workspace，否则视为绝对路径（仅当以 / 或 \ 开头时）。
 */
function outcomesPath(workspace: string, libraryPath: string): string {
  const base = join(workspace, libraryPath);
  return join(base, OUTCOMES_FILENAME);
}

/**
 * 追加一条执行结果到 workspace/<libraryPath>/outcomes.jsonl。
 */
export async function appendOutcome(
  workspace: string,
  libraryPath: string,
  entry: OutcomeEntry
): Promise<void> {
  const dir = join(workspace, libraryPath);
  const file = outcomesPath(workspace, libraryPath);
  try {
    await mkdir(dir, { recursive: true });
    const line = JSON.stringify(entry) + "\n";
    await appendFile(file, line, "utf-8");
  } catch {
    // 写入失败不阻断主流程
  }
}

export type FlowSuccessRate = { successCount: number; failCount: number };

/**
 * 从 outcomes.jsonl 聚合每个 flowId 的成功/失败次数（WO-BT-016 路由优选用）。
 */
export async function getFlowSuccessRates(
  workspace: string,
  libraryPath: string
): Promise<Map<string, FlowSuccessRate>> {
  const file = outcomesPath(workspace, libraryPath);
  const map = new Map<string, FlowSuccessRate>();
  try {
    const raw = await readFile(file, "utf-8");
    const lines = raw.split("\n").filter((l) => l.trim());
    for (const line of lines) {
      const e = JSON.parse(line) as OutcomeEntry;
      const cur = map.get(e.flowId) ?? { successCount: 0, failCount: 0 };
      if (e.success) cur.successCount++;
      else cur.failCount++;
      map.set(e.flowId, cur);
    }
  } catch {
    // 文件不存在或解析错误
  }
  return map;
}

/**
 * 取指定 flowId 的最近 limit 条执行记录（按时间顺序，最后一条为最近）。
 * WO-BT-018 用于连续失败判定与失败摘要。
 */
export async function getRecentOutcomes(
  workspace: string,
  libraryPath: string,
  flowId: string,
  limit: number
): Promise<OutcomeEntry[]> {
  const file = outcomesPath(workspace, libraryPath);
  const list: OutcomeEntry[] = [];
  try {
    const raw = await readFile(file, "utf-8");
    const lines = raw.split("\n").filter((l) => l.trim());
    for (const line of lines) {
      const e = JSON.parse(line) as OutcomeEntry;
      if (e.flowId !== flowId) continue;
      list.push(e);
      if (list.length > limit) list.shift();
    }
  } catch {
    // 文件不存在或解析错误
  }
  return list;
}

/**
 * WO-BT-018: 从 outcomes 取该 flowId 最近 limit 条失败记录，格式化为供 LLM 参考的字符串。
 */
export async function getRecentFailureSummary(
  workspace: string,
  libraryPath: string,
  flowId: string,
  limit: number
): Promise<string> {
  const file = outcomesPath(workspace, libraryPath);
  const failures: OutcomeEntry[] = [];
  try {
    const raw = await readFile(file, "utf-8");
    const lines = raw.split("\n").filter((l) => l.trim());
    for (const line of lines) {
      const e = JSON.parse(line) as OutcomeEntry;
      if (e.flowId !== flowId || e.success) continue;
      failures.push(e);
      if (failures.length > limit) failures.shift();
    }
  } catch {
    return "";
  }
  if (failures.length === 0) return "";
  return failures
    .map((e) => `${e.paramsSummary} (${e.ts})`)
    .join("; ");
}
