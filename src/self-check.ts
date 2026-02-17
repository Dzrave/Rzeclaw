/**
 * 自检与修复：检测运行环境、依赖、构建与配置，并可执行修复（重装依赖、重新构建、恢复示例配置）。
 */

import { existsSync, copyFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { loadConfig, isLlmReady, getResolvedLlm } from "./config.js";
import { mkdir, access } from "node:fs/promises";
import { readLastNEntries } from "./observability/op-log.js";

export type CheckItem = {
  id: string;
  ok: boolean;
  message: string;
  repair?: string;
};

export type SelfCheckResult = {
  ok: boolean;
  projectRoot: string;
  items: CheckItem[];
};

const MIN_NODE_MAJOR = 18;

/**
 * 在 projectRoot（通常为 process.cwd()）下执行自检。
 */
export async function runSelfCheck(projectRoot: string): Promise<SelfCheckResult> {
  const items: CheckItem[] = [];

  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.slice(1).split(".")[0] ?? "0", 10);
  items.push({
    id: "node",
    ok: major >= MIN_NODE_MAJOR,
    message: major >= MIN_NODE_MAJOR ? `Node ${nodeVersion} (>=${MIN_NODE_MAJOR})` : `Node ${nodeVersion} 版本过低，需要 >= ${MIN_NODE_MAJOR}`,
    repair: "请升级 Node.js 至 18 或更高版本",
  });

  const hasPackageJson = existsSync(join(projectRoot, "package.json"));
  items.push({
    id: "package.json",
    ok: hasPackageJson,
    message: hasPackageJson ? "package.json 存在" : "未找到 package.json（请在项目根目录执行）",
    repair: "在包含 package.json 的目录下执行自检",
  });

  const nodeModulesPath = join(projectRoot, "node_modules");
  const hasNodeModules = existsSync(nodeModulesPath);
  const hasKeyDep = hasNodeModules && existsSync(join(nodeModulesPath, "@anthropic-ai", "sdk"));
  items.push({
    id: "deps",
    ok: hasKeyDep,
    message: hasKeyDep ? "依赖已安装" : hasNodeModules ? "依赖不完整" : "node_modules 缺失",
    repair: "执行 npm install 或运行 rzeclaw repair",
  });

  const distPath = join(projectRoot, "dist");
  const distIndex = join(distPath, "index.js");
  const hasDist = existsSync(distIndex);
  items.push({
    id: "build",
    ok: hasDist,
    message: hasDist ? "已构建 (dist/index.js)" : "未构建或构建不完整",
    repair: "执行 npm run build 或运行 rzeclaw repair",
  });

  let configLoaded = false;
  let configError: string | undefined;
  try {
    const config = loadConfig();
    configLoaded = !!config;
    if (configLoaded) {
      const resolved = getResolvedLlm(config);
      const ws = join(projectRoot, config.workspace);
      items.push({
        id: "config",
        ok: true,
        message: `配置已加载 (provider: ${resolved.provider}, model: ${resolved.model})`,
      });
      const llmOk = isLlmReady(config);
      items.push({
        id: "llm",
        ok: llmOk,
        message: llmOk ? "LLM 就绪（API Key 或 Ollama 可用）" : "LLM 未就绪（请设置对应 API Key 或启动 Ollama）",
        repair: "在 .env 中设置 API Key，或配置 llm.provider 为 ollama",
      });
    }
  } catch (e) {
    configError = e instanceof Error ? e.message : String(e);
    items.push({
      id: "config",
      ok: false,
      message: `配置加载失败: ${configError}`,
      repair: "检查 rzeclaw.json 或 ~/.rzeclaw/config.json 格式，或运行 rzeclaw repair --reset-config 从示例恢复",
    });
  }

  if (configLoaded && !configError) {
    try {
      const config = loadConfig();
      const workspace = resolve(projectRoot, config.workspace);
      let writable = false;
      try {
        await access(workspace, 1 | 2);
        writable = true;
      } catch {
        try {
          await mkdir(workspace, { recursive: true });
          writable = true;
        } catch {
          // leave false
        }
      }
      items.push({
        id: "workspace",
        ok: writable,
        message: writable ? `工作区可写: ${config.workspace}` : `工作区不可写或无法创建: ${config.workspace}`,
        repair: "检查目录权限或修改 config.workspace 路径",
      });
    } catch {
      // skip workspace check if config failed
    }
  }

  if (configLoaded && !configError) {
    try {
      const config = loadConfig();
      const workspaceRoot = resolve(projectRoot, config.workspace);
      const recentOps = await readLastNEntries(workspaceRoot, 30);
      const hasHighRisk = recentOps.some((e) => e.risk_level === "high");
      items.push({
        id: "recent_ops_risk",
        ok: !hasHighRisk,
        message: hasHighRisk
          ? "最近 30 条操作中存在高风险记录，建议检查工作区或执行纠正"
          : "最近操作无高风险记录",
        repair: "可运行 rzeclaw agent 使用 undo_last 撤销最近可撤销操作，或查看 docs/SELF_CHECK_AND_UNINSTALL.md 的纠正说明",
      });
    } catch {
      // skip if config/workspace unavailable
    }
  }

  const ok = items.every((i) => i.ok);
  return { ok, projectRoot, items };
}

export type RepairOptions = {
  install?: boolean;
  build?: boolean;
  resetConfig?: boolean;
  resetEnv?: boolean;
};

/**
 * 执行修复步骤（需在项目根目录调用）；部分步骤需通过子进程执行 npm。
 */
export function getRepairSteps(options: RepairOptions): Array<{ id: string; description: string; run: () => Promise<void> }> {
  const projectRoot = process.cwd();
  const steps: Array<{ id: string; description: string; run: () => Promise<void> }> = [];

  if (options.install !== false) {
    steps.push({
      id: "install",
      description: "npm install",
      run: () => runNpm(projectRoot, ["install"]),
    });
  }
  if (options.build !== false) {
    steps.push({
      id: "build",
      description: "npm run build",
      run: () => runNpm(projectRoot, ["run", "build"]),
    });
  }
  if (options.resetConfig) {
    steps.push({
      id: "reset-config",
      description: "从 rzeclaw.example.json 恢复 rzeclaw.json",
      run: async () => {
        const src = join(projectRoot, "rzeclaw.example.json");
        const dest = join(projectRoot, "rzeclaw.json");
        if (existsSync(src)) {
          copyFileSync(src, dest);
        } else {
          throw new Error("未找到 rzeclaw.example.json");
        }
      },
    });
  }
  if (options.resetEnv) {
    steps.push({
      id: "reset-env",
      description: "从 .env.example 恢复 .env",
      run: async () => {
        const src = join(projectRoot, ".env.example");
        const dest = join(projectRoot, ".env");
        if (existsSync(src)) {
          copyFileSync(src, dest);
        } else {
          throw new Error("未找到 .env.example");
        }
      },
    });
  }
  return steps;
}

function runNpm(cwd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", args, {
      cwd,
      stdio: "inherit",
      shell: true,
    });
    child.on("close", (code: number) => (code === 0 ? resolve() : reject(new Error(`npm exit ${code}`))));
    child.on("error", reject);
  });
}
