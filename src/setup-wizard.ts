/**
 * 安装后配置向导：依赖与环境提示 → 配置确认（模型、命令终端、Gateway）→ 启动指引
 * 使用上下键选择，Enter 确认，无需键入数字。
 */

import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { select, confirm } from "@inquirer/prompts";
import { loadConfig, getResolvedLlm } from "./config.js";

const PROJECT_NAME = "rzeclaw";
const MIN_NODE_MAJOR = 18;

function nodeVersionOk(): boolean {
  const major = parseInt(process.version.slice(1).split(".")[0] ?? "0", 10);
  return major >= MIN_NODE_MAJOR;
}

type ModelChoice = "anthropic" | "deepseek" | "ollama" | "minimax" | "keep";

export async function runSetupWizard(projectRoot: string): Promise<void> {
  const packagePath = join(projectRoot, "package.json");
  if (!existsSync(packagePath)) {
    console.error("未在项目根目录：当前目录下没有 package.json。请在克隆后的 Rzeclaw 目录内执行。");
    process.exit(2);
  }
  let pkg: { name?: string };
  try {
    pkg = JSON.parse(readFileSync(packagePath, "utf-8")) as { name?: string };
  } catch {
    pkg = {};
  }
  if (pkg.name !== PROJECT_NAME) {
    console.error("当前目录不是 Rzeclaw 项目（package.json 的 name 不是 rzeclaw）。请在项目根目录执行。");
    process.exit(2);
  }

  console.log("\n========== Rzeclaw 配置向导 ==========\n");

  // 1) 环境与依赖提示
  if (!nodeVersionOk()) {
    console.error(`需要 Node.js >= ${MIN_NODE_MAJOR}，当前为 ${process.version}。请先升级 Node 后重新执行。`);
    process.exit(1);
  }
  console.log(`[环境] Node ${process.version} ✓`);

  const hasDeps = existsSync(join(projectRoot, "node_modules", "@anthropic-ai", "sdk"));
  if (!hasDeps) {
    console.error("依赖未安装。请先执行：npm install && npm run build");
    process.exit(1);
  }
  console.log("[依赖] node_modules 已安装 ✓");

  const hasBuild = existsSync(join(projectRoot, "dist", "index.js"));
  if (!hasBuild) {
    console.error("未构建。请先执行：npm run build");
    process.exit(1);
  }
  console.log("[构建] dist 已生成 ✓\n");

  // 2) 确保 .env 与 rzeclaw.json 存在
  const envPath = join(projectRoot, ".env");
  const envExamplePath = join(projectRoot, ".env.example");
  if (!existsSync(envPath) && existsSync(envExamplePath)) {
    copyFileSync(envExamplePath, envPath);
    console.log("已从 .env.example 创建 .env，请稍后填写 API Key。");
  }

  const configPath = join(projectRoot, "rzeclaw.json");
  const configExamplePath = join(projectRoot, "rzeclaw.example.json");
  if (!existsSync(configPath) && existsSync(configExamplePath)) {
    copyFileSync(configExamplePath, configPath);
    console.log("已从 rzeclaw.example.json 创建 rzeclaw.json。");
  }

  // 3) 交互式配置确认（仅 TTY，使用上下键选择）
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.log("非交互终端，跳过配置确认。请手动编辑 .env 与 rzeclaw.json 后运行：");
    console.log("  node rzeclaw.mjs gateway  或  node rzeclaw.mjs agent \"你的问题\"");
    return;
  }

  try {
    // API Key 提示
    let config = loadConfig(configPath);
    const apiKeyEnv = config.llm?.apiKeyEnv ?? config.apiKeyEnv ?? "ANTHROPIC_API_KEY";
    const hasKey = !!process.env[apiKeyEnv]?.trim();
    if (!hasKey) {
      console.log("【API Key】未检测到环境变量 " + apiKeyEnv + "。");
      console.log("  请编辑项目根目录下的 .env，设置对应 API Key（如 ANTHROPIC_API_KEY=sk-ant-...）。\n");
      const cont = await confirm({
        message: "是否已设置并继续配置其他项？（选否则退出，设置后可重新运行 node rzeclaw.mjs setup）",
        default: true,
      });
      if (!cont) {
        console.log("请设置 .env 后重新执行：node rzeclaw.mjs setup");
        process.exit(0);
      }
    } else {
      console.log("[API Key] 已从环境变量 " + apiKeyEnv + " 读取 ✓\n");
    }

    // 模型选择（上下键 + Enter）
    const modelChoice = await select<ModelChoice>({
      message: "【模型选择】请用 ↑/↓ 选择，Enter 确认",
      choices: [
        { name: "Anthropic Claude（默认）", value: "anthropic" },
        { name: "DeepSeek", value: "deepseek" },
        { name: "Ollama（本地，无需 API Key）", value: "ollama" },
        { name: "MiniMax（需 API Key；当前不支持工具调用，仅对话）", value: "minimax" },
        { name: "保持当前配置", value: "keep" },
      ],
      default: "anthropic",
    });

    let configData: Record<string, unknown> = {};
    if (existsSync(configPath)) {
      try {
        configData = JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
      } catch {
        configData = {};
      }
    }
    if (modelChoice === "anthropic") {
      configData.model = "anthropic/claude-sonnet-4-20250514";
      configData.llm = { provider: "anthropic", model: "claude-sonnet-4-20250514", apiKeyEnv: "ANTHROPIC_API_KEY" };
    } else if (modelChoice === "deepseek") {
      configData.model = "deepseek/deepseek-chat";
      configData.llm = { provider: "deepseek", model: "deepseek-chat", apiKeyEnv: "DEEPSEEK_API_KEY" };
      console.log("  请在 .env 中设置 DEEPSEEK_API_KEY。");
    } else if (modelChoice === "ollama") {
      configData.model = "ollama/llama3.2";
      configData.llm = { provider: "ollama", model: "llama3.2" };
      console.log("  请确保本机已安装并启动 Ollama。");
    } else if (modelChoice === "minimax") {
      configData.model = "minimax/M2-her";
      configData.llm = { provider: "minimax", model: "M2-her", apiKeyEnv: "MINIMAX_API_KEY" };
      console.log("  请在 .env 中设置 MINIMAX_API_KEY。注意：MiniMax 当前不支持工具调用，仅适合纯对话。");
    }
    if (modelChoice !== "keep") {
      if (typeof configData.workspace !== "string") configData.workspace = "./workspace";
      if (typeof configData.port !== "number") configData.port = 18789;
      writeFileSync(configPath, JSON.stringify(configData, null, 2), "utf-8");
      console.log("  已写入 rzeclaw.json。\n");
    }
    config = loadConfig(configPath);
    const resolved = getResolvedLlm(config);
    console.log("  当前模型: " + resolved.provider + " / " + resolved.model + "\n");

    // 命令终端（bash）是否需确认（上下键选择）
    const bashChoice = await select<"allow" | "confirm">({
      message: "【命令终端】Agent 执行 bash 命令时：请用 ↑/↓ 选择，Enter 确认",
      choices: [
        { name: "允许直接执行", value: "allow" },
        { name: "需要我确认后再执行", value: "confirm" },
      ],
      default: "allow",
    });
    if (existsSync(configPath)) {
      configData = JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    }
    if (!configData.security) configData.security = {};
    const sec = configData.security as Record<string, unknown>;
    if (!sec.permissionScopes) sec.permissionScopes = {};
    const scopes = sec.permissionScopes as Record<string, string>;
    scopes.bash = bashChoice;
    writeFileSync(configPath, JSON.stringify(configData, null, 2), "utf-8");
    console.log("  已设置: bash 策略 = " + (bashChoice === "confirm" ? "需要确认" : "允许直接执行") + "\n");

    // 是否启动 Gateway（上下键选择）
    const startGateway = await select<"later" | "now">({
      message: "【启动方式】请用 ↑/↓ 选择，Enter 确认",
      choices: [
        { name: "仅配置，稍后手动启动", value: "later" },
        { name: "现在启动 Gateway（将提示在新终端执行命令）", value: "now" },
      ],
      default: "later",
    });

    console.log("\n========== 配置完成 ==========\n");
    if (startGateway === "now") {
      console.log("请在新开一个终端中执行：");
      console.log("  cd " + projectRoot);
      console.log("  node rzeclaw.mjs gateway");
      console.log("\n然后使用 WebSocket 客户端连接 ws://127.0.0.1:18789 进行对话。");
    } else {
      console.log("下一步可执行：");
      console.log("  • 直接对话: node rzeclaw.mjs agent \"你的问题\"");
      console.log("  • 启动 Gateway: node rzeclaw.mjs gateway");
    }
    console.log("");
  } catch (err) {
    if (err && typeof err === "object" && "name" in err && (err as { name: string }).name === "ExitPromptError") {
      console.log("\n已取消。");
      process.exit(0);
    }
    throw err;
  }
}
