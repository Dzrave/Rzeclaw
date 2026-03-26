import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir, platform } from "node:os";

/** Phase 17: 5 天滑动情景记忆（记忆折叠）配置 */
export type RollingLedgerConfig = {
  /** 是否启用滚动账本注入与折叠 */
  enabled?: boolean;
  /** 账本保留天数，默认 5 */
  windowDays?: number;
  /** 可选时区，如 "Asia/Shanghai"；未配置则用本地日期 */
  timezone?: string;
  /** 可选：折叠任务 cron，如 "0 0 * * *" 每日零点；未配置则不自动执行（仅 RPC memory.fold 触发） */
  foldCron?: string;
  /** WO-1741: 是否将折叠产出的「昨日未完成任务」写入早报；默认 false，用户显式开启 */
  includePendingInReport?: boolean;
};

export type MemoryConfig = {
  enabled?: boolean;
  /** Storage path; default derived from workspace/.rezbot/memory */
  storagePath?: string;
  /** Isolation: default from workspace path */
  workspaceId?: string;
  /** WO-407: L1 条目创建时间早于多少天移入冷存储 (0=关闭) */
  coldAfterDays?: number;
  /** Phase 17: 5 天滑动情景记忆（记忆折叠） */
  rollingLedger?: RollingLedgerConfig;
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
  /** 进化产物存放目录，相对 workspace，默认 .rezbot/evolved_skills */
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

/** Phase 16 WO-1601: 探索层（Exploration Layer）配置 */
export type ExplorationTriggerConfig = {
  /** 开放性意图标签，命中则可能进入探索层 */
  openIntents?: string[];
  /** 消息长度 ≥ 此值视为复杂，可触发探索；不配置时沿用 planning.complexThresholdChars 或 80 */
  complexThresholdChars?: number;
  /** 可选：不确定性得分 ≥ 此值触发探索 */
  uncertaintyThreshold?: number;
  /** 某类任务近期失败率 ≥ 此值强制进入探索层 (0～1) */
  failureRateThreshold?: number;
};

export type ExplorationPlannerConfig = {
  /** 预案数量 3～5，默认 5 */
  maxVariants?: number;
  /** 仅只读 RAG，不调用写文件类工具，默认 true */
  readOnlyRAGOnly?: boolean;
};

export type ExplorationCriticConfig = {
  weights?: {
    success?: number;
    cost?: number;
    risk?: number;
  };
};

export type ExplorationSnapshotConfig = {
  /** 先验扫描时取前 K 个相关技能，默认 10 */
  maxRelevantSkills?: number;
};

export type ExplorationExperienceConfig = {
  enabled?: boolean;
  collection?: string;
  reuseThreshold?: number;
  requireSnapshotMatch?: boolean;
  storeOutcome?: boolean;
  maxEntries?: number;
};

export type ExplorationConfig = {
  enabled?: boolean;
  /** WO-1635: 探索层总超时毫秒，超时后降级为不探索 */
  timeoutMs?: number;
  trigger?: ExplorationTriggerConfig;
  planner?: ExplorationPlannerConfig;
  critic?: ExplorationCriticConfig;
  snapshot?: ExplorationSnapshotConfig;
  experience?: ExplorationExperienceConfig;
};

/** WO-606/608: 本地 Skill 目录，白名单加载 */
export type SkillsConfig = {
  enabled?: boolean;
  /** 相对 workspace 的目录，默认 .rezbot/skills */
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
  /** 环境变量名，用于读取 API Key；默认 REZBOT_GATEWAY_API_KEY */
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
  /** 报告输出目录，相对 workspace，默认 .rezbot/diagnostics */
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
  /** 索引存储路径，相对 workspace，如 .rezbot/embeddings */
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
  /** 相对 workspace 的目录，存放 flow JSON，如 .rezbot/flows */
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

/** WO-1503: 事后检查与纠正 */
export type PostActionReviewConfig = {
  enableRiskClassification?: boolean;
  highRiskSuggestReviewOnSessionEnd?: boolean;
};

export type SecurityConfig = {
  dangerousCommands?: DangerousCommandsConfig;
  processKillRequireConfirm?: boolean;
  protectedPids?: number[];
  permissionScopes?: Partial<Record<string, PermissionScopePolicy>>;
  scheduledGrants?: Array<{ scope: string; window: string }>;
  /** WO-1503: 风险分类与会话结束高风险建议 */
  postActionReview?: PostActionReviewConfig;
  /** WO-1510: 隐私会话下工具策略；allow_all=不限制，read_only=仅读类，none=禁止工具 */
  privacySessionToolPolicy?: "allow_all" | "read_only" | "none";
  /** WO-1512: 隐私会话下 ops.log；omit=不写，redact=脱敏后写 */
  opsLogPrivacySessionPolicy?: "omit" | "redact";
  /** WO-1511: 隐私隔离存储保留天数；0=会话结束即删除，>0=N 天后由清理任务删除；未配置则不写入隔离存储（隐私会话不写 L1） */
  privacyIsolationRetentionDays?: number;
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

export type RezBotConfig = {
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
  retrospective?: { enabled?: boolean; cron?: string };
  /** IDE/PC 操作：L2 UI 自动化、L3 键鼠/视觉、超时、确认策略（WO-IDE-001） */
  ideOperation?: IdeOperationConfig;
  /** WO-SEC: 安全与隐私（危险命令、process 保护、权限域） */
  security?: SecurityConfig;
  /** Phase 14A: Event Bus 为中枢；enabled 时 Gateway 仅发布/订阅，执行层独立消费 */
  eventBus?: EventBusConfig;
  /** Phase 14B: 多 Agent 实体（蓝图、意图→Agent 映射、默认 Agent） */
  agents?: AgentsConfig;
  /** WO-1525: 热重载；intervalSeconds>0 时轮询 mtime，allowExplicitReload 控制 config.reload */
  hotReload?: HotReloadConfig;
  /** WO-1548: 任务解耦；mode=in_process 与 Gateway 同进程，worker=独立 Worker（预留） */
  taskExecution?: { mode?: "in_process" | "worker" };
  /** WO-1548: 任务结果保留时长（分钟），过期可清理 */
  taskResults?: { retentionMinutes?: number };
  /** Phase 16: 探索层与预案 Planner（Gatekeeper、先验扫描、Planner/Critic、探索经验） */
  exploration?: ExplorationConfig;
};

/** WO-1525: 热重载配置 */
export type HotReloadConfig = {
  /** 定时检查配置文件变更的间隔（秒），0 表示不轮询，不少于 10 */
  intervalSeconds?: number;
  /** 是否允许通过 Gateway 方法 config.reload 触发，默认 true */
  allowExplicitReload?: boolean;
};

/** Phase 14A: Event Bus 配置（进程内逻辑总线） */
export type EventBusConfig = {
  /** 是否启用：true 时 chat 经总线发布/订阅，执行层订阅 request、发布 response */
  enabled?: boolean;
  /** 等待 chat.response 超时毫秒，默认 300000 */
  responseTimeoutMs?: number;
};

/** Phase 14B: Agent 蓝图 — 局部记忆配置 */
export type AgentLocalMemoryConfig = {
  enabled: boolean;
  /** 相对 workspace 或独立路径；未配置时使用约定路径 .rezbot/memory/agent_<id>.jsonl */
  storagePath?: string;
  /** 检索条数上限，默认 5 */
  retrieveLimit?: number;
  /** 为 true 时检索合并「局部 + 全局只读」；默认 false 仅局部 */
  includeGlobalRead?: boolean;
};

/** Phase 14B: Agent 蓝图（静态定义，运行时实例化） */
export type AgentBlueprint = {
  /** 唯一标识，如 code_reviewer、general */
  id: string;
  /** 显示名，用于日志与 UI */
  name?: string;
  /** 角色 system 片段（覆盖或补充 config.roles 按 sessionType 的片段） */
  systemPrompt?: string;
  /** 该 Agent 可用的 flowId 白名单；空则使用全局库且可匹配任意 route */
  boundFlowIds?: string[];
  /** 局部记忆 */
  localMemory?: AgentLocalMemoryConfig;
  /** 该 Agent 使用的 LLM（覆盖全局）；不配置则用全局 */
  llm?: LlmConfig;
  /** 该 Agent 绑定的工具子集（名称列表）；不配置则用全局合并工具 */
  toolsFilter?: string[];
};

/** Phase 14B: 意图→Agent 映射（hint 匹配时选用该 Agent，再在其 boundFlowIds 内匹配 flow） */
export type AgentRouteEntry = {
  hint: string;
  agentId: string;
};

/** Phase 14B: 多 Agent 配置 */
export type AgentsConfig = {
  blueprints?: AgentBlueprint[];
  /** Router 未产出 agentId 时使用的默认蓝图 id；不配置则隐式「全局 runAgentLoop」 */
  defaultAgentId?: string;
  /** 意图到 agent 的映射；匹配后在该 Agent 的 boundFlowIds 内做 flow 匹配 */
  routes?: AgentRouteEntry[];
};


const DEFAULT_WORKSPACE = join(homedir(), ".rezbot", "workspace");
const DEFAULT_PORT = 18789;

/** WO-1526: 查找配置文件路径，供热重载 mtime 轮询使用 */
export function findConfigPath(): string | null {
  const cwd = process.cwd();
  const home = homedir();
  const dir = platform() === "win32" ? process.env.USERPROFILE || home : home;
  const candidates = [
    join(cwd, "rezbot.json"),
    join(cwd, ".rezbot.json"),
    join(dir, ".rezbot", "config.json"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

function loadJson(path: string): Record<string, unknown> {
  const raw = readFileSync(path, "utf-8");
  return JSON.parse(raw) as Record<string, unknown>;
}

export function loadConfig(overridePath?: string): RezBotConfig {
  const path = overridePath ?? findConfigPath();
  const base: RezBotConfig = {
    model: "anthropic/claude-sonnet-4-20250514",
    workspace: DEFAULT_WORKSPACE,
    port: DEFAULT_PORT,
    contextWindowRounds: 5,
  };

  if (path && existsSync(path)) {
    const data = loadJson(path);
    if (typeof data.model === "string") base.model = data.model;
    if (typeof data.workspace === "string") base.workspace = data.workspace;
    if (typeof data.port === "number") base.port = data.port;
    if (typeof data.apiKeyEnv === "string") base.apiKeyEnv = data.apiKeyEnv;
    if (data.memory != null && typeof data.memory === "object") {
      const m = data.memory as Record<string, unknown>;
      const rl = m.rollingLedger != null && typeof m.rollingLedger === "object" ? (m.rollingLedger as Record<string, unknown>) : undefined;
      base.memory = {
        enabled: m.enabled === true,
        storagePath: typeof m.storagePath === "string" ? m.storagePath : undefined,
        workspaceId: typeof m.workspaceId === "string" ? m.workspaceId : undefined,
        coldAfterDays:
          typeof m.coldAfterDays === "number" && m.coldAfterDays >= 0 ? m.coldAfterDays : undefined,
        rollingLedger:
          rl != null
            ? {
                enabled: rl.enabled === true,
                windowDays:
                  typeof rl.windowDays === "number" && rl.windowDays >= 1 && rl.windowDays <= 30
                    ? rl.windowDays
                    : undefined,
                timezone: typeof rl.timezone === "string" ? rl.timezone : undefined,
                foldCron: typeof rl.foldCron === "string" ? rl.foldCron : undefined,
                includePendingInReport: rl.includePendingInReport === true,
              }
            : undefined,
      };
    }
    if (typeof data.contextWindowRounds === "number" && data.contextWindowRounds > 0) {
      base.contextWindowRounds = data.contextWindowRounds;
    }
    if (typeof data.reflectionToolCallInterval === "number" && data.reflectionToolCallInterval > 0) {
      base.reflectionToolCallInterval = data.reflectionToolCallInterval;
    }
    if (typeof data.summaryEveryRounds === "number" && data.summaryEveryRounds > 0) {
      base.summaryEveryRounds = data.summaryEveryRounds;
    }
    if (data.evolution != null && typeof data.evolution === "object") {
      const ev = data.evolution as Record<string, unknown>;
      const it = ev.insertTree;
      base.evolution = {
        bootstrapDocPath: typeof ev.bootstrapDocPath === "string" ? ev.bootstrapDocPath : undefined,
        insertTree:
          it != null && typeof it === "object"
            ? (() => {
                const t = it as Record<string, unknown>;
                return {
                  enabled: t.enabled === true,
                  autoRun: t.autoRun === true,
                  requireUserConfirmation: t.requireUserConfirmation === true,
                  allowHighRiskOp: t.allowHighRiskOp === true,
                  targetFlowId: typeof t.targetFlowId === "string" ? t.targetFlowId : undefined,
                  targetSelectorNodeId: typeof t.targetSelectorNodeId === "string" ? t.targetSelectorNodeId : undefined,
                  evolvedSkillsDir: typeof t.evolvedSkillsDir === "string" ? t.evolvedSkillsDir : undefined,
                  sandboxTimeoutMs:
                    typeof t.sandboxTimeoutMs === "number" && t.sandboxTimeoutMs > 0
                      ? t.sandboxTimeoutMs
                      : undefined,
                  maxRetries:
                    typeof t.maxRetries === "number" && t.maxRetries >= 0 ? t.maxRetries : undefined,
                };
              })()
            : undefined,
      };
    }
    if (data.planning != null && typeof data.planning === "object") {
      const p = data.planning as Record<string, unknown>;
      base.planning = {
        enabled: p.enabled === true,
        maxSteps: typeof p.maxSteps === "number" && p.maxSteps > 0 ? p.maxSteps : undefined,
        complexThresholdChars:
          typeof p.complexThresholdChars === "number" && p.complexThresholdChars >= 0
            ? p.complexThresholdChars
            : undefined,
      };
    }
    if (data.skills != null && typeof data.skills === "object") {
      const s = data.skills as Record<string, unknown>;
      base.skills = {
        enabled: s.enabled === true,
        dir: typeof s.dir === "string" ? s.dir : undefined,
      };
    }
    if (data.mcp != null && typeof data.mcp === "object") {
      const m = data.mcp as Record<string, unknown>;
      base.mcp = {
        enabled: m.enabled === true,
        servers: Array.isArray(m.servers)
          ? (m.servers as McpServerEntry[]).filter(
              (e) => e && typeof e.name === "string" && typeof e.command === "string"
            )
          : undefined,
      };
    }
    if (data.heartbeat != null && typeof data.heartbeat === "object") {
      const h = data.heartbeat as Record<string, unknown>;
      base.heartbeat = {
        intervalMinutes:
          typeof h.intervalMinutes === "number" && h.intervalMinutes >= 0
            ? h.intervalMinutes
            : undefined,
        checklistPath: typeof h.checklistPath === "string" ? h.checklistPath : undefined,
        checkUseLLM: (h as { checkUseLLM?: boolean }).checkUseLLM === true,
        requireConfirmation: (h as { requireConfirmation?: boolean }).requireConfirmation === true,
      };
    }
    if (data.gateway != null && typeof data.gateway === "object") {
      const g = data.gateway as Record<string, unknown>;
      base.gateway = {
        host: typeof g.host === "string" ? g.host : undefined,
        auth:
          g.auth != null && typeof g.auth === "object"
            ? {
                enabled: (g.auth as Record<string, unknown>).enabled === true,
                apiKeyEnv:
                  typeof (g.auth as Record<string, unknown>).apiKeyEnv === "string"
                    ? (g.auth as Record<string, unknown>).apiKeyEnv as string
                    : undefined,
              }
            : undefined,
        discovery:
          g.discovery != null && typeof g.discovery === "object"
            ? { enabled: (g.discovery as Record<string, unknown>).enabled === true }
            : undefined,
      };
    }
    if (data.roles != null && typeof data.roles === "object") {
      const r = data.roles as Record<string, unknown>;
      base.roles = {
        dev: typeof r.dev === "string" ? r.dev : undefined,
        knowledge: typeof r.knowledge === "string" ? r.knowledge : undefined,
        pm: typeof r.pm === "string" ? r.pm : undefined,
        swarm_manager: typeof r.swarm_manager === "string" ? r.swarm_manager : undefined,
        general: typeof r.general === "string" ? r.general : undefined,
      };
    }
    if (data.swarm != null && typeof data.swarm === "object") {
      const s = data.swarm as Record<string, unknown>;
      const teams = Array.isArray(s.teams)
        ? (s.teams as unknown[]).filter(
            (e): e is SwarmTeamEntry =>
              e != null &&
              typeof (e as SwarmTeamEntry).id === "string" &&
              typeof (e as SwarmTeamEntry).name === "string"
          )
        : undefined;
      base.swarm = {
        teams: teams?.map((e) => ({
          id: e.id,
          name: e.name,
          workspaces: Array.isArray(e.workspaces) ? e.workspaces.filter((w): w is string => typeof w === "string") : undefined,
        })),
        defaultTeamId: typeof s.defaultTeamId === "string" ? s.defaultTeamId : undefined,
      };
    }
    if (data.knowledge != null && typeof data.knowledge === "object") {
      const k = data.knowledge as Record<string, unknown>;
      base.knowledge = {
        ingestPaths: Array.isArray(k.ingestPaths)
          ? (k.ingestPaths as unknown[]).filter((p): p is string => typeof p === "string")
          : undefined,
        ingestOnStart: k.ingestOnStart === true,
        retrieveLimit:
          typeof k.retrieveLimit === "number" && k.retrieveLimit > 0 ? k.retrieveLimit : undefined,
      };
    }
    if (data.diagnostic != null && typeof data.diagnostic === "object") {
      const d = data.diagnostic as Record<string, unknown>;
      base.diagnostic = {
        intervalDays:
          typeof d.intervalDays === "number" && d.intervalDays > 0 ? d.intervalDays : undefined,
        outputPath: typeof d.outputPath === "string" ? d.outputPath : undefined,
        intervalDaysSchedule:
          typeof d.intervalDaysSchedule === "number" && d.intervalDaysSchedule > 0
            ? d.intervalDaysSchedule
            : undefined,
      };
    }
    if (data.flows != null && typeof data.flows === "object") {
      const f = data.flows as Record<string, unknown>;
      const fr = f.failureReplacement;
      const gf = f.generateFlow;
      base.flows = {
        enabled: f.enabled === true,
        libraryPath: typeof f.libraryPath === "string" ? f.libraryPath : undefined,
        routes: Array.isArray(f.routes)
          ? (f.routes as unknown[]).filter(
              (e): e is FlowsRouteEntry =>
                e != null &&
                typeof (e as FlowsRouteEntry).hint === "string" &&
                typeof (e as FlowsRouteEntry).flowId === "string"
            )
          : undefined,
        failureReplacement:
          fr != null && typeof fr === "object"
            ? (() => {
                const r = fr as Record<string, unknown>;
                const thr = r.failureRateThreshold;
                const minS = r.minSamples;
                const consec = r.consecutiveFailuresThreshold;
                return {
                  enabled: r.enabled === true,
                  failureRateThreshold:
                    typeof thr === "number" && thr >= 0 && thr <= 1 ? thr : undefined,
                  minSamples: typeof minS === "number" && minS >= 0 ? minS : undefined,
                  consecutiveFailuresThreshold:
                    typeof consec === "number" && consec >= 1 ? consec : undefined,
                  markOnly: r.markOnly === true,
                  async: r.async !== false,
                };
              })()
            : undefined,
        generateFlow:
          gf != null && typeof gf === "object"
            ? {
                enabled: (gf as Record<string, unknown>).enabled === true,
                triggerOnNoMatch: (gf as Record<string, unknown>).triggerOnNoMatch === true,
                triggerPattern:
                  typeof (gf as Record<string, unknown>).triggerPattern === "string"
                    ? ((gf as Record<string, unknown>).triggerPattern as string)
                    : undefined,
              }
            : undefined,
      };
    }
    if (data.vectorEmbedding != null && typeof data.vectorEmbedding === "object") {
      const ve = data.vectorEmbedding as Record<string, unknown>;
      const coll = ve.collections;
      const collections: Record<string, VectorEmbeddingCollectionConfig> = {};
      if (coll != null && typeof coll === "object") {
        for (const [name, c] of Object.entries(coll)) {
          if (c != null && typeof c === "object") {
            const cc = c as Record<string, unknown>;
            collections[name] = {
              enabled: cc.enabled === true,
              pathOverride:
                typeof cc.pathOverride === "string" ? cc.pathOverride : undefined,
            };
          }
        }
      }
      base.vectorEmbedding = {
        enabled: ve.enabled === true,
        provider:
          ve.provider === "ollama" || ve.provider === "openai-compatible"
            ? ve.provider
            : undefined,
        endpoint: typeof ve.endpoint === "string" ? ve.endpoint : undefined,
        model: typeof ve.model === "string" ? ve.model : undefined,
        indexStoragePath:
          typeof ve.indexStoragePath === "string" ? ve.indexStoragePath : undefined,
        collections: Object.keys(collections).length > 0 ? collections : undefined,
        motivationThreshold:
          typeof ve.motivationThreshold === "number" &&
          ve.motivationThreshold >= 0 &&
          ve.motivationThreshold <= 1
            ? ve.motivationThreshold
            : undefined,
      };
    }
    if (data.localModel != null && typeof data.localModel === "object") {
      const lm = data.localModel as Record<string, unknown>;
      const modes = lm.modes;
      const ic =
        modes != null && typeof modes === "object" && (modes as Record<string, unknown>).intentClassifier != null
          ? ((modes as Record<string, unknown>).intentClassifier as Record<string, unknown>)
          : undefined;
      base.localModel = {
        enabled: lm.enabled === true,
        provider:
          lm.provider === "ollama" || lm.provider === "openai-compatible" ? lm.provider : undefined,
        endpoint: typeof lm.endpoint === "string" ? lm.endpoint : undefined,
        model: typeof lm.model === "string" ? lm.model : undefined,
        timeoutMs:
          typeof lm.timeoutMs === "number" && lm.timeoutMs > 0 ? lm.timeoutMs : undefined,
        modes:
          ic != null && typeof ic === "object"
            ? {
                intentClassifier: {
                  enabled: ic.enabled === true,
                  confidenceThreshold:
                    typeof ic.confidenceThreshold === "number" &&
                    ic.confidenceThreshold >= 0 &&
                    ic.confidenceThreshold <= 1
                      ? ic.confidenceThreshold
                      : undefined,
                },
              }
            : undefined,
      };
    }
    if (data.retrospective != null && typeof data.retrospective === "object") {
      const rr = data.retrospective as Record<string, unknown>;
      base.retrospective = {
        enabled: rr.enabled === true,
        cron: typeof rr.cron === "string" ? rr.cron : undefined,
      };
    }
    if (data.ideOperation != null && typeof data.ideOperation === "object") {
      const io = data.ideOperation as Record<string, unknown>;
      base.ideOperation = {
        uiAutomation: io.uiAutomation === true,
        keyMouse: io.keyMouse === true,
        visualClick: io.visualClick === true,
        allowedApps: Array.isArray(io.allowedApps)
          ? (io.allowedApps as unknown[]).filter((a): a is string => typeof a === "string")
          : undefined,
        timeoutMs:
          typeof io.timeoutMs === "number" && io.timeoutMs > 0 ? io.timeoutMs : undefined,
        confirmPolicy:
          io.confirmPolicy != null && typeof io.confirmPolicy === "object"
            ? {
                tools: Array.isArray((io.confirmPolicy as Record<string, unknown>).tools)
                  ? ((io.confirmPolicy as Record<string, unknown>).tools as unknown[]).filter(
                      (t): t is string => typeof t === "string"
                    )
                  : undefined,
                requireConfirm:
                  (io.confirmPolicy as Record<string, unknown>).requireConfirm === true,
              }
            : undefined,
      };
    }
    if (data.security != null && typeof data.security === "object") {
      const sec = data.security as Record<string, unknown>;
      base.security = {};
      if (sec.dangerousCommands != null && typeof sec.dangerousCommands === "object") {
        const dc = sec.dangerousCommands as Record<string, unknown>;
        base.security.dangerousCommands = {
          mode:
            dc.mode === "block" || dc.mode === "confirm" || dc.mode === "dryRunOnly"
              ? dc.mode
              : undefined,
          patterns: Array.isArray(dc.patterns)
            ? (dc.patterns as unknown[]).filter((p): p is string => typeof p === "string")
            : undefined,
        };
      }
      if (typeof sec.processKillRequireConfirm === "boolean") {
        base.security.processKillRequireConfirm = sec.processKillRequireConfirm;
      }
      if (Array.isArray(sec.protectedPids)) {
        base.security.protectedPids = (sec.protectedPids as unknown[]).filter(
          (p): p is number => typeof p === "number" && Number.isInteger(p)
        );
      }
      if (sec.permissionScopes != null && typeof sec.permissionScopes === "object") {
        const ps = sec.permissionScopes as Record<string, unknown>;
        base.security.permissionScopes = {};
        for (const [k, v] of Object.entries(ps)) {
          if (v === "allow" || v === "confirm" || v === "deny") {
            base.security.permissionScopes![k] = v;
          }
        }
      }
      if (Array.isArray(sec.scheduledGrants)) {
        base.security.scheduledGrants = (sec.scheduledGrants as unknown[]).filter(
          (s): s is { scope: string; window: string } =>
            s != null &&
            typeof (s as Record<string, unknown>).scope === "string" &&
            typeof (s as Record<string, unknown>).window === "string"
        );
      }
      if (sec.postActionReview != null && typeof sec.postActionReview === "object") {
        const par = sec.postActionReview as Record<string, unknown>;
        base.security.postActionReview = {
          enableRiskClassification: par.enableRiskClassification === true,
          highRiskSuggestReviewOnSessionEnd: par.highRiskSuggestReviewOnSessionEnd === true,
        };
      }
      if (sec.privacySessionToolPolicy === "read_only" || sec.privacySessionToolPolicy === "none") {
        base.security.privacySessionToolPolicy = sec.privacySessionToolPolicy;
      }
      if (sec.opsLogPrivacySessionPolicy === "omit" || sec.opsLogPrivacySessionPolicy === "redact") {
        base.security.opsLogPrivacySessionPolicy = sec.opsLogPrivacySessionPolicy;
      }
      if (typeof sec.privacyIsolationRetentionDays === "number" && sec.privacyIsolationRetentionDays >= 0) {
        base.security.privacyIsolationRetentionDays = sec.privacyIsolationRetentionDays;
      }
    }
    if (data.eventBus != null && typeof data.eventBus === "object") {
      const eb = data.eventBus as Record<string, unknown>;
      base.eventBus = {
        enabled: eb.enabled === true,
        responseTimeoutMs:
          typeof eb.responseTimeoutMs === "number" && eb.responseTimeoutMs > 0
            ? eb.responseTimeoutMs
            : undefined,
      };
    }
    if (data.agents != null && typeof data.agents === "object") {
      const ag = data.agents as Record<string, unknown>;
      const blueprintsRaw = Array.isArray(ag.blueprints) ? ag.blueprints : [];
      const blueprints: AgentBlueprint[] = [];
      for (const b of blueprintsRaw) {
        if (b != null && typeof b === "object" && typeof (b as Record<string, unknown>).id === "string") {
          const x = b as Record<string, unknown>;
          const lm = x.localMemory;
          blueprints.push({
            id: x.id as string,
            name: typeof x.name === "string" ? x.name : undefined,
            systemPrompt: typeof x.systemPrompt === "string" ? x.systemPrompt : undefined,
            boundFlowIds: Array.isArray(x.boundFlowIds) ? (x.boundFlowIds as string[]).filter((id) => typeof id === "string") : undefined,
            localMemory:
              lm != null && typeof lm === "object" && (lm as Record<string, unknown>).enabled === true
                ? {
                    enabled: true,
                    storagePath: typeof (lm as Record<string, unknown>).storagePath === "string" ? (lm as Record<string, unknown>).storagePath as string : undefined,
                    retrieveLimit: typeof (lm as Record<string, unknown>).retrieveLimit === "number" ? (lm as Record<string, unknown>).retrieveLimit as number : undefined,
                    includeGlobalRead: (lm as Record<string, unknown>).includeGlobalRead === true,
                  }
                : undefined,
            llm: undefined,
            toolsFilter: Array.isArray(x.toolsFilter) ? (x.toolsFilter as unknown[]).filter((t) => typeof t === "string") as string[] : undefined,
          });
        }
      }
      const routesRaw = Array.isArray(ag.routes) ? ag.routes : [];
      const routes: AgentRouteEntry[] = routesRaw.filter(
        (r): r is AgentRouteEntry =>
          r != null &&
          typeof r === "object" &&
          typeof (r as Record<string, unknown>).hint === "string" &&
          typeof (r as Record<string, unknown>).agentId === "string"
      ) as AgentRouteEntry[];
      base.agents = {
        blueprints: blueprints.length > 0 ? blueprints : undefined,
        defaultAgentId: typeof ag.defaultAgentId === "string" ? ag.defaultAgentId : undefined,
        routes: routes.length > 0 ? routes : undefined,
      };
    }
    if (data.llm != null && typeof data.llm === "object") {
      const l = data.llm as Record<string, unknown>;
      const prov = l.provider as string | undefined;
      if (
        prov === "anthropic" ||
        prov === "deepseek" ||
        prov === "minimax" ||
        prov === "ollama"
      ) {
        base.llm = {
          provider: prov as LlmProvider,
          model: typeof l.model === "string" ? l.model : base.model.replace(/^[^/]+\//, "") || "claude-sonnet-4-20250514",
          apiKeyEnv: typeof l.apiKeyEnv === "string" ? l.apiKeyEnv : undefined,
          baseURL: typeof l.baseURL === "string" ? l.baseURL : undefined,
          fallbackProvider:
            l.fallbackProvider === "anthropic" ||
            l.fallbackProvider === "deepseek" ||
            l.fallbackProvider === "minimax"
              ? l.fallbackProvider
              : undefined,
        };
      }
    }
    if (data.hotReload != null && typeof data.hotReload === "object") {
      const hr = data.hotReload as Record<string, unknown>;
      base.hotReload = {
        intervalSeconds:
          typeof hr.intervalSeconds === "number" && hr.intervalSeconds >= 0 ? hr.intervalSeconds : undefined,
        allowExplicitReload: hr.allowExplicitReload === false ? false : true,
      };
    }
    if (data.taskExecution != null && typeof data.taskExecution === "object") {
      const te = data.taskExecution as Record<string, unknown>;
      base.taskExecution = {
        mode: te.mode === "worker" ? "worker" : "in_process",
      };
    }
    if (data.taskResults != null && typeof data.taskResults === "object") {
      const tr = data.taskResults as Record<string, unknown>;
      base.taskResults = {
        retentionMinutes:
          typeof tr.retentionMinutes === "number" && tr.retentionMinutes > 0 ? tr.retentionMinutes : undefined,
      };
    }
    if (data.exploration != null && typeof data.exploration === "object") {
      const ex = data.exploration as Record<string, unknown>;
      const trigger = ex.trigger != null && typeof ex.trigger === "object" ? (ex.trigger as Record<string, unknown>) : undefined;
      const planner = ex.planner != null && typeof ex.planner === "object" ? (ex.planner as Record<string, unknown>) : undefined;
      const critic = ex.critic != null && typeof ex.critic === "object" ? (ex.critic as Record<string, unknown>) : undefined;
      const weights = critic?.weights != null && typeof critic.weights === "object" ? (critic.weights as Record<string, unknown>) : undefined;
      const snapshot = ex.snapshot != null && typeof ex.snapshot === "object" ? (ex.snapshot as Record<string, unknown>) : undefined;
      const experience = ex.experience != null && typeof ex.experience === "object" ? (ex.experience as Record<string, unknown>) : undefined;
      base.exploration = {
        enabled: ex.enabled === true,
        timeoutMs:
          typeof ex.timeoutMs === "number" && ex.timeoutMs > 0 ? ex.timeoutMs : undefined,
        trigger: trigger
          ? {
              openIntents: Array.isArray(trigger.openIntents)
                ? (trigger.openIntents as unknown[]).filter((x): x is string => typeof x === "string")
                : undefined,
              complexThresholdChars:
                typeof trigger.complexThresholdChars === "number" && trigger.complexThresholdChars >= 0
                  ? trigger.complexThresholdChars
                  : undefined,
              uncertaintyThreshold:
                typeof trigger.uncertaintyThreshold === "number" && trigger.uncertaintyThreshold >= 0 && trigger.uncertaintyThreshold <= 1
                  ? trigger.uncertaintyThreshold
                  : undefined,
              failureRateThreshold:
                typeof trigger.failureRateThreshold === "number" && trigger.failureRateThreshold >= 0 && trigger.failureRateThreshold <= 1
                  ? trigger.failureRateThreshold
                  : undefined,
            }
          : undefined,
        planner: planner
          ? {
              maxVariants:
                typeof planner.maxVariants === "number" && planner.maxVariants >= 1 && planner.maxVariants <= 10
                  ? planner.maxVariants
                  : undefined,
              readOnlyRAGOnly: planner.readOnlyRAGOnly !== false,
            }
          : undefined,
        critic: critic
          ? {
              weights: weights
                ? {
                    success: typeof weights.success === "number" ? weights.success : undefined,
                    cost: typeof weights.cost === "number" ? weights.cost : undefined,
                    risk: typeof weights.risk === "number" ? weights.risk : undefined,
                  }
                : undefined,
            }
          : undefined,
        snapshot: snapshot
          ? {
              maxRelevantSkills:
                typeof snapshot.maxRelevantSkills === "number" && snapshot.maxRelevantSkills > 0
                  ? snapshot.maxRelevantSkills
                  : undefined,
            }
          : undefined,
        experience: experience
          ? {
              enabled: experience.enabled === true,
              collection: typeof experience.collection === "string" ? experience.collection : undefined,
              reuseThreshold:
                typeof experience.reuseThreshold === "number" && experience.reuseThreshold >= 0 && experience.reuseThreshold <= 1
                  ? experience.reuseThreshold
                  : undefined,
              requireSnapshotMatch: experience.requireSnapshotMatch === true,
              storeOutcome: experience.storeOutcome === true,
              maxEntries:
                typeof experience.maxEntries === "number" && experience.maxEntries > 0 ? experience.maxEntries : undefined,
            }
          : undefined,
      };
    }
  }

  return base;
}

/** WO-1520: 可热重载的顶层配置键（不含 port、workspace、gateway.host 需保留） */
export const RELOADABLE_CONFIG_KEYS: (keyof RezBotConfig)[] = [
  "model",
  "apiKeyEnv",
  "llm",
  "memory",
  "contextWindowRounds",
  "reflectionToolCallInterval",
  "summaryEveryRounds",
  "evolution",
  "planning",
  "skills",
  "mcp",
  "heartbeat",
  "gateway",
  "roles",
  "swarm",
  "knowledge",
  "diagnostic",
  "flows",
  "vectorEmbedding",
  "localModel",
  "retrospective",
  "ideOperation",
  "security",
  "eventBus",
  "agents",
  "hotReload",
  "taskExecution",
  "taskResults",
  "exploration",
];

/** WO-1521: 重载配置 — 仅将可重载部分浅替换到 currentConfig，保留 port、workspace、gateway.host。单次请求内 config 不变（WO-1522）。 */
export function reloadConfig(currentConfig: RezBotConfig): { ok: true } | { ok: false; message: string } {
  const path = findConfigPath();
  if (!path || !existsSync(path)) {
    return { ok: false, message: "Config file not found" };
  }
  let newConfig: RezBotConfig;
  try {
    newConfig = loadConfig(path);
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
    };
  }
  const preservedHost = currentConfig.gateway?.host;
  for (const key of RELOADABLE_CONFIG_KEYS) {
    if (key === "gateway") {
      (currentConfig as Record<string, unknown>)[key] = (newConfig as Record<string, unknown>)[key];
      if (currentConfig.gateway && preservedHost !== undefined) {
        currentConfig.gateway.host = preservedHost;
      }
    } else {
      (currentConfig as Record<string, unknown>)[key] = (newConfig as Record<string, unknown>)[key];
    }
  }
  return { ok: true };
}

/** Phase 10: 根据 sessionType 返回角色 system 片段；无配置时使用内置默认。 */
const DEFAULT_ROLES: Record<string, string> = {
  dev: "你是本工作区的开发助手。侧重代码编写、修改、调试与运行。优先使用 bash、read、write、edit 等工具。",
  knowledge: "你是知识库顾问。仅依据记忆与检索作答；不执行写盘、bash 等修改操作，除非用户明确同意。若记忆中无相关信息请明确说明。",
  pm: "你是项目管理助手。侧重目标拆解、任务跟踪、进度汇总与画布更新。可读画布与任务，执行前优先给出提议。",
  swarm_manager: "你是蜂群协调助手。负责汇总多工作区/多角色的任务与进度，给出跨区建议与优先级。优先只读汇总与提议，执行前请确认。",
  general: "",
};

export function getRoleFragment(config: RezBotConfig, sessionType: string | undefined): string | undefined {
  if (!sessionType || sessionType === "general") return undefined;
  const fromConfig = (config.roles as Record<string, string | undefined> | undefined)?.[sessionType];
  const fragment = fromConfig ?? DEFAULT_ROLES[sessionType];
  if (typeof fragment !== "string" || !fragment.trim()) return undefined;
  return fragment.trim();
}

/** Phase 8: 读取 Gateway 认证用 API Key（环境变量） */
export function getGatewayApiKey(config: RezBotConfig): string | undefined {
  const envName = config.gateway?.auth?.apiKeyEnv ?? "REZBOT_GATEWAY_API_KEY";
  return process.env[envName]?.trim() || undefined;
}

/** 解析后的 LLM 配置（供 LLM 客户端使用）；未配置 llm 时等价于 anthropic + 顶层 model/apiKeyEnv */
export function getResolvedLlm(config: RezBotConfig): {
  provider: LlmProvider;
  model: string;
  apiKeyEnv?: string;
  baseURL?: string;
  fallbackProvider?: "anthropic" | "deepseek" | "minimax";
} {
  if (config.llm) {
    return {
      provider: config.llm.provider,
      model: config.llm.model,
      apiKeyEnv: config.llm.apiKeyEnv,
      baseURL: config.llm.baseURL,
      fallbackProvider: config.llm.fallbackProvider,
    };
  }
  const model = config.model.replace(/^anthropic\/?/, "") || "claude-sonnet-4-20250514";
  return {
    provider: "anthropic",
    model,
    apiKeyEnv: config.apiKeyEnv ?? "ANTHROPIC_API_KEY",
  };
}

export function getApiKey(config: RezBotConfig): string | undefined {
  const resolved = getResolvedLlm(config);
  if (resolved.provider === "ollama") return undefined;
  const envName = resolved.apiKeyEnv ?? "ANTHROPIC_API_KEY";
  return process.env[envName]?.trim() || undefined;
}

/** 当前配置下是否可调用主 LLM（runAgentLoop 可用：Ollama 或云端已配置 API Key） */
export function isLlmReady(config: RezBotConfig): boolean {
  const resolved = getResolvedLlm(config);
  if (resolved.provider === "ollama") return true;
  return !!getApiKey(config);
}

/** WO-LM-003: 本地模型意图分类是否可用（enabled + endpoint + model + modes.intentClassifier.enabled） */
export function isLocalIntentClassifierAvailable(config: RezBotConfig): boolean {
  const lm = config.localModel;
  if (!lm?.enabled || !lm.endpoint || !lm.model) return false;
  return lm.modes?.intentClassifier?.enabled === true;
}
