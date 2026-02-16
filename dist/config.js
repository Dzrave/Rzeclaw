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
    }
    return base;
}
export function getApiKey(config) {
    const envName = config.apiKeyEnv ?? "ANTHROPIC_API_KEY";
    return process.env[envName]?.trim() || undefined;
}
