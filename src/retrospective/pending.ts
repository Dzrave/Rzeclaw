/**
 * RAG-4: 待审区与早报。复盘产出的补丁写入此处，用户确认后应用。
 */

import { writeFile, readFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";

const RETROSPECTIVE_DIR = ".rzeclaw/retrospective";
const PENDING_DIR = "pending";

export type PendingPatch = {
  kind: "flow_edit" | "motivation_merge" | "report";
  flowId?: string;
  ops?: unknown[];
  motivation?: unknown;
  summary: string;
};

export type PendingRun = {
  date: string;
  summary: string;
  patches: PendingPatch[];
  applied?: boolean;
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
    }
  }
  run.applied = true;
  await writePending(workspace, date, run);
  return { applied, failed };
}
