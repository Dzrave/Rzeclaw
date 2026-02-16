export type ToolResult =
  | { ok: true; content: string }
  | { ok: false; error: string; code?: string; suggestion?: string };

export type ToolDef = {
  name: string;
  description: string;
  /** When to use, typical usage, common pitfalls (for prompt injection) */
  usageHint?: string;
  /** 1–2 JSON examples of input args (for prompt injection) */
  examples?: Array<Record<string, unknown>>;
  inputSchema: {
    type: "object";
    properties?: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
  handler: (args: Record<string, unknown>, cwd: string) => Promise<ToolResult>;
};
