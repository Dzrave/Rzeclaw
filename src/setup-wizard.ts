/**
 * 安装后配置向导：依赖与环境提示 → 配置确认（模型、命令终端、Gateway）→ 启动指引
 */

import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { runSelfCheck } from "./self-check.js";
import { loadConfig, getResolvedLlm } from "./config.js";

const PROJECT_NAME = "rzeclaw";
const MIN_NODE_MAJOR = 18;

function ask(rl: ReturnType<typeof createInterface>, prompt: string): Promise<string> {
  return new Promise((resolve) => rl.question(prompt, (ans) => resolve((ans ?? "").trim())));
}

function nodeVersionOk(): boolean {
  const major = parseInt(process.version.slice(1).split(".")[0] ?? "0", 10);
  return major >= MIN_NODE_MAJOR;
}

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

  // 3) 交互式配置确认（仅 TTY）
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.log("非交互终端，跳过配置确认。请手动编辑 .env 与 rzeclaw.json 后运行：");
    console.log("  node rzeclaw.mjs gateway  或  node rzeclaw.mjs agent \"你的问题\"");
    return;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    // API Key 提示
    let config = loadConfig(configPath);
    const apiKeyEnv = config.llm?.apiKeyEnv ?? config.apiKeyEnv ?? "ANTHROPIC_API_KEY";
    const hasKey = !!process.env[apiKeyEnv]?.trim();
    if (!hasKey) {
      console.log("【API Key】未检测到环境变量 " + apiKeyEnv + "。");
      console.log("  请编辑项目根目录下的 .env，设置：ANTHROPIC_API_KEY=sk-ant-...");
      const cont = await ask(rl, "  是否已设置并继续配置其他项？(y/n，选 n 则退出后设置再运行本向导) [y]: ");
      if (cont.toLowerCase() === "n") {
        console.log("请设置 .env 后重新执行：node rzeclaw.mjs setup");
        process.exit(0);
      }
    } else {
      console.log("[API Key] 已从环境变量 " + apiKeyEnv + " 读取 ✓");
    }

    // 模型选择
    console.log("\n【模型选择】");
    console.log("  1) Anthropic Claude（默认）");
    console.log("  2) DeepSeek");
    console.log("  3) Ollama（本地，无需 API Key）");
    console.log("  4) 保持当前配置");
    const modelChoice = await ask(rl, "请选择 (1/2/3/4) [1]: ") || "1";

    let configData: Record<string, unknown> = {};
    if (existsSync(configPath)) {
      try {
        configData = JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
      } catch {
        configData = {};
      }
    }
    if (modelChoice === "1") {
      configData.model = "anthropic/claude-sonnet-4-20250514";
      configData.llm = { provider: "anthropic", model: "claude-sonnet-4-20250514", apiKeyEnv: "ANTHROPIC_API_KEY" };
    } else if (modelChoice === "2") {
      configData.model = "deepseek/deepseek-chat";
      configData.llm = { provider: "deepseek", model: "deepseek-chat", apiKeyEnv: "DEEPSEEK_API_KEY" };
      console.log("  请在 .env 中设置 DEEPSEEK_API_KEY。");
    } else if (modelChoice === "3") {
      configData.model = "ollama/llama3.2";
      configData.llm = { provider: "ollama", model: "llama3.2" };
      console.log("  请确保本机已安装并启动 Ollama。");
    }
    if (modelChoice !== "4") {
      if (typeof configData.workspace !== "string") configData.workspace = "./workspace";
      if (typeof configData.port !== "number") configData.port = 18789;
      writeFileSync(configPath, JSON.stringify(configData, null, 2), "utf-8");
      console.log("  已写入 rzeclaw.json。");
    }
    config = loadConfig(configPath);
    const resolved = getResolvedLlm(config);
    console.log("  当前模型: " + resolved.provider + " / " + resolved.model);

    // 命令终端（bash）是否需确认（重新读取以保留刚写入的 model）
    console.log("\n【命令终端】Agent 执行 bash 命令时：");
    console.log("  1) 允许直接执行");
    console.log("  2) 需要我确认后再执行");
    const bashChoice = await ask(rl, "请选择 (1/2) [1]: ") || "1";
    if (existsSync(configPath)) {
      configData = JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    }
    if (!configData.security) configData.security = {};
    const sec = configData.security as Record<string, unknown>;
    if (!sec.permissionScopes) sec.permissionScopes = {};
    const scopes = sec.permissionScopes as Record<string, string>;
    scopes.bash = bashChoice === "2" ? "confirm" : "allow";
    writeFileSync(configPath, JSON.stringify(configData, null, 2), "utf-8");
    console.log("  已设置: bash 策略 = " + (bashChoice === "2" ? "需要确认" : "允许直接执行"));

    // 是否启动 Gateway
    console.log("\n【启动方式】");
    console.log("  1) 仅配置，稍后手动启动");
    console.log("  2) 现在启动 Gateway（在新终端执行）");
    const startChoice = await ask(rl, "请选择 (1/2) [1]: ") || "1";

    console.log("\n========== 配置完成 ==========\n");
    if (startChoice === "2") {
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
  } finally {
    rl.close();
  }
}
