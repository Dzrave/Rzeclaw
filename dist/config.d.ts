export type MemoryConfig = {
    enabled?: boolean;
    /** Storage path; default derived from workspace/.rzeclaw/memory */
    storagePath?: string;
    /** Isolation: default from workspace path */
    workspaceId?: string;
    /** WO-407: L1 条目创建时间早于多少天移入冷存储 (0=关闭) */
    coldAfterDays?: number;
};
/** WO-404: Bootstrap / 自举文档路径等 */
export type EvolutionConfig = {
    /** Path relative to workspace or absolute; default WORKSPACE_BEST_PRACTICES.md in workspace */
    bootstrapDocPath?: string;
};
/** WO-403: 轻量规划，可选开启 */
export type PlanningConfig = {
    enabled?: boolean;
    /** 最多保留步骤数 (default 10) */
    maxSteps?: number;
    /** 消息长度超过此字符数视为复杂请求 (default 80) */
    complexThresholdChars?: number;
};
export type RzeclawConfig = {
    /** LLM model id (e.g. anthropic/claude-sonnet-4-20250514) */
    model: string;
    /** Workspace root for agent (files, cwd for bash) */
    workspace: string;
    /** Gateway WS port */
    port: number;
    /** API key source: env var name or leave empty to use ANTHROPIC_API_KEY / OPENAI_API_KEY */
    apiKeyEnv?: string;
    /** Memory (L1/L2) and context options */
    memory?: MemoryConfig;
    /** Max conversation rounds to keep in context (default 5) */
    contextWindowRounds?: number;
    /** WO-402: 每 K 次工具调用后插入反思提示 (default 3) */
    reflectionToolCallInterval?: number;
    /** WO-505: L0 每 M 轮生成会话内摘要 (0=关闭)；下一轮 = 摘要 + 最近 1～2 轮 */
    summaryEveryRounds?: number;
    /** WO-404/405: Bootstrap 与 Prompt 建议等 */
    evolution?: EvolutionConfig;
    /** WO-403: 轻量规划（先出步骤再执行） */
    planning?: PlanningConfig;
};
export declare function loadConfig(overridePath?: string): RzeclawConfig;
export declare function getApiKey(config: RzeclawConfig): string | undefined;
