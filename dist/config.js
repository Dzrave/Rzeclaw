import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir, platform } from "node:os";
const DEFAULT_WORKSPACE = join(homedir(), ".rzeclaw", "workspace");
const DEFAULT_PORT = 18789;
function findConfigPath() {
    const cwd = process.cwd();
    const home = homedir();
    const dir = platform() === "win32" ? process.env.USERPROFILE || home : home;
    const candidates = [
        join(cwd, "rzeclaw.json"),
        join(cwd, ".rzeclaw.json"),
        join(dir, ".rzeclaw", "config.json"),
    ];
    for (const p of candidates) {
        if (existsSync(p))
            return p;
    }
    return null;
}
function loadJson(path) {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw);
}
export function loadConfig(overridePath) {
    const path = overridePath ?? findConfigPath();
    const base = {
        model: "anthropic/claude-sonnet-4-20250514",
        workspace: DEFAULT_WORKSPACE,
        port: DEFAULT_PORT,
        contextWindowRounds: 5,
    };
    if (path && existsSync(path)) {
        const data = loadJson(path);
        if (typeof data.model === "string")
            base.model = data.model;
        if (typeof data.workspace === "string")
            base.workspace = data.workspace;
        if (typeof data.port === "number")
            base.port = data.port;
        if (typeof data.apiKeyEnv === "string")
            base.apiKeyEnv = data.apiKeyEnv;
        if (data.memory != null && typeof data.memory === "object") {
            const m = data.memory;
            base.memory = {
                enabled: m.enabled === true,
                storagePath: typeof m.storagePath === "string" ? m.storagePath : undefined,
                workspaceId: typeof m.workspaceId === "string" ? m.workspaceId : undefined,
                coldAfterDays: typeof m.coldAfterDays === "number" && m.coldAfterDays >= 0 ? m.coldAfterDays : undefined,
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
            const ev = data.evolution;
            base.evolution = {
                bootstrapDocPath: typeof ev.bootstrapDocPath === "string" ? ev.bootstrapDocPath : undefined,
            };
        }
        if (data.planning != null && typeof data.planning === "object") {
            const p = data.planning;
            base.planning = {
                enabled: p.enabled === true,
                maxSteps: typeof p.maxSteps === "number" && p.maxSteps > 0 ? p.maxSteps : undefined,
                complexThresholdChars: typeof p.complexThresholdChars === "number" && p.complexThresholdChars >= 0
                    ? p.complexThresholdChars
                    : undefined,
            };
        }
        if (data.skills != null && typeof data.skills === "object") {
            const s = data.skills;
            base.skills = {
                enabled: s.enabled === true,
                dir: typeof s.dir === "string" ? s.dir : undefined,
            };
        }
        if (data.mcp != null && typeof data.mcp === "object") {
            const m = data.mcp;
            base.mcp = {
                enabled: m.enabled === true,
                servers: Array.isArray(m.servers)
                    ? m.servers.filter((e) => e && typeof e.name === "string" && typeof e.command === "string")
                    : undefined,
            };
        }
        if (data.heartbeat != null && typeof data.heartbeat === "object") {
            const h = data.heartbeat;
            base.heartbeat = {
                intervalMinutes: typeof h.intervalMinutes === "number" && h.intervalMinutes >= 0
                    ? h.intervalMinutes
                    : undefined,
                checklistPath: typeof h.checklistPath === "string" ? h.checklistPath : undefined,
                checkUseLLM: h.checkUseLLM === true,
                requireConfirmation: h.requireConfirmation === true,
            };
        }
        if (data.gateway != null && typeof data.gateway === "object") {
            const g = data.gateway;
            base.gateway = {
                host: typeof g.host === "string" ? g.host : undefined,
                auth: g.auth != null && typeof g.auth === "object"
                    ? {
                        enabled: g.auth.enabled === true,
                        apiKeyEnv: typeof g.auth.apiKeyEnv === "string"
                            ? g.auth.apiKeyEnv
                            : undefined,
                    }
                    : undefined,
                discovery: g.discovery != null && typeof g.discovery === "object"
                    ? { enabled: g.discovery.enabled === true }
                    : undefined,
            };
        }
        if (data.roles != null && typeof data.roles === "object") {
            const r = data.roles;
            base.roles = {
                dev: typeof r.dev === "string" ? r.dev : undefined,
                knowledge: typeof r.knowledge === "string" ? r.knowledge : undefined,
                pm: typeof r.pm === "string" ? r.pm : undefined,
                swarm_manager: typeof r.swarm_manager === "string" ? r.swarm_manager : undefined,
                general: typeof r.general === "string" ? r.general : undefined,
            };
        }
        if (data.swarm != null && typeof data.swarm === "object") {
            const s = data.swarm;
            const teams = Array.isArray(s.teams)
                ? s.teams.filter((e) => e != null &&
                    typeof e.id === "string" &&
                    typeof e.name === "string")
                : undefined;
            base.swarm = {
                teams: teams?.map((e) => ({
                    id: e.id,
                    name: e.name,
                    workspaces: Array.isArray(e.workspaces) ? e.workspaces.filter((w) => typeof w === "string") : undefined,
                })),
                defaultTeamId: typeof s.defaultTeamId === "string" ? s.defaultTeamId : undefined,
            };
        }
        if (data.knowledge != null && typeof data.knowledge === "object") {
            const k = data.knowledge;
            base.knowledge = {
                ingestPaths: Array.isArray(k.ingestPaths)
                    ? k.ingestPaths.filter((p) => typeof p === "string")
                    : undefined,
                ingestOnStart: k.ingestOnStart === true,
                retrieveLimit: typeof k.retrieveLimit === "number" && k.retrieveLimit > 0 ? k.retrieveLimit : undefined,
            };
        }
        if (data.diagnostic != null && typeof data.diagnostic === "object") {
            const d = data.diagnostic;
            base.diagnostic = {
                intervalDays: typeof d.intervalDays === "number" && d.intervalDays > 0 ? d.intervalDays : undefined,
                outputPath: typeof d.outputPath === "string" ? d.outputPath : undefined,
                intervalDaysSchedule: typeof d.intervalDaysSchedule === "number" && d.intervalDaysSchedule > 0
                    ? d.intervalDaysSchedule
                    : undefined,
            };
        }
        if (data.ideOperation != null && typeof data.ideOperation === "object") {
            const io = data.ideOperation;
            base.ideOperation = {
                uiAutomation: io.uiAutomation === true,
                keyMouse: io.keyMouse === true,
                visualClick: io.visualClick === true,
                allowedApps: Array.isArray(io.allowedApps)
                    ? io.allowedApps.filter((a) => typeof a === "string")
                    : undefined,
                timeoutMs: typeof io.timeoutMs === "number" && io.timeoutMs > 0 ? io.timeoutMs : undefined,
                confirmPolicy: io.confirmPolicy != null && typeof io.confirmPolicy === "object"
                    ? {
                        tools: Array.isArray(io.confirmPolicy.tools)
                            ? io.confirmPolicy.tools.filter((t) => typeof t === "string")
                            : undefined,
                        requireConfirm: io.confirmPolicy.requireConfirm === true,
                    }
                    : undefined,
            };
        }
        if (data.security != null && typeof data.security === "object") {
            const sec = data.security;
            base.security = {};
            if (sec.dangerousCommands != null && typeof sec.dangerousCommands === "object") {
                const dc = sec.dangerousCommands;
                base.security.dangerousCommands = {
                    mode: dc.mode === "block" || dc.mode === "confirm" || dc.mode === "dryRunOnly"
                        ? dc.mode
                        : undefined,
                    patterns: Array.isArray(dc.patterns)
                        ? dc.patterns.filter((p) => typeof p === "string")
                        : undefined,
                };
            }
            if (typeof sec.processKillRequireConfirm === "boolean") {
                base.security.processKillRequireConfirm = sec.processKillRequireConfirm;
            }
            if (Array.isArray(sec.protectedPids)) {
                base.security.protectedPids = sec.protectedPids.filter((p) => typeof p === "number" && Number.isInteger(p));
            }
            if (sec.permissionScopes != null && typeof sec.permissionScopes === "object") {
                const ps = sec.permissionScopes;
                base.security.permissionScopes = {};
                for (const [k, v] of Object.entries(ps)) {
                    if (v === "allow" || v === "confirm" || v === "deny") {
                        base.security.permissionScopes[k] = v;
                    }
                }
            }
            if (Array.isArray(sec.scheduledGrants)) {
                base.security.scheduledGrants = sec.scheduledGrants.filter((s) => s != null &&
                    typeof s.scope === "string" &&
                    typeof s.window === "string");
            }
        }
        if (data.llm != null && typeof data.llm === "object") {
            const l = data.llm;
            const prov = l.provider;
            if (prov === "anthropic" ||
                prov === "deepseek" ||
                prov === "minimax" ||
                prov === "ollama") {
                base.llm = {
                    provider: prov,
                    model: typeof l.model === "string" ? l.model : base.model.replace(/^[^/]+\//, "") || "claude-sonnet-4-20250514",
                    apiKeyEnv: typeof l.apiKeyEnv === "string" ? l.apiKeyEnv : undefined,
                    baseURL: typeof l.baseURL === "string" ? l.baseURL : undefined,
                    fallbackProvider: l.fallbackProvider === "anthropic" ||
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
const DEFAULT_ROLES = {
    dev: "你是本工作区的开发助手。侧重代码编写、修改、调试与运行。优先使用 bash、read、write、edit 等工具。",
    knowledge: "你是知识库顾问。仅依据记忆与检索作答；不执行写盘、bash 等修改操作，除非用户明确同意。若记忆中无相关信息请明确说明。",
    pm: "你是项目管理助手。侧重目标拆解、任务跟踪、进度汇总与画布更新。可读画布与任务，执行前优先给出提议。",
    swarm_manager: "你是蜂群协调助手。负责汇总多工作区/多角色的任务与进度，给出跨区建议与优先级。优先只读汇总与提议，执行前请确认。",
    general: "",
};
export function getRoleFragment(config, sessionType) {
    if (!sessionType || sessionType === "general")
        return undefined;
    const fromConfig = config.roles?.[sessionType];
    const fragment = fromConfig ?? DEFAULT_ROLES[sessionType];
    if (typeof fragment !== "string" || !fragment.trim())
        return undefined;
    return fragment.trim();
}
/** Phase 8: 读取 Gateway 认证用 API Key（环境变量） */
export function getGatewayApiKey(config) {
    const envName = config.gateway?.auth?.apiKeyEnv ?? "RZECLAW_GATEWAY_API_KEY";
    return process.env[envName]?.trim() || undefined;
}
/** 解析后的 LLM 配置（供 LLM 客户端使用）；未配置 llm 时等价于 anthropic + 顶层 model/apiKeyEnv */
export function getResolvedLlm(config) {
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
export function getApiKey(config) {
    const resolved = getResolvedLlm(config);
    if (resolved.provider === "ollama")
        return undefined;
    const envName = resolved.apiKeyEnv ?? "ANTHROPIC_API_KEY";
    return process.env[envName]?.trim() || undefined;
}
/** 当前配置下是否可调用 LLM（Ollama 无需 Key；云端需已配置对应 API Key） */
export function isLlmReady(config) {
    const resolved = getResolvedLlm(config);
    if (resolved.provider === "ollama")
        return true;
    return !!getApiKey(config);
}
