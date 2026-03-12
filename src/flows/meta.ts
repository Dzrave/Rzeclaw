/**
 * Phase 13 WO-BT-017: 元数据更新。定时或执行后更新 flow 元数据（successCount、failCount、lastUsed）；经验更新任务只写不读业务逻辑。
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export type FlowMetaEntry = {
  successCount: number;
  failCount: number;
  lastUsed: string;
  /** WO-BT-018: 是否被标记为待替换（markOnly 时仅写此字段） */
  flaggedForReplacement?: boolean;
};

const META_FILENAME = "meta.json";

function metaPath(workspace: string, libraryPath: string): string {
  return join(workspace, libraryPath, META_FILENAME);
}

export type FlowMetaMap = Record<string, FlowMetaEntry>;

/** WO-BT-018: 供 listFlows 等合并 meta.json 以展示 flaggedForReplacement */
export async function getFlowMetaMap(
  workspace: string,
  libraryPath: string
): Promise<FlowMetaMap> {
  const file = metaPath(workspace, libraryPath);
  try {
    const raw = await readFile(file, "utf-8");
    const data = JSON.parse(raw) as FlowMetaMap;
    return typeof data === "object" && data != null ? data : {};
  } catch {
    return {};
  }
}

/**
 * 更新指定 flowId 的元数据：递增 success 或 fail，并设置 lastUsed 为当前 ISO 时间。
 */
export async function updateFlowMetaAfterRun(
  workspace: string,
  libraryPath: string,
  flowId: string,
  success: boolean
): Promise<void> {
  const dir = join(workspace, libraryPath);
  const file = metaPath(workspace, libraryPath);
  try {
    await mkdir(dir, { recursive: true });
    const meta = await getFlowMetaMap(workspace, libraryPath);
    const cur = meta[flowId] ?? { successCount: 0, failCount: 0, lastUsed: "" };
    if (success) cur.successCount++;
    else cur.failCount++;
    cur.lastUsed = new Date().toISOString();
    meta[flowId] = cur;
    await writeFile(file, JSON.stringify(meta, null, 2), "utf-8");
  } catch {
    // 写入失败不阻断主流程
  }
}

/**
 * WO-BT-018: 设置或清除 flow 的「待替换」标记（markOnly 时使用）。
 */
export async function setFlowMetaFlaggedForReplacement(
  workspace: string,
  libraryPath: string,
  flowId: string,
  value: boolean
): Promise<void> {
  const dir = join(workspace, libraryPath);
  const file = metaPath(workspace, libraryPath);
  try {
    await mkdir(dir, { recursive: true });
    const meta = await getFlowMetaMap(workspace, libraryPath);
    const cur = meta[flowId] ?? { successCount: 0, failCount: 0, lastUsed: "" };
    cur.flaggedForReplacement = value;
    meta[flowId] = cur;
    await writeFile(file, JSON.stringify(meta, null, 2), "utf-8");
  } catch {
    // 写入失败不阻断主流程
  }
}
