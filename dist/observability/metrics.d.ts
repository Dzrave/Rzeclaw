/**
 * Lightweight per-session metrics: tool call count, failure count, total turns.
 * Persisted to a JSON file under workspace or state dir for later analysis.
 */
export type SessionMetrics = {
    session_id: string;
    tool_call_count: number;
    tool_failure_count: number;
    total_turns: number;
    ts: string;
};
export declare function setMetricsDir(dir: string): void;
export declare function recordSession(metrics: SessionMetrics): Promise<void>;
export declare function readSessionMetrics(limit?: number): Promise<SessionMetrics[]>;
/** WO-508: 从指定目录读取会话指标（用于 CLI 导出等）。 */
export declare function readSessionMetricsFromDir(workspaceOrMetricsDir: string, limit?: number): Promise<SessionMetrics[]>;
