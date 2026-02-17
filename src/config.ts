import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir, platform } from "node:os";

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
  scheduledGrants?: Array<{ scope: string; window: string }>;
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
  /** IDE/PC 操作：L2 UI 自动化、L3 键鼠/视觉、超时、确认策略（WO-IDE-001） */
  ideOperation?: IdeOperationConfig;
  /** WO-SEC: 安全与隐私（危险命令、process 保护、权限域） */
  security?: SecurityConfig;
};

const DEFAULT_WORKSPACE = join(homedir(), ".rzeclaw", "workspace");
const DEFAULT_PORT = 18789;

function findConfigPath(): string | null {
  const cwd = process.cwd();
  const home = homedir();
  const dir = platform() === "win32" ? process.env.USERPROFILE || home : home;
  const candidates = [
    join(cwd, "rzeclaw.json"),
    join(cwd, ".rzeclaw.json"),
    join(dir, ".rzeclaw", "config.json"),
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

export function loadConfig(overridePath?: string): RzeclawConfig {
  const path = overridePath ?? findConfigPath();
  const base: RzeclawConfig = {
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
      base.memory = {
        enabled: m.enabled === true,
        storagePath: typeof m.storagePath === "string" ? m.storagePath : undefined,
        workspaceId: typeof m.workspaceId === "string" ? m.workspaceId : undefined,
        coldAfterDays:
          typeof m.coldAfterDays === "number" && m.coldAfterDays >= 0 ? m.coldAfterDays : undefined,
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
      base.evolution = {
        bootstrapDocPath: typeof ev.bootstrapDocPath === "string" ? ev.bootstrapDocPath : undefined,
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
  }

  return base;
}

/** Phase 10: 根据 sessionType 返回角色 system 片段；无配置时使用内置默认。 */
const DEFAULT_ROLES: Record<string, string> = {
  dev: "你是本工作区的开发助手。侧重代码编写、修改、调试与运行。优先使用 bash、read、write、edit 等工具。",
  knowledge: "你是知识库顾问。仅依据记忆与检索作答；不执行写盘、bash 等修改操作，除非用户明确同意。若记忆中无相关信息请明确说明。",
  pm: "你是项目管理助手。侧重目标拆解、任务跟踪、进度汇总与画布更新。可读画布与任务，执行前优先给出提议。",
  swarm_manager: "你是蜂群协调助手。负责汇总多工作区/多角色的任务与进度，给出跨区建议与优先级。优先只读汇总与提议，执行前请确认。",
  general: "",
};

export function getRoleFragment(config: RzeclawConfig, sessionType: string | undefined): string | undefined {
  if (!sessionType || sessionType === "general") return undefined;
  const fromConfig = (config.roles as Record<string, string | undefined> | undefined)?.[sessionType];
  const fragment = fromConfig ?? DEFAULT_ROLES[sessionType];
  if (typeof fragment !== "string" || !fragment.trim()) return undefined;
  return fragment.trim();
}

/** Phase 8: 读取 Gateway 认证用 API Key（环境变量） */
export function getGatewayApiKey(config: RzeclawConfig): string | undefined {
  const envName = config.gateway?.auth?.apiKeyEnv ?? "RZECLAW_GATEWAY_API_KEY";
  return process.env[envName]?.trim() || undefined;
}

/** 解析后的 LLM 配置（供 LLM 客户端使用）；未配置 llm 时等价于 anthropic + 顶层 model/apiKeyEnv */
export function getResolvedLlm(config: RzeclawConfig): {
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

export function getApiKey(config: RzeclawConfig): string | undefined {
  const resolved = getResolvedLlm(config);
  if (resolved.provider === "ollama") return undefined;
  const envName = resolved.apiKeyEnv ?? "ANTHROPIC_API_KEY";
  return process.env[envName]?.trim() || undefined;
}

/** 当前配置下是否可调用 LLM（Ollama 无需 Key；云端需已配置对应 API Key） */
export function isLlmReady(config: RzeclawConfig): boolean {
  const resolved = getResolvedLlm(config);
  if (resolved.provider === "ollama") return true;
  return !!getApiKey(config);
}
