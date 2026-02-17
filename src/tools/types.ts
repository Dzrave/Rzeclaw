/** WO-IDE-002: 可选扩展字段，供可观测性、审计与能力路由使用；旧 handler 不返回这些字段仍合法 */
export type ToolResultExtension = {
  /** 操作后状态摘要（如 UI 焦点窗口摘要），便于模型验证与重试 */
  state_snapshot?: string;
  /** 实际使用的通道，如 "bash" | "ui_act" | "LSP" */
  channel_used?: string;
  /** 建议的下一步操作简述 */
  suggested_next?: string;
  /** 撤销该操作所需的工具与参数（若支持） */
  undoHint?: { tool: string; args: Record<string, unknown> };
  /** 异步长时操作的句柄，供 operation_status 轮询 */
  asyncHandle?: string;
};

export type ToolResult =
  | ({ ok: true; content: string } & Partial<ToolResultExtension>)
  | ({ ok: false; error: string; code?: string; suggestion?: string } & Partial<ToolResultExtension>);

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
  /** WO-IDE-002: 可选元数据，不破坏现有 CORE_TOOLS / Skill / MCP */
  version?: string;
  deprecated?: string;
  supportsDryRun?: boolean;
  supportsUndo?: boolean;
  /** 该工具默认超时（毫秒），未设时使用 config.ideOperation?.timeoutMs 或全局默认 */
  timeoutMs?: number;
};
