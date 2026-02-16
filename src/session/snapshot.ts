/**
 * WO-406: 会话快照与恢复。将会话状态序列化到文件；恢复时加载并继续。
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

export type SnapshotMessage = { role: "user" | "assistant"; content: string };

export type SessionSnapshot = {
  version: 1;
  sessionId: string;
  sessionGoal?: string;
  sessionSummary?: string;
  messages: SnapshotMessage[];
  savedAt: string;
};

const SNAPSHOT_DIR = "snapshots";

function snapshotPath(workspaceDir: string, sessionId: string): string {
  return path.join(workspaceDir, ".rzeclaw", SNAPSHOT_DIR, `${sessionId}.json`);
}

/**
 * 将会话状态写入快照文件。
 */
export async function writeSnapshot(
  workspaceDir: string,
  sessionId: string,
  data: Omit<SessionSnapshot, "version" | "sessionId" | "savedAt">
): Promise<void> {
  const dir = path.dirname(snapshotPath(workspaceDir, sessionId));
  await mkdir(dir, { recursive: true });
  const snapshot: SessionSnapshot = {
    version: 1,
    sessionId,
    sessionGoal: data.sessionGoal,
    sessionSummary: data.sessionSummary,
    messages: data.messages,
    savedAt: new Date().toISOString(),
  };
  await writeFile(
    snapshotPath(workspaceDir, sessionId),
    JSON.stringify(snapshot, null, 2),
    "utf-8"
  );
}

/**
 * 从快照文件加载会话状态。不存在或解析失败返回 null。
 */
export async function readSnapshot(
  workspaceDir: string,
  sessionId: string
): Promise<SessionSnapshot | null> {
  const filePath = snapshotPath(workspaceDir, sessionId);
  try {
    const raw = await readFile(filePath, "utf-8");
    const data = JSON.parse(raw) as SessionSnapshot;
    if (data.version !== 1 || !Array.isArray(data.messages)) return null;
    return data;
  } catch {
    return null;
  }
}

/** WO-512: 列出最近快照（sessionId + savedAt），按保存时间倒序。 */
export async function listSnapshots(
  workspaceDir: string,
  limit: number = 50
): Promise<Array<{ sessionId: string; savedAt: string }>> {
  const dir = path.join(workspaceDir, ".rzeclaw", SNAPSHOT_DIR);
  const { readdir, stat } = await import("node:fs/promises");
  try {
    const files = await readdir(dir);
    const withTime: Array<{ sessionId: string; savedAt: string }> = [];
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      const sessionId = f.slice(0, -5);
      const filePath = path.join(dir, f);
      try {
        const st = await stat(filePath);
        const raw = await readFile(filePath, "utf-8");
        const data = JSON.parse(raw) as SessionSnapshot;
        withTime.push({
          sessionId,
          savedAt: data.savedAt ?? new Date(st.mtime).toISOString(),
        });
      } catch {
        // skip invalid
      }
    }
    withTime.sort((a, b) => (b.savedAt > a.savedAt ? 1 : -1));
    return withTime.slice(0, limit);
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    throw e;
  }
}
