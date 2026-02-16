import { Command } from "commander";
import { loadConfig, getApiKey } from "./config.js";
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
import { mkdir, access } from "node:fs/promises";
import path from "node:path";

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
  .action(async (posMessage, opts) => {
    const config = loadConfig();
    const message = opts.message ?? posMessage;
    if (!message || typeof message !== "string") {
      console.error("Provide a message: rzeclaw agent \"your question\"");
      process.exit(2);
    }
    const apiKey = getApiKey(config);
    if (!apiKey) {
      console.error("Set ANTHROPIC_API_KEY or configure apiKeyEnv in config.");
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

    const { content, messages, sessionId: outSessionId } = await runAgentLoop({
      config,
      userMessage: message,
      sessionMessages,
      sessionId,
      sessionGoal,
      onText: (chunk) => process.stdout.write(chunk),
    });
    const finalSessionId = outSessionId;
    if (config.memory?.enabled && messages.length >= 2) {
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
    const apiKeySet = !!getApiKey(config);
    const ok = workspaceWritable && apiKeySet;
    console.log(
      JSON.stringify(
        { ok, configLoaded: true, workspaceWritable, apiKeySet },
        null,
        2
      )
    );
    process.exit(ok ? 0 : 1);
  });

export async function run(): Promise<void> {
  await program.parseAsync(process.argv);
}
