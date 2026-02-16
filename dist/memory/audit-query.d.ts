/**
 * WO-407: 审计日志查询与导出。按 session_id / entry_id / 时间范围过滤，可导出 JSON 或 CSV。
 */
import type { AuditRecord } from "./audit.js";
export type AuditQueryOptions = {
    sessionId?: string;
    entry_id?: string;
    after?: string;
    before?: string;
};
/**
 * 查询审计日志，返回符合条件的记录。
 */
export declare function queryAuditLog(workspaceDir: string, options?: AuditQueryOptions): Promise<AuditRecord[]>;
/**
 * 导出审计日志为 JSON 或 CSV 字符串。
 */
export declare function exportAuditLog(records: AuditRecord[], format: "json" | "csv"): string;
