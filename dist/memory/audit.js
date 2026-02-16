/**
 * WO-305: 写入审计。每次 append 后记录 who（session）、when、from_where（session_id）、entry_id、workspace_id。
 */
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
export async function writeAuditLog(workspaceDir, record) {
    const dir = path.join(workspaceDir, ".rzeclaw");
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, "audit.jsonl");
    const line = JSON.stringify(record) + "\n";
    await appendFile(filePath, line);
}
