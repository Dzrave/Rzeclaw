/**
 * WO-407: 冷归档。将热存储中早于 coldAfterDays 的 L1 条目移入冷文件，热存储只保留近期条目。
 */
import { readFile, writeFile, appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { getHotFilePath, getColdFilePath } from "./store-jsonl.js";
function parseLine(line) {
    const t = line.trim();
    if (!t)
        return null;
    try {
        return JSON.parse(t);
    }
    catch {
        return null;
    }
}
/**
 * 将热存储中 created_at 早于 cutoff 的条目移入冷文件；热文件重写为仅保留近期条目。
 * @param coldAfterDays 创建时间早于多少天的条目移入冷存储
 * @returns 移入冷存储的条数
 */
export async function archiveCold(workspaceDir, workspaceId, coldAfterDays) {
    if (coldAfterDays <= 0)
        return 0;
    const cutoff = new Date(Date.now() - coldAfterDays * 24 * 60 * 60 * 1000).toISOString();
    const hotPath = getHotFilePath(workspaceDir, workspaceId);
    const coldPath = getColdFilePath(workspaceDir, workspaceId);
    let raw;
    try {
        raw = await readFile(hotPath, "utf-8");
    }
    catch (e) {
        if (e?.code === "ENOENT")
            return 0;
        throw e;
    }
    const lines = raw.split("\n").filter(Boolean);
    const hotLines = [];
    const coldLines = [];
    for (const line of lines) {
        const e = parseLine(line);
        if (!e)
            continue;
        if (e.created_at < cutoff)
            coldLines.push(line);
        else
            hotLines.push(line);
    }
    if (coldLines.length === 0)
        return 0;
    await mkdir(path.dirname(hotPath), { recursive: true });
    await writeFile(hotPath, hotLines.map((l) => l + "\n").join(""), "utf-8");
    await mkdir(path.dirname(coldPath), { recursive: true });
    await appendFile(coldPath, coldLines.map((l) => l + "\n").join(""), "utf-8");
    return coldLines.length;
}
