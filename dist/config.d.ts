export type MemoryConfig = {
    enabled?: boolean;
    /** Storage path; default derived from workspace/.rzeclaw/memory */
    storagePath?: string;
    /** Isolation: default from workspace path */
    workspaceId?: string;
    /** WO-407: L1 条目创建时间早于多少天移入冷存储 (0=关闭) */
    coldAfterDays?: number;
};
/** WO-BT-024: 进化插入树配置 */
export type InsertTreeConfig = {
    enabled?: boolean;
    autoRun?: boolean;
    requireUserConfirmation?: boolean;
    allowHighRiskOp?: boolean;
    /** 目标 flowId（插入新节点的 BT） */
    targetFlowId?: string;
    /** 目标 Selector 的 nodeId；若为空则用 root */
    targetSelectorNodeId?: string;
    /** 进化产物存放目录，相对 workspace，默认 .rzeclaw/evolved_skills */
    evolvedSkillsDir?: string;
    sandboxTimeoutMs?: number;
    maxRetries?: number;
};
/** WO-404: Bootstrap / 自举文档路径等；WO-BT-024 进化插入树 */
export type EvolutionConfig = {
    /** Path relative to workspace or absolute; default WORKSPACE_BEST_PRACTICES.md in workspace */
    bootstrapDocPath?: string;
    insertTree?: InsertTreeConfig;
};
/** WO-403: 轻量规划，可选开启 */
export type PlanningConfig = {
    enabled?: boolean;
    /** 最多保留步骤数 (default 10) */
    maxSteps?: number;
    /** 消息长度超过此字符数视为复杂请求 (default 80) */
    complexThresholdChars?: number;
};
/** WO-606/608: 本地 Skill 目录，白名单加载 */
export type SkillsConfig = {
    enabled?: boolean;
    /** 相对 workspace 的目录，默认 .rzeclaw/skills */
    dir?: string;
};
/** WO-609: MCP Server 配置 */
export type McpServerEntry = {
    name: string;
    /** 可执行命令，如 "npx" 或 "node" */
    command: string;
    /** 参数，如 ["-y", "some-mcp-server"] */
    args?: string[];
};
/** WO-609: MCP 配置 */
export type McpConfig = {
    enabled?: boolean;
    servers?: McpServerEntry[];
};
/** WO-615 / Phase 9: Heartbeat 配置 */
export type HeartbeatConfig = {
    /** 定时间隔（分钟），0 表示关闭 */
    intervalMinutes?: number;
    /** 待办/清单文件路径，相对 workspace，如 HEARTBEAT.md */
    checklistPath?: string;
    /** Phase 9: Check 阶段是否用 LLM 判断是否执行 */
    checkUseLLM?: boolean;
    /** Phase 9: 是否要求用户确认后再执行（仅写回 pending） */
    requireConfirmation?: boolean;
};
/** Phase 8: Gateway 监听与认证 */
export type GatewayAuthConfig = {
    enabled?: boolean;
    /** 环境变量名，用于读取 API Key；默认 RZECLAW_GATEWAY_API_KEY */
    apiKeyEnv?: string;
};
export type GatewayDiscoveryConfig = {
    enabled?: boolean;
};
export type GatewayConfig = {
    /** 监听地址，默认 127.0.0.1；0.0.0.0 允许局域网连接 */
    host?: string;
    auth?: GatewayAuthConfig;
    /** Phase 8 WO-807: 局域网 mDNS 发现 */
    discovery?: GatewayDiscoveryConfig;
};
/** Phase 10 WO-1001/1009: 角色与蜂群管理 system 片段 */
export type RolesConfig = {
    dev?: string;
    knowledge?: string;
    pm?: string;
    swarm_manager?: string;
    general?: string;
};
/** Phase 10: 多层级蜂群 — 命名团队 */
export type SwarmTeamEntry = {
    id: string;
    name: string;
    workspaces?: string[];
};
export type SwarmConfig = {
    teams?: SwarmTeamEntry[];
    defaultTeamId?: string;
};
/** Phase 11: 知识库摄取与咨询 */
export type KnowledgeConfig = {
    ingestPaths?: string[];
    ingestOnStart?: boolean;
    retrieveLimit?: number;
};
/** Phase 12: 自我诊断报告 */
export type DiagnosticConfig = {
    /** 报告时间范围（天）；默认 7 */
    intervalDays?: number;
    /** 报告输出目录，相对 workspace，默认 .rzeclaw/diagnostics */
    outputPath?: string;
    /** 定时报告间隔（天），0=不定时 */
    intervalDaysSchedule?: number;
};
/** Phase 13 WO-BT-001: 流程（行为树/状态机）配置 */
export type FlowsSlotRule = {
    name: string;
    pattern: string;
};
export type FlowsRouteEntry = {
    hint: string;
    flowId: string;
    slotRules?: FlowsSlotRule[];
};
/** WO-BT-018: 失败分支替换策略 */
export type FailureReplacementConfig = {
    /** 是否启用失败率/连续失败触发 */
    enabled?: boolean;
    /** 失败率阈值 0~1，超过则触发 */
    failureRateThreshold?: number;
    /** 至少多少条执行记录后才计算失败率（避免样本过少） */
    minSamples?: number;
    /** 最近连续失败次数达到此值则触发 */
    consecutiveFailuresThreshold?: number;
    /** 为 true 时仅标记 meta.flaggedForReplacement，不调用 runTopologyIteration */
    markOnly?: boolean;
    /** 为 true 时异步执行 runTopologyIteration，不阻塞 chat 响应 */
    async?: boolean;
};
/** WO-LM-001: 本地模型意图分类模式；仅用于路由，不替代主 LLM */
export type IntentClassifierModeConfig = {
    /** 是否在规则未命中时调用本地模型得到 router_v1 */
    enabled?: boolean;
    /** 采纳 ROUTE_TO_LOCAL_FLOW 的最低置信度 0~1，默认 0.7 */
    confidenceThreshold?: number;
};
/** WO-LM-001: 本地模型配置（意图分类等）；不随包分发模型，仅对接用户自建服务 */
export type LocalModelConfig = {
    /** 总开关；未配置或 false 时不调用本地模型 */
    enabled?: boolean;
    /** ollama | openai-compatible */
    provider?: "ollama" | "openai-compatible";
    /** 服务地址，如 http://127.0.0.1:11434 */
    endpoint?: string;
    /** 模型名，如 qwen2.5:3b、gpt-3.5-turbo */
    model?: string;
    /** 请求超时毫秒，默认 15000 */
    timeoutMs?: number;
    /** 模式：意图分类等 */
    modes?: {
        intentClassifier?: IntentClassifierModeConfig;
    };
};
/** RAG-1: 向量嵌入与检索；单集合配置 */
export type VectorEmbeddingCollectionConfig = {
    enabled?: boolean;
    /** 可选：该集合索引路径覆盖默认 indexStoragePath 下子目录 */
    pathOverride?: string;
};
/** RAG-1: vectorEmbedding 配置扩展 */
export type VectorEmbeddingConfig = {
    enabled?: boolean;
    /** ollama | openai-compatible；ollama 用 /api/embeddings */
    provider?: "ollama" | "openai-compatible";
    /** 嵌入服务 URL，如 http://127.0.0.1:11434 */
    endpoint?: string;
    /** 模型名，如 nomic-embed-text、text-embedding-3-small */
    model?: string;
    /** 索引存储路径，相对 workspace，如 .rzeclaw/embeddings */
    indexStoragePath?: string;
    /** 各集合（motivation、skills、flows、external_* 等） */
    collections?: Record<string, VectorEmbeddingCollectionConfig>;
    /** RAG-2: 动机 RAG 命中阈值 0~1 */
    motivationThreshold?: number;
};
/** WO-BT-014: LLM 触发生成 flow；用户一句话 → 生成请求 → createFlow(spec) */
export type GenerateFlowConfig = {
    /** 是否启用「无匹配时尝试用 LLM 生成新 flow」或显式请求生成 */
    enabled?: boolean;
    /** 当路由无匹配时是否尝试生成（否则仅显式请求时生成） */
    triggerOnNoMatch?: boolean;
    /** 显式触发短语的正则或子串，如「做一个.*流程」；未配置时用默认模式 */
    triggerPattern?: string;
};
export type FlowsConfig = {
    /** 关闭则所有请求仍走 Agent；未配置时默认关闭 */
    enabled?: boolean;
    /** 相对 workspace 的目录，存放 flow JSON，如 .rzeclaw/flows */
    libraryPath?: string;
    /** 意图/hint 到 flowId 的映射；可选 slotRules 从 message 抽取 params */
    routes?: FlowsRouteEntry[];
    /** WO-BT-018: 失败分支替换策略 */
    failureReplacement?: FailureReplacementConfig;
    /** WO-BT-014: LLM 触发生成 flow */
    generateFlow?: GenerateFlowConfig;
};
/** IDE/PC 操作能力（WO-IDE-001）：L2/L3 默认关闭，显式启用 */
export type IdeOperationConfirmPolicy = {
    /** 需要确认的工具名列表，如 ["ui_act", "bash"] */
    tools?: string[];
    /** 是否要求敏感操作需用户确认后执行 */
    requireConfirm?: boolean;
};
export type IdeOperationConfig = {
    /** 是否启用程序化 UI 自动化（ui_describe / ui_act / ui_focus） */
    uiAutomation?: boolean;
    /** 是否启用键鼠模拟（L3） */
    keyMouse?: boolean;
    /** 是否启用视觉定位点击（L3） */
    visualClick?: boolean;
    /** 仅允许操作的应用/进程名列表，如 ["Code", "cmd", "Windows Terminal"] */
    allowedApps?: string[];
    /** 工具执行默认超时（毫秒），如 60000 */
    timeoutMs?: number;
    /** 确认策略：需确认的工具或全局要求确认 */
    confirmPolicy?: IdeOperationConfirmPolicy;
};
/** WO-SEC-001: 危险命令策略 */
export type DangerousCommandsMode = "block" | "confirm" | "dryRunOnly";
export type DangerousCommandsConfig = {
    mode?: DangerousCommandsMode;
    /** 自定义正则或子串模式（与内置规则合并）；命中则按 mode 处理 */
    patterns?: string[];
};
/** WO-SEC-003: process kill 保护 */
/** WO-SEC-009: 权限域策略 */
export type PermissionScopePolicy = "allow" | "confirm" | "deny";
export type SecurityConfig = {
    dangerousCommands?: DangerousCommandsConfig;
    processKillRequireConfirm?: boolean;
    protectedPids?: number[];
    permissionScopes?: Partial<Record<string, PermissionScopePolicy>>;
    scheduledGrants?: Array<{
        scope: string;
        window: string;
    }>;
};
/** 多模型：LLM 提供商与云端/本地切换 */
export type LlmProvider = "anthropic" | "deepseek" | "minimax" | "ollama";
export type LlmConfig = {
    /** 提供商：anthropic / deepseek / minimax（云端）；ollama（本地） */
    provider: LlmProvider;
    /** 模型 ID，如 claude-sonnet-4-20250514、deepseek-chat、M2-her、llama3.2 等 */
    model: string;
    /** 云端 API Key 环境变量名；ollama 无需 */
    apiKeyEnv?: string;
    /** 仅 ollama：服务 base URL，默认 http://localhost:11434 */
    baseURL?: string;
    /** 仅当 provider 为 ollama 时生效：本地不可用时是否回退到该云端提供商 */
    fallbackProvider?: "anthropic" | "deepseek" | "minimax";
};
export type RzeclawConfig = {
    /** LLM model id (e.g. anthropic/claude-sonnet-4-20250514)；当配置了 llm 时由 llm.model 覆盖 */
    model: string;
    /** Workspace root for agent (files, cwd for bash) */
    workspace: string;
    /** Gateway WS port */
    port: number;
    /** API key source: env var name or leave empty to use ANTHROPIC_API_KEY；当配置了 llm 时由 llm.apiKeyEnv 覆盖 */
    apiKeyEnv?: string;
    /** 多模型与云端/本地切换；不配置时等价于 provider: anthropic + model/apiKeyEnv 取顶层 */
    llm?: LlmConfig;
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
    /** WO-606: 本地 Skill 加载 */
    skills?: SkillsConfig;
    /** WO-609: MCP 客户端 */
    mcp?: McpConfig;
    /** WO-615: Heartbeat 主动模式 */
    heartbeat?: HeartbeatConfig;
    /** Phase 8: Gateway 监听与认证 */
    gateway?: GatewayConfig;
    /** Phase 10: 会话类型对应的 system 片段（dev/knowledge/pm/swarm_manager/general） */
    roles?: RolesConfig;
    /** Phase 10: 蜂群多层级配置（teams、defaultTeamId） */
    swarm?: SwarmConfig;
    /** Phase 11: 知识库摄取与咨询 */
    knowledge?: KnowledgeConfig;
    /** Phase 12: 自我诊断报告与改进建议 */
    diagnostic?: DiagnosticConfig;
    /** Phase 13 WO-BT-001: 行为树/状态机流程；enabled 未配置时默认关闭 */
    flows?: FlowsConfig;
    /** RAG-1: 向量嵌入与检索（内源/外源 RAG、动机 RAG） */
    vectorEmbedding?: VectorEmbeddingConfig;
    /** WO-LM-001: 本地模型（意图分类等）；默认不配置，不调用 */
    localModel?: LocalModelConfig;
    /** RAG-4: 复盘机制；cron 为定时触发（如 "0 0 * * *" 每日零点） */
    retrospective?: {
        enabled?: boolean;
        cron?: string;
    };
    /** IDE/PC 操作：L2 UI 自动化、L3 键鼠/视觉、超时、确认策略（WO-IDE-001） */
    ideOperation?: IdeOperationConfig;
    /** WO-SEC: 安全与隐私（危险命令、process 保护、权限域） */
    security?: SecurityConfig;
};
export declare function loadConfig(overridePath?: string): RzeclawConfig;
export declare function getRoleFragment(config: RzeclawConfig, sessionType: string | undefined): string | undefined;
/** Phase 8: 读取 Gateway 认证用 API Key（环境变量） */
export declare function getGatewayApiKey(config: RzeclawConfig): string | undefined;
/** 解析后的 LLM 配置（供 LLM 客户端使用）；未配置 llm 时等价于 anthropic + 顶层 model/apiKeyEnv */
export declare function getResolvedLlm(config: RzeclawConfig): {
    provider: LlmProvider;
    model: string;
    apiKeyEnv?: string;
    baseURL?: string;
    fallbackProvider?: "anthropic" | "deepseek" | "minimax";
};
export declare function getApiKey(config: RzeclawConfig): string | undefined;
/** 当前配置下是否可调用主 LLM（runAgentLoop 可用：Ollama 或云端已配置 API Key） */
export declare function isLlmReady(config: RzeclawConfig): boolean;
/** WO-LM-003: 本地模型意图分类是否可用（enabled + endpoint + model + modes.intentClassifier.enabled） */
export declare function isLocalIntentClassifierAvailable(config: RzeclawConfig): boolean;
