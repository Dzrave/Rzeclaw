/**
 * WO-407: 审计日志查询与导出。按 session_id / entry_id / 时间范围过滤，可导出 JSON 或 CSV。
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
const AUDIT_FILENAME = "audit.jsonl";
/**
 * 查询审计日志，返回符合条件的记录。
 */
export async function queryAuditLog(workspaceDir, options = {}) {
    const filePath = path.join(workspaceDir, ".rzeclaw", AUDIT_FILENAME);
    let raw;
    try {
        raw = await readFile(filePath, "utf-8");
    }
    catch (e) {
        if (e?.code === "ENOENT")
            return [];
        throw e;
    }
    const records = [];
    for (const line of raw.split("\n").filter(Boolean)) {
        try {
            const r = JSON.parse(line);
            if (options.sessionId != null && r.who !== options.sessionId && r.from_where !== options.sessionId)
                continue;
            if (options.entry_id != null && r.entry_id !== options.entry_id)
                continue;
            if (options.after != null && r.when < options.after)
                continue;
            if (options.before != null && r.when > options.before)
                continue;
            records.push(r);
        }
        catch {
            // skip malformed lines
        }
    }
    return records;
}
/**
 * 导出审计日志为 JSON 或 CSV 字符串。
 */
export function exportAuditLog(records, format) {
    if (format === "json") {
        return JSON.stringify(records, null, 2);
    }
    if (records.length === 0)
        return "when,who,from_where,entry_id,workspace_id";
    const header = "when,who,from_where,entry_id,workspace_id";
    const rows = records.map((r) => `${escapeCsv(r.when)},${escapeCsv(r.who)},${escapeCsv(r.from_where)},${escapeCsv(r.entry_id)},${escapeCsv(r.workspace_id ?? "")}`);
    return [header, ...rows].join("\n");
}
function escapeCsv(s) {
    if (!s.includes(",") && !s.includes('"') && !s.includes("\n"))
        return s;
    return `"${String(s).replace(/"/g, '""')}"`;
}
