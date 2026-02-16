/**
 * WO-406: 会话快照与恢复。将会话状态序列化到文件；恢复时加载并继续。
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
const SNAPSHOT_DIR = "snapshots";
function snapshotPath(workspaceDir, sessionId) {
    return path.join(workspaceDir, ".rzeclaw", SNAPSHOT_DIR, `${sessionId}.json`);
}
/**
 * 将会话状态写入快照文件。
 */
export async function writeSnapshot(workspaceDir, sessionId, data) {
    const dir = path.dirname(snapshotPath(workspaceDir, sessionId));
    await mkdir(dir, { recursive: true });
    const snapshot = {
        version: 1,
        sessionId,
        sessionGoal: data.sessionGoal,
        sessionSummary: data.sessionSummary,
        messages: data.messages,
        savedAt: new Date().toISOString(),
    };
    await writeFile(snapshotPath(workspaceDir, sessionId), JSON.stringify(snapshot, null, 2), "utf-8");
}
/**
 * 从快照文件加载会话状态。不存在或解析失败返回 null。
 */
export async function readSnapshot(workspaceDir, sessionId) {
    const filePath = snapshotPath(workspaceDir, sessionId);
    try {
        const raw = await readFile(filePath, "utf-8");
        const data = JSON.parse(raw);
        if (data.version !== 1 || !Array.isArray(data.messages))
            return null;
        return data;
    }
    catch {
        return null;
    }
}
/** WO-512: 列出最近快照（sessionId + savedAt），按保存时间倒序。 */
export async function listSnapshots(workspaceDir, limit = 50) {
    const dir = path.join(workspaceDir, ".rzeclaw", SNAPSHOT_DIR);
    const { readdir, stat } = await import("node:fs/promises");
    try {
        const files = await readdir(dir);
        const withTime = [];
        for (const f of files) {
            if (!f.endsWith(".json"))
                continue;
            const sessionId = f.slice(0, -5);
            const filePath = path.join(dir, f);
            try {
                const st = await stat(filePath);
                const raw = await readFile(filePath, "utf-8");
                const data = JSON.parse(raw);
                withTime.push({
                    sessionId,
                    savedAt: data.savedAt ?? new Date(st.mtime).toISOString(),
                });
            }
            catch {
                // skip invalid
            }
        }
        withTime.sort((a, b) => (b.savedAt > a.savedAt ? 1 : -1));
        return withTime.slice(0, limit);
    }
    catch (e) {
        if (e?.code === "ENOENT")
            return [];
        throw e;
    }
}
