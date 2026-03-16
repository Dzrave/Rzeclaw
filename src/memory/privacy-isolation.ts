/**
 * WO-1511: 隐私隔离存储的清理。隔离文件不参与全局检索；会话结束或超过保留期后删除。
 */

import { unlink, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { getPrivacyIsolatedDir, getPrivacyIsolatedFilePath } from "./store-jsonl.js";

/** 删除指定会话的隔离文件；retention 为 0 时在会话结束时调用 */
export async function cleanupPrivacyIsolatedForSession(
  workspaceDir: string,
  sessionId: string
): Promise<boolean> {
  const filePath = getPrivacyIsolatedFilePath(workspaceDir, sessionId);
  try {
    await unlink(filePath);
    return true;
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return false;
    throw e;
  }
}

/** 删除隔离目录中 mtime 早于 retentionDays 天的文件；返回删除数量 */
export async function cleanupPrivacyIsolated(
  workspaceDir: string,
  retentionDays: number
): Promise<number> {
  if (retentionDays <= 0) return 0;
  const dir = getPrivacyIsolatedDir(workspaceDir);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return 0;
    throw e;
  }
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  let deleted = 0;
  for (const name of entries) {
    if (!name.endsWith(".jsonl")) continue;
    const filePath = path.join(dir, name);
    try {
      const st = await stat(filePath);
      if (st.mtimeMs < cutoff) {
        await unlink(filePath);
        deleted++;
      }
    } catch {
      // ignore single file errors
    }
  }
  return deleted;
}
