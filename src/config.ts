import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir, platform } from "node:os";

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
  };

  if (path && existsSync(path)) {
    const data = loadJson(path);
    if (typeof data.model === "string") base.model = data.model;
    if (typeof data.workspace === "string") base.workspace = data.workspace;
    if (typeof data.port === "number") base.port = data.port;
    if (typeof data.apiKeyEnv === "string") base.apiKeyEnv = data.apiKeyEnv;
  }

  return base;
}

export function getApiKey(config: RzeclawConfig): string | undefined {
  const envName = config.apiKeyEnv ?? "ANTHROPIC_API_KEY";
  return process.env[envName]?.trim() || undefined;
}
