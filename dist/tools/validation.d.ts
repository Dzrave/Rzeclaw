export type ValidationFailure = {
    code: string;
    message: string;
    suggestion: string;
};
export declare function validateToolArgs(toolName: string, args: Record<string, unknown>, cwd: string): ValidationFailure | null;
