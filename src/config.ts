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
  }

  return base;
}

export function getApiKey(config: RzeclawConfig): string | undefined {
  const envName = config.apiKeyEnv ?? "ANTHROPIC_API_KEY";
  return process.env[envName]?.trim() || undefined;
}
