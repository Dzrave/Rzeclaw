/**
 * Write session summary ("学到了什么") to a file for human or later read-only use.
 * Phase 15: readYesterdaySummary for office frontend "昨日小记".
 */
export declare function writeSessionSummaryFile(params: {
    workspaceDir: string;
    sessionId: string;
    summary: string;
    factCount: number;
}): Promise<void>;
/**
 * Read session summary files whose mtime date is yesterday, concatenate for "昨日小记".
 * Returns empty memo if no files or dir missing.
 */
export declare function readYesterdaySummary(workspaceDir: string): Promise<{
    date: string;
    memo: string;
}>;
