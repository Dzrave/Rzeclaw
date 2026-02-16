/**
 * Write session summary ("学到了什么") to a file for human or later read-only use.
 */
export declare function writeSessionSummaryFile(params: {
    workspaceDir: string;
    sessionId: string;
    summary: string;
    factCount: number;
}): Promise<void>;
