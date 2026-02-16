export type ToolResult = {
    ok: true;
    content: string;
} | {
    ok: false;
    error: string;
};
export type ToolDef = {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties?: Record<string, {
            type: string;
            description?: string;
        }>;
        required?: string[];
    };
    handler: (args: Record<string, unknown>, cwd: string) => Promise<ToolResult>;
};
