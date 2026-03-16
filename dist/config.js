import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir, platform } from "node:os";
const DEFAULT_WORKSPACE = join(homedir(), ".rzeclaw", "workspace");
const DEFAULT_PORT = 18789;
/** WO-1526: 查找配置文件路径，供热重载 mtime 轮询使用 */
export function findConfigPath() {
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
            const rl = m.rollingLedger != null && typeof m.rollingLedger === "object" ? m.rollingLedger : undefined;
            base.memory = {
                enabled: m.enabled === true,
                storagePath: typeof m.storagePath === "string" ? m.storagePath : undefined,
                workspaceId: typeof m.workspaceId === "string" ? m.workspaceId : undefined,
                coldAfterDays: typeof m.coldAfterDays === "number" && m.coldAfterDays >= 0 ? m.coldAfterDays : undefined,
                rollingLedger: rl != null
                    ? {
                        enabled: rl.enabled === true,
                        windowDays: typeof rl.windowDays === "number" && rl.windowDays >= 1 && rl.windowDays <= 30
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
            const ev = data.evolution;
            const it = ev.insertTree;
            base.evolution = {
                bootstrapDocPath: typeof ev.bootstrapDocPath === "string" ? ev.bootstrapDocPath : undefined,
                insertTree: it != null && typeof it === "object"
                    ? (() => {
                        const t = it;
                        return {
                            enabled: t.enabled === true,
                            autoRun: t.autoRun === true,
                            requireUserConfirmation: t.requireUserConfirmation === true,
                            allowHighRiskOp: t.allowHighRiskOp === true,
                            targetFlowId: typeof t.targetFlowId === "string" ? t.targetFlowId : undefined,
                            targetSelectorNodeId: typeof t.targetSelectorNodeId === "string" ? t.targetSelectorNodeId : undefined,
                            evolvedSkillsDir: typeof t.evolvedSkillsDir === "string" ? t.evolvedSkillsDir : undefined,
                            sandboxTimeoutMs: typeof t.sandboxTimeoutMs === "number" && t.sandboxTimeoutMs > 0
                                ? t.sandboxTimeoutMs
                                : undefined,
                            maxRetries: typeof t.maxRetries === "number" && t.maxRetries >= 0 ? t.maxRetries : undefined,
                        };
                    })()
                    : undefined,
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
        if (data.flows != null && typeof data.flows === "object") {
            const f = data.flows;
            const fr = f.failureReplacement;
            const gf = f.generateFlow;
            base.flows = {
                enabled: f.enabled === true,
                libraryPath: typeof f.libraryPath === "string" ? f.libraryPath : undefined,
                routes: Array.isArray(f.routes)
                    ? f.routes.filter((e) => e != null &&
                        typeof e.hint === "string" &&
                        typeof e.flowId === "string")
                    : undefined,
                failureReplacement: fr != null && typeof fr === "object"
                    ? (() => {
                        const r = fr;
                        const thr = r.failureRateThreshold;
                        const minS = r.minSamples;
                        const consec = r.consecutiveFailuresThreshold;
                        return {
                            enabled: r.enabled === true,
                            failureRateThreshold: typeof thr === "number" && thr >= 0 && thr <= 1 ? thr : undefined,
                            minSamples: typeof minS === "number" && minS >= 0 ? minS : undefined,
                            consecutiveFailuresThreshold: typeof consec === "number" && consec >= 1 ? consec : undefined,
                            markOnly: r.markOnly === true,
                            async: r.async !== false,
                        };
                    })()
                    : undefined,
                generateFlow: gf != null && typeof gf === "object"
                    ? {
                        enabled: gf.enabled === true,
                        triggerOnNoMatch: gf.triggerOnNoMatch === true,
                        triggerPattern: typeof gf.triggerPattern === "string"
                            ? gf.triggerPattern
                            : undefined,
                    }
                    : undefined,
            };
        }
        if (data.vectorEmbedding != null && typeof data.vectorEmbedding === "object") {
            const ve = data.vectorEmbedding;
            const coll = ve.collections;
            const collections = {};
            if (coll != null && typeof coll === "object") {
                for (const [name, c] of Object.entries(coll)) {
                    if (c != null && typeof c === "object") {
                        const cc = c;
                        collections[name] = {
                            enabled: cc.enabled === true,
                            pathOverride: typeof cc.pathOverride === "string" ? cc.pathOverride : undefined,
                        };
                    }
                }
            }
            base.vectorEmbedding = {
                enabled: ve.enabled === true,
                provider: ve.provider === "ollama" || ve.provider === "openai-compatible"
                    ? ve.provider
                    : undefined,
                endpoint: typeof ve.endpoint === "string" ? ve.endpoint : undefined,
                model: typeof ve.model === "string" ? ve.model : undefined,
                indexStoragePath: typeof ve.indexStoragePath === "string" ? ve.indexStoragePath : undefined,
                collections: Object.keys(collections).length > 0 ? collections : undefined,
                motivationThreshold: typeof ve.motivationThreshold === "number" &&
                    ve.motivationThreshold >= 0 &&
                    ve.motivationThreshold <= 1
                    ? ve.motivationThreshold
                    : undefined,
            };
        }
        if (data.localModel != null && typeof data.localModel === "object") {
            const lm = data.localModel;
            const modes = lm.modes;
            const ic = modes != null && typeof modes === "object" && modes.intentClassifier != null
                ? modes.intentClassifier
                : undefined;
            base.localModel = {
                enabled: lm.enabled === true,
                provider: lm.provider === "ollama" || lm.provider === "openai-compatible" ? lm.provider : undefined,
                endpoint: typeof lm.endpoint === "string" ? lm.endpoint : undefined,
                model: typeof lm.model === "string" ? lm.model : undefined,
                timeoutMs: typeof lm.timeoutMs === "number" && lm.timeoutMs > 0 ? lm.timeoutMs : undefined,
                modes: ic != null && typeof ic === "object"
                    ? {
                        intentClassifier: {
                            enabled: ic.enabled === true,
                            confidenceThreshold: typeof ic.confidenceThreshold === "number" &&
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
            const rr = data.retrospective;
            base.retrospective = {
                enabled: rr.enabled === true,
                cron: typeof rr.cron === "string" ? rr.cron : undefined,
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
            if (sec.postActionReview != null && typeof sec.postActionReview === "object") {
                const par = sec.postActionReview;
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
            const eb = data.eventBus;
            base.eventBus = {
                enabled: eb.enabled === true,
                responseTimeoutMs: typeof eb.responseTimeoutMs === "number" && eb.responseTimeoutMs > 0
                    ? eb.responseTimeoutMs
                    : undefined,
            };
        }
        if (data.agents != null && typeof data.agents === "object") {
            const ag = data.agents;
            const blueprintsRaw = Array.isArray(ag.blueprints) ? ag.blueprints : [];
            const blueprints = [];
            for (const b of blueprintsRaw) {
                if (b != null && typeof b === "object" && typeof b.id === "string") {
                    const x = b;
                    const lm = x.localMemory;
                    blueprints.push({
                        id: x.id,
                        name: typeof x.name === "string" ? x.name : undefined,
                        systemPrompt: typeof x.systemPrompt === "string" ? x.systemPrompt : undefined,
                        boundFlowIds: Array.isArray(x.boundFlowIds) ? x.boundFlowIds.filter((id) => typeof id === "string") : undefined,
                        localMemory: lm != null && typeof lm === "object" && lm.enabled === true
                            ? {
                                enabled: true,
                                storagePath: typeof lm.storagePath === "string" ? lm.storagePath : undefined,
                                retrieveLimit: typeof lm.retrieveLimit === "number" ? lm.retrieveLimit : undefined,
                                includeGlobalRead: lm.includeGlobalRead === true,
                            }
                            : undefined,
                        llm: undefined,
                        toolsFilter: Array.isArray(x.toolsFilter) ? x.toolsFilter.filter((t) => typeof t === "string") : undefined,
                    });
                }
            }
            const routesRaw = Array.isArray(ag.routes) ? ag.routes : [];
            const routes = routesRaw.filter((r) => r != null &&
                typeof r === "object" &&
                typeof r.hint === "string" &&
                typeof r.agentId === "string");
            base.agents = {
                blueprints: blueprints.length > 0 ? blueprints : undefined,
                defaultAgentId: typeof ag.defaultAgentId === "string" ? ag.defaultAgentId : undefined,
                routes: routes.length > 0 ? routes : undefined,
            };
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
        if (data.hotReload != null && typeof data.hotReload === "object") {
            const hr = data.hotReload;
            base.hotReload = {
                intervalSeconds: typeof hr.intervalSeconds === "number" && hr.intervalSeconds >= 0 ? hr.intervalSeconds : undefined,
                allowExplicitReload: hr.allowExplicitReload === false ? false : true,
            };
        }
        if (data.taskExecution != null && typeof data.taskExecution === "object") {
            const te = data.taskExecution;
            base.taskExecution = {
                mode: te.mode === "worker" ? "worker" : "in_process",
            };
        }
        if (data.taskResults != null && typeof data.taskResults === "object") {
            const tr = data.taskResults;
            base.taskResults = {
                retentionMinutes: typeof tr.retentionMinutes === "number" && tr.retentionMinutes > 0 ? tr.retentionMinutes : undefined,
            };
        }
        if (data.exploration != null && typeof data.exploration === "object") {
            const ex = data.exploration;
            const trigger = ex.trigger != null && typeof ex.trigger === "object" ? ex.trigger : undefined;
            const planner = ex.planner != null && typeof ex.planner === "object" ? ex.planner : undefined;
            const critic = ex.critic != null && typeof ex.critic === "object" ? ex.critic : undefined;
            const weights = critic?.weights != null && typeof critic.weights === "object" ? critic.weights : undefined;
            const snapshot = ex.snapshot != null && typeof ex.snapshot === "object" ? ex.snapshot : undefined;
            const experience = ex.experience != null && typeof ex.experience === "object" ? ex.experience : undefined;
            base.exploration = {
                enabled: ex.enabled === true,
                timeoutMs: typeof ex.timeoutMs === "number" && ex.timeoutMs > 0 ? ex.timeoutMs : undefined,
                trigger: trigger
                    ? {
                        openIntents: Array.isArray(trigger.openIntents)
                            ? trigger.openIntents.filter((x) => typeof x === "string")
                            : undefined,
                        complexThresholdChars: typeof trigger.complexThresholdChars === "number" && trigger.complexThresholdChars >= 0
                            ? trigger.complexThresholdChars
                            : undefined,
                        uncertaintyThreshold: typeof trigger.uncertaintyThreshold === "number" && trigger.uncertaintyThreshold >= 0 && trigger.uncertaintyThreshold <= 1
                            ? trigger.uncertaintyThreshold
                            : undefined,
                        failureRateThreshold: typeof trigger.failureRateThreshold === "number" && trigger.failureRateThreshold >= 0 && trigger.failureRateThreshold <= 1
                            ? trigger.failureRateThreshold
                            : undefined,
                    }
                    : undefined,
                planner: planner
                    ? {
                        maxVariants: typeof planner.maxVariants === "number" && planner.maxVariants >= 1 && planner.maxVariants <= 10
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
                        maxRelevantSkills: typeof snapshot.maxRelevantSkills === "number" && snapshot.maxRelevantSkills > 0
                            ? snapshot.maxRelevantSkills
                            : undefined,
                    }
                    : undefined,
                experience: experience
                    ? {
                        enabled: experience.enabled === true,
                        collection: typeof experience.collection === "string" ? experience.collection : undefined,
                        reuseThreshold: typeof experience.reuseThreshold === "number" && experience.reuseThreshold >= 0 && experience.reuseThreshold <= 1
                            ? experience.reuseThreshold
                            : undefined,
                        requireSnapshotMatch: experience.requireSnapshotMatch === true,
                        storeOutcome: experience.storeOutcome === true,
                        maxEntries: typeof experience.maxEntries === "number" && experience.maxEntries > 0 ? experience.maxEntries : undefined,
                    }
                    : undefined,
            };
        }
    }
    return base;
}
/** WO-1520: 可热重载的顶层配置键（不含 port、workspace、gateway.host 需保留） */
export const RELOADABLE_CONFIG_KEYS = [
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
export function reloadConfig(currentConfig) {
    const path = findConfigPath();
    if (!path || !existsSync(path)) {
        return { ok: false, message: "Config file not found" };
    }
    let newConfig;
    try {
        newConfig = loadConfig(path);
    }
    catch (e) {
        return {
            ok: false,
            message: e instanceof Error ? e.message : String(e),
        };
    }
    const preservedHost = currentConfig.gateway?.host;
    for (const key of RELOADABLE_CONFIG_KEYS) {
        if (key === "gateway") {
            currentConfig[key] = newConfig[key];
            if (currentConfig.gateway && preservedHost !== undefined) {
                currentConfig.gateway.host = preservedHost;
            }
        }
        else {
            currentConfig[key] = newConfig[key];
        }
    }
    return { ok: true };
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
/** 当前配置下是否可调用主 LLM（runAgentLoop 可用：Ollama 或云端已配置 API Key） */
export function isLlmReady(config) {
    const resolved = getResolvedLlm(config);
    if (resolved.provider === "ollama")
        return true;
    return !!getApiKey(config);
}
/** WO-LM-003: 本地模型意图分类是否可用（enabled + endpoint + model + modes.intentClassifier.enabled） */
export function isLocalIntentClassifierAvailable(config) {
    const lm = config.localModel;
    if (!lm?.enabled || !lm.endpoint || !lm.model)
        return false;
    return lm.modes?.intentClassifier?.enabled === true;
}
