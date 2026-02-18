import { Command } from "commander";
import { loadConfig, isLlmReady } from "./config.js";
import { createGatewayServer } from "./gateway/server.js";
import { runAgentLoop } from "./agent/loop.js";
import { createStore } from "./memory/store-jsonl.js";
import { flushToL1 } from "./memory/write-pipeline.js";
import { writeSessionSummaryFile } from "./memory/session-summary-file.js";
import { extractTaskHint } from "./memory/task-hint.js";
import { promoteL1ToL2 } from "./memory/l2.js";
import { writePromptSuggestions } from "./evolution/prompt-suggestions.js";
import { readSnapshot } from "./session/snapshot.js";
import { archiveCold } from "./memory/cold-archive.js";
import { queryAuditLog, exportAuditLog } from "./memory/audit-query.js";
import { readSessionMetricsFromDir } from "./observability/metrics.js";
import { generateReport, writeSuggestionsFile } from "./diagnostic/index.js";
import { mkdir, access } from "node:fs/promises";
import path from "node:path";
import { runSelfCheck, getRepairSteps } from "./self-check.js";
import { runUninstall } from "./uninstall.js";
import { runSetupWizard } from "./setup-wizard.js";

const program = new Command();

program
  .name("rzeclaw")
  .description("Minimal AI assistant with computer tools (bash, read, write, edit, process)")
  .version("0.1.0");

program
  .command("gateway")
  .description("Start the Gateway WebSocket server (control plane + tool execution)")
  .option("-p, --port <number>", "Port", (v) => parseInt(v, 10))
  .action(async (opts) => {
    const config = loadConfig();
    const port = opts.port ?? config.port;
    const workspace = path.resolve(config.workspace);
    await mkdir(workspace, { recursive: true });
    createGatewayServer(config, port);
  });

program
  .command("agent")
  .description("Send a message to the agent (in-process: no gateway required)")
  .argument("[message]", "User message")
  .option("-m, --message <text>", "Message (alternative to positional)")
  .option("-r, --restore <sessionId>", "Restore session from snapshot; message is the next user input")
  .option("--privacy", "WO-SEC-006: Privacy mode — do not write to L1 memory or session summary")
  .action(async (posMessage, opts) => {
    const config = loadConfig();
    const message = opts.message ?? posMessage;
    if (!message || typeof message !== "string") {
      console.error("Provide a message: rzeclaw agent \"your question\"");
      process.exit(2);
    }
    if (!isLlmReady(config)) {
      console.error("LLM 未就绪：请为当前提供商设置对应 API Key（如 ANTHROPIC_API_KEY、DEEPSEEK_API_KEY、MINIMAX_API_KEY），或使用本地 Ollama（无需 Key）。可在 rzeclaw.json 中配置 llm.provider 与 llm.apiKeyEnv。");
      process.exit(1);
    }
    const workspace = path.resolve(config.workspace);
    await mkdir(workspace, { recursive: true });

    let sessionMessages: { role: "user" | "assistant"; content: string }[] = [];
    let sessionGoal: string | undefined;
    let sessionId: string | undefined = opts.restore ? String(opts.restore) : undefined;

    if (opts.restore && typeof opts.restore === "string") {
      const snapshot = await readSnapshot(workspace, opts.restore);
      if (snapshot) {
        sessionMessages = snapshot.messages;
        sessionGoal = snapshot.sessionGoal;
        sessionId = snapshot.sessionId;
      }
    }

    const privacyMode = !!opts.privacy;
    const { content, messages, sessionId: outSessionId } = await runAgentLoop({
      config,
      userMessage: message,
      sessionMessages,
      sessionId,
      sessionGoal,
      sessionFlags: privacyMode ? { privacy: true } : undefined,
      onText: (chunk) => process.stdout.write(chunk),
    });
    const finalSessionId = outSessionId;
    if (config.memory?.enabled && messages.length >= 2 && !privacyMode) {
      const store = createStore(workspace, config.memory.workspaceId);
      const lastUserMessage = typeof message === "string" ? message : "";
      const { summary, factCount } = await flushToL1({
        config,
        sessionId: finalSessionId,
        messages,
        store,
        workspaceId: config.memory.workspaceId ?? workspace,
        taskHint: extractTaskHint(lastUserMessage),
      });
      await writeSessionSummaryFile({
        workspaceDir: workspace,
        sessionId: finalSessionId,
        summary,
        factCount,
      });
      const workspaceId = config.memory.workspaceId ?? workspace;
      await promoteL1ToL2(store, {
        workspace_id: workspaceId,
        created_after: new Date(Date.now() - 120_000).toISOString(),
        limit: 50,
      });
      await writePromptSuggestions({
        config,
        workspaceDir: workspace,
        sessionId: finalSessionId,
        summary,
      });
    }
    if (!content && !process.stdout.isTTY) {
      console.log(content);
    }
  });

program
  .command("archive-cold")
  .description("WO-407: Move old L1 entries to cold storage (use memory.coldAfterDays in config)")
  .option("-w, --workspace <path>", "Workspace path (default from config)")
  .action(async (opts) => {
    const config = loadConfig();
    const workspace = path.resolve(opts.workspace ?? config.workspace);
    const coldAfterDays = config.memory?.coldAfterDays ?? 30;
    if (coldAfterDays <= 0) {
      console.log("coldAfterDays not set or 0; set memory.coldAfterDays in config to enable.");
      return;
    }
    const workspaceId = config.memory?.workspaceId;
    const count = await archiveCold(workspace, workspaceId, coldAfterDays);
    console.log(`Archived ${count} entries to cold storage.`);
  });

program
  .command("audit-export")
  .description("WO-407: Query and export audit log (JSON or CSV)")
  .option("-w, --workspace <path>", "Workspace path (default from config)")
  .option("--session-id <id>", "Filter by session id")
  .option("--after <iso>", "Filter records after this time (ISO)")
  .option("--before <iso>", "Filter records before this time (ISO)")
  .option("-f, --format <json|csv>", "Output format", "json")
  .option("--summary", "WO-508: Output by-session or by-day summary instead of raw records")
  .action(async (opts) => {
    const config = loadConfig();
    const workspace = path.resolve(opts.workspace ?? config.workspace);
    const records = await queryAuditLog(workspace, {
      sessionId: opts.sessionId,
      after: opts.after,
      before: opts.before,
    });
    if (opts.summary) {
      const bySession = new Map<string, number>();
      for (const r of records) {
        const k = r.who ?? r.from_where ?? "unknown";
        bySession.set(k, (bySession.get(k) ?? 0) + 1);
      }
      const summary = Object.fromEntries(bySession);
      console.log(JSON.stringify({ bySession: summary, totalRecords: records.length }, null, 2));
      return;
    }
    const format = opts.format === "csv" ? "csv" : "json";
    console.log(exportAuditLog(records, format));
  });

program
  .command("metrics-export")
  .description("WO-508: Export session metrics as JSON")
  .option("-w, --workspace <path>", "Workspace path (default from config)")
  .option("-n, --limit <number>", "Max sessions to include", (v) => parseInt(v, 10) || 100)
  .action(async (opts) => {
    const config = loadConfig();
    const workspace = path.resolve(opts.workspace ?? config.workspace);
    const limit = opts.limit ?? 100;
    const metrics = await readSessionMetricsFromDir(workspace, limit);
    console.log(JSON.stringify(metrics, null, 2));
  });

program
  .command("diagnostic-report")
  .description("Phase 12: Generate diagnostic report and self-improvement suggestions")
  .option("-w, --workspace <path>", "Workspace path (default from config)")
  .option("-d, --days <number>", "Report interval in days", (v) => parseInt(v, 10) || 7)
  .action(async (opts) => {
    const config = loadConfig();
    const workspace = path.resolve(opts.workspace ?? config.workspace);
    const days = opts.days ?? config.diagnostic?.intervalDays ?? 7;
    const { report, filePath } = await generateReport(config, { workspace, days });
    const suggestionsPath = await writeSuggestionsFile(workspace, report);
    console.log(JSON.stringify({ report, filePath, suggestionsPath }, null, 2));
  });

program
  .command("health")
  .description("WO-509: Check config, workspace writable, API key set")
  .action(async () => {
    const config = loadConfig();
    const workspace = path.resolve(config.workspace);
    let workspaceWritable = false;
    try {
      await access(workspace, 1 | 2);
      workspaceWritable = true;
    } catch {
      try {
        await mkdir(workspace, { recursive: true });
        workspaceWritable = true;
      } catch {
        // leave false
      }
    }
    const llmReady = isLlmReady(config);
    const ok = workspaceWritable && llmReady;
    console.log(
      JSON.stringify(
        { ok, configLoaded: true, workspaceWritable, llmReady },
        null,
        2
      )
    );
    process.exit(ok ? 0 : 1);
  });

program
  .command("setup")
  .description("配置向导：检查依赖与构建 → 确认 API Key、模型、命令终端策略、是否启动 Gateway")
  .action(async () => {
    await runSetupWizard(process.cwd());
  });

program
  .command("self-check")
  .description("自检运行环境、依赖、构建与配置；可配合 --repair 自动修复")
  .option("--repair", "发现问题时执行修复（npm install、npm run build）")
  .option("--reset-config", "修复时从 rzeclaw.example.json 恢复 rzeclaw.json（与 --repair 同用）")
  .option("--reset-env", "修复时从 .env.example 恢复 .env（与 --repair 同用）")
  .option("-j, --json", "输出 JSON 结果")
  .action(async (opts) => {
    const projectRoot = process.cwd();
    const result = await runSelfCheck(projectRoot);
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log("自检结果:");
      for (const item of result.items) {
        console.log(`  [${item.ok ? "OK" : "FAIL"}] ${item.id}: ${item.message}`);
        if (!item.ok && item.repair) console.log(`      修复建议: ${item.repair}`);
      }
      console.log(result.ok ? "\n全部通过。" : "\n存在异常，可运行 rzeclaw repair 或 rzeclaw self-check --repair 尝试修复。");
    }
    if (opts.repair && !result.ok) {
      const steps = getRepairSteps({
        install: true,
        build: true,
        resetConfig: opts.resetConfig === true,
        resetEnv: opts.resetEnv === true,
      });
      console.log("\n执行修复...");
      for (const step of steps) {
        try {
          console.log(`  [${step.id}] ${step.description}`);
          await step.run();
        } catch (e) {
          console.error(`  [${step.id}] 失败:`, e instanceof Error ? e.message : e);
          process.exit(1);
        }
      }
      console.log("修复完成。可再次运行 rzeclaw self-check 验证。");
    }
    process.exit(result.ok ? 0 : 1);
  });

program
  .command("repair")
  .description("执行修复：npm install、npm run build，可选恢复示例配置")
  .option("--reset-config", "从 rzeclaw.example.json 覆盖恢复 rzeclaw.json")
  .option("--reset-env", "从 .env.example 覆盖恢复 .env")
  .option("--no-install", "跳过 npm install")
  .option("--no-build", "跳过 npm run build")
  .action(async (opts) => {
    const steps = getRepairSteps({
      install: opts.install !== false,
      build: opts.build !== false,
      resetConfig: opts.resetConfig === true,
      resetEnv: opts.resetEnv === true,
    });
    console.log("修复步骤:");
    for (const step of steps) {
      try {
        console.log(`  [${step.id}] ${step.description}`);
        await step.run();
      } catch (e) {
        console.error(`  [${step.id}] 失败:`, e instanceof Error ? e.message : e);
        process.exit(1);
      }
    }
    console.log("修复完成。");
  });

program
  .command("uninstall")
  .description("卸载：移除 node_modules 与 dist；可选移除配置与本地数据（默认均保留）。--all 为全部卸载。")
  .option("--all", "全部卸载：移除软件及全部本地数据与配置（含 .env、rzeclaw.json、工作区及 .rzeclaw 数据）")
  .option("--remove-config", "同时移除 rzeclaw.json / .rzeclaw.json")
  .option("--remove-env", "同时移除 .env")
  .option("--remove-rzeclaw-data", "同时移除工作区内的 .rzeclaw 目录（记忆、快照等）")
  .option("--remove-workspace", "同时移除整个工作区目录（慎用）")
  .option("-y, --yes", "不提示，直接执行")
  .option("-j, --json", "仅输出将执行的操作（不实际删除）")
  .action(async (opts) => {
    const projectRoot = process.cwd();
    const full = opts.all === true;
    const options = {
      removeWorkspace: full || opts.removeWorkspace === true,
      removeConfig: full || opts.removeConfig === true,
      removeEnv: full || opts.removeEnv === true,
      removeRzeclawData: full || opts.removeRzeclawData === true,
      yes: opts.yes === true,
    };
    const result = runUninstall(projectRoot, options);
    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            willRemove: ["node_modules", "dist"].concat(
              options.removeEnv ? [".env"] : [],
              options.removeConfig ? ["rzeclaw.json", ".rzeclaw.json"] : [],
              options.removeRzeclawData ? ["workspace/.rzeclaw"] : [],
              options.removeWorkspace ? ["workspace"] : []
            ),
            kept: result.kept,
            errors: result.errors,
          },
          null,
          2
        )
      );
      return;
    }
    console.log("已移除:", result.removed.length ? result.removed.join(", ") : "无");
    if (result.kept.length) console.log("已保留:", result.kept.join(", "));
    if (result.errors.length) {
      console.error("错误:", result.errors.join("; "));
      process.exit(1);
    }
  });

export async function run(): Promise<void> {
  await program.parseAsync(process.argv);
}
