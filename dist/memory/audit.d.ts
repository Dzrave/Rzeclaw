/**
 * WO-305: 写入审计。每次 append 后记录 who（session）、when、from_where（session_id）、entry_id、workspace_id。
 */
export type AuditRecord = {
    when: string;
    who: string;
    from_where: string;
    entry_id: string;
    workspace_id?: string;
};
export declare function writeAuditLog(workspaceDir: string, record: AuditRecord): Promise<void>;
