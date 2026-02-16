export type RzeclawConfig = {
    /** LLM model id (e.g. anthropic/claude-sonnet-4-20250514) */
    model: string;
    /** Workspace root for agent (files, cwd for bash) */
    workspace: string;
    /** Gateway WS port */
    port: number;
    /** API key source: env var name or leave empty to use ANTHROPIC_API_KEY / OPENAI_API_KEY */
    apiKeyEnv?: string;
};
export declare function loadConfig(overridePath?: string): RzeclawConfig;
export declare function getApiKey(config: RzeclawConfig): string | undefined;
