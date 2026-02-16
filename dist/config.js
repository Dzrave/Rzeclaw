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
    }
    return base;
}
export function getApiKey(config) {
    const envName = config.apiKeyEnv ?? "ANTHROPIC_API_KEY";
    return process.env[envName]?.trim() || undefined;
}
