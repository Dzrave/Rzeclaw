/**
 * WO-406: 会话快照与恢复。将会话状态序列化到文件；恢复时加载并继续。
 */
export type SnapshotMessage = {
    role: "user" | "assistant";
    content: string;
};
export type SessionSnapshot = {
    version: 1;
    sessionId: string;
    sessionGoal?: string;
    sessionSummary?: string;
    messages: SnapshotMessage[];
    savedAt: string;
};
/**
 * 将会话状态写入快照文件。
 */
export declare function writeSnapshot(workspaceDir: string, sessionId: string, data: Omit<SessionSnapshot, "version" | "sessionId" | "savedAt">): Promise<void>;
/**
 * 从快照文件加载会话状态。不存在或解析失败返回 null。
 */
export declare function readSnapshot(workspaceDir: string, sessionId: string): Promise<SessionSnapshot | null>;
/** WO-512: 列出最近快照（sessionId + savedAt），按保存时间倒序。 */
export declare function listSnapshots(workspaceDir: string, limit?: number): Promise<Array<{
    sessionId: string;
    savedAt: string;
}>>;
