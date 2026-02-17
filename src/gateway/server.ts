import { WebSocketServer, type WebSocket } from "ws";
import { runAgentLoop } from "../agent/loop.js";
import type { RzeclawConfig } from "../config.js";
import { createStore } from "../memory/store-jsonl.js";
import { flushToL1, generateL0Summary } from "../memory/write-pipeline.js";
import { writeSessionSummaryFile } from "../memory/session-summary-file.js";
import { extractTaskHint } from "../memory/task-hint.js";
import { promoteL1ToL2 } from "../memory/l2.js";
import { writePromptSuggestions } from "../evolution/prompt-suggestions.js";
import { archiveCold } from "../memory/cold-archive.js";
import { writeSnapshot, readSnapshot, listSnapshots } from "../session/snapshot.js";
import { readCanvas, updateCanvas } from "../canvas/index.js";
import type { CurrentPlan } from "../canvas/types.js";
import { getMergedTools } from "../tools/merged.js";
import { runHeartbeatTick } from "../heartbeat/index.js";
import { runProactiveInference } from "../proactive/index.js";
import { getGatewayApiKey, isLlmReady } from "../config.js";
import { ingestPaths } from "../knowledge/index.js";
import { generateReport, writeSuggestionsFile } from "../diagnostic/index.js";
import path from "node:path";
import { access } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** Phase 8: 每连接认证状态 */
const authenticatedSockets = new WeakMap<WebSocket, boolean>();

/** Phase 10 WO-1002: sessionType 为 dev | knowledge | pm | swarm_manager | general */
/** WO-SEC-006: 隐私会话标记，为 true 时不写 L1、不持久化快照 */
type Session = {
  messages: { role: "user" | "assistant"; content: string }[];
  sessionGoal?: string;
  sessionSummary?: string;
  sessionType?: string;
  sessionFlags?: { privacy?: boolean };
};

const sessions = new Map<string, Session>();

function getOrCreateSession(sessionId: string, sessionType?: string): Session {
  let s = sessions.get(sessionId);
  if (!s) {
    s = { messages: [], ...(sessionType ? { sessionType } : {}) };
    sessions.set(sessionId, s);
  } else if (sessionType !== undefined) {
    s.sessionType = sessionType;
  }
  return s;
}

export function createGatewayServer(config: RzeclawConfig, port: number): void {
  const host = config.gateway?.host ?? "127.0.0.1";
  const wss = new WebSocketServer({ host, port });

  let bonjourInstance: { publish: (opts: { name: string; type: string; port: number }) => unknown; destroy?: () => void } | null = null;

  wss.on("listening", () => {
    console.log(`[rzeclaw] Gateway ws://${host}:${port}`);
    const intervalMinutes = config.heartbeat?.intervalMinutes ?? 0;
    if (intervalMinutes > 0) {
      const workspace = path.resolve(config.workspace);
      const run = () => {
        runHeartbeatTick(config, workspace).catch((e) =>
          console.error("[rzeclaw] Heartbeat tick error:", e)
        );
      };
      setInterval(run, intervalMinutes * 60 * 1000);
    }
    if (config.gateway?.discovery?.enabled === true) {
      try {
        const Bonjour = require("bonjour") as () => { publish: (opts: { name: string; type: string; port: number }) => unknown; destroy?: () => void };
        bonjourInstance = Bonjour();
        bonjourInstance.publish({ name: "Rzeclaw", type: "rzeclaw", port });
        console.log("[rzeclaw] mDNS discovery: _rzeclaw._tcp advertised");
      } catch (e) {
        console.error("[rzeclaw] mDNS discovery failed:", e);
      }
    }
    if (config.knowledge?.ingestOnStart === true && Array.isArray(config.knowledge.ingestPaths) && config.knowledge.ingestPaths.length > 0) {
      const workspace = path.resolve(config.workspace);
      ingestPaths(workspace, config.knowledge.ingestPaths, { workspaceId: config.memory?.workspaceId }).then((r) => {
        console.log(`[rzeclaw] Knowledge ingest on start: ok=${r.ok} failed=${r.failed}`);
      }).catch((e) => console.error("[rzeclaw] Knowledge ingest on start error:", e));
    }
    const scheduleDays = config.diagnostic?.intervalDaysSchedule ?? 0;
    if (scheduleDays > 0) {
      const intervalMs = scheduleDays * 24 * 60 * 60 * 1000;
      setInterval(() => {
        const workspace = path.resolve(config.workspace);
        (async () => {
          const { report, filePath } = await generateReport(config, { workspace, days: scheduleDays });
          await writeSuggestionsFile(workspace, report);
          console.log("[rzeclaw] Diagnostic report:", filePath);
        })().catch((e) => console.error("[rzeclaw] Diagnostic report error:", e));
      }, intervalMs);
    }
  });

  wss.on("connection", (ws: WebSocket) => {
    ws.on("message", async (raw: Buffer | ArrayBuffer | Buffer[]) => {
      let msg: {
        id?: string;
        method?: string;
        params?: {
          message?: string;
          sessionId?: string;
          name?: string;
          args?: Record<string, unknown>;
          workspace?: string;
          limit?: number;
          /** canvas.update */
          goal?: string;
          steps?: CurrentPlan["steps"];
          currentStepIndex?: number;
          artifacts?: CurrentPlan["artifacts"];
          trigger?: "timer" | "event" | "on_open" | "explicit";
          apiKey?: string;
          /** Phase 10: 会话类型 */
          sessionType?: string;
          /** Phase 10: 蜂群管理时的团队 id */
          teamId?: string;
          /** Phase 11: knowledge.ingest 指定路径 */
          paths?: string[];
          /** Phase 12: diagnostic.report 时间范围（天） */
          days?: number;
        };
      } = {};
      try {
        msg = JSON.parse(raw.toString()) as typeof msg;
        const id = msg.id ?? "";
        const method = msg.method ?? "";
        const params = msg.params ?? {};

        const send = (result: unknown) => {
          ws.send(JSON.stringify({ id, result }));
        };
        const sendError = (error: string) => {
          ws.send(JSON.stringify({ id, error: { message: error } }));
        };

        const authEnabled = config.gateway?.auth?.enabled === true;
        const isAuthenticated = authenticatedSockets.get(ws) === true;
        if (authEnabled && !isAuthenticated) {
          const providedKey = (params as { apiKey?: string }).apiKey;
          const expectedKey = getGatewayApiKey(config);
          if (!expectedKey || typeof providedKey !== "string" || providedKey !== expectedKey) {
            sendError("Unauthorized: invalid or missing apiKey. Set gateway.auth.apiKeyEnv and provide apiKey in params.");
            ws.close();
            return;
          }
          authenticatedSockets.set(ws, true);
        }

        if (method === "session.getOrCreate") {
          const sessionId = (params.sessionId as string) || "main";
          const sessionType = typeof params.sessionType === "string" ? params.sessionType : undefined;
          const session = getOrCreateSession(sessionId, sessionType);
          send({
            sessionId,
            messagesCount: session.messages.length,
            hasGoal: !!session.sessionGoal,
            hasSummary: !!session.sessionSummary,
            sessionType: session.sessionType,
          });
          return;
        }

        if (method === "session.restore") {
          const sessionId = (params.sessionId as string) || "main";
          const workspace = path.resolve(config.workspace);
          const snapshot = await readSnapshot(workspace, sessionId);
          const session = getOrCreateSession(sessionId);
          if (snapshot) {
            session.messages = snapshot.messages;
            session.sessionGoal = snapshot.sessionGoal;
            session.sessionSummary = snapshot.sessionSummary;
            if (snapshot.sessionType != null) session.sessionType = snapshot.sessionType;
            send({ sessionId, restored: true, messagesCount: session.messages.length, sessionType: session.sessionType });
          } else {
            send({ sessionId, restored: false, messagesCount: session.messages.length, sessionType: session.sessionType });
          }
          return;
        }

        if (method === "session.saveSnapshot") {
          const sessionId = (params.sessionId as string) || "main";
          const session = getOrCreateSession(sessionId);
          const workspace = path.resolve(config.workspace);
          if (session.sessionFlags?.privacy) {
            send({ sessionId, saved: false, reason: "privacy" });
            return;
          }
          await writeSnapshot(workspace, sessionId, {
            messages: session.messages,
            sessionGoal: session.sessionGoal,
            sessionSummary: session.sessionSummary,
            sessionType: session.sessionType,
          });
          send({ sessionId, saved: true });
          return;
        }

        if (method === "session.list") {
          const workspace = path.resolve((params.workspace as string) || config.workspace);
          const limit = typeof params.limit === "number" ? params.limit : 50;
          const list = await listSnapshots(workspace, limit);
          send({ sessions: list });
          return;
        }

        if (method === "health") {
          const workspace = path.resolve(config.workspace);
          let workspaceWritable = false;
          try {
            await access(workspace, 1 | 2);
            workspaceWritable = true;
          } catch {
            try {
              const { mkdir } = await import("node:fs/promises");
              await mkdir(workspace, { recursive: true });
              workspaceWritable = true;
            } catch {
              // leave false
            }
          }
          send({
            ok: true,
            configLoaded: true,
            workspaceWritable,
            llmReady: isLlmReady(config),
          });
          return;
        }

        if (method === "chat") {
          const message = params.message as string;
          const sessionId = (params.sessionId as string) || "main";
          if (!message || typeof message !== "string") {
            sendError("Missing message");
            return;
          }
          const session = getOrCreateSession(sessionId);
          if (typeof (params as { privacy?: boolean }).privacy === "boolean") {
            session.sessionFlags = { ...session.sessionFlags, privacy: (params as { privacy?: boolean }).privacy };
          }
          if (!session.sessionGoal) session.sessionGoal = message.trim().slice(0, 200);
          const workspace = path.resolve(
            (params.workspace as string) || config.workspace
          );
          const summaryEveryRounds = config.summaryEveryRounds ?? 0;
          const rounds = Math.floor(session.messages.length / 2);
          if (
            summaryEveryRounds > 0 &&
            rounds >= summaryEveryRounds &&
            rounds > 0 &&
            rounds % summaryEveryRounds === 0
          ) {
            const newSummary = await generateL0Summary({
              config,
              messages: session.messages,
            });
            if (newSummary) session.sessionSummary = newSummary;
          }
          const { content, messages, citedMemoryIds } = await runAgentLoop({
            config: { ...config, workspace },
            userMessage: message,
            sessionMessages: session.messages,
            sessionId,
            sessionGoal: session.sessionGoal,
            sessionSummary: session.sessionSummary,
            sessionType: session.sessionType,
            teamId: typeof params.teamId === "string" ? params.teamId : undefined,
            sessionFlags: session.sessionFlags,
            onText: (chunk) => {
              try {
                ws.send(JSON.stringify({ id, stream: "text", chunk }));
              } catch (_) {}
            },
          });
          session.messages = messages;
          if (!session.sessionFlags?.privacy) {
            await writeSnapshot(workspace, sessionId, {
              messages: session.messages,
              sessionGoal: session.sessionGoal,
              sessionSummary: session.sessionSummary,
              sessionType: session.sessionType,
            });
          }
          if (config.memory?.enabled && messages.length >= 2 && !session.sessionFlags?.privacy) {
            const store = createStore(workspace, config.memory.workspaceId);
            const { summary, factCount } = await flushToL1({
              config,
              sessionId,
              messages,
              store,
              workspaceId: config.memory.workspaceId ?? workspace,
              taskHint: extractTaskHint(message),
            });
            await writeSessionSummaryFile({
              workspaceDir: workspace,
              sessionId,
              summary,
              factCount,
            });
            const workspaceId = config.memory.workspaceId ?? workspace;
            await promoteL1ToL2(store, {
              workspace_id: workspaceId,
              created_after: new Date(Date.now() - 120_000).toISOString(),
              limit: 50,
            });
            if (
              typeof config.memory.coldAfterDays === "number" &&
              config.memory.coldAfterDays > 0
            ) {
              await archiveCold(workspace, config.memory.workspaceId, config.memory.coldAfterDays);
            }
            await writePromptSuggestions({
              config,
              workspaceDir: workspace,
              sessionId,
              summary,
            });
          }
          send({
            content,
            ...(citedMemoryIds && citedMemoryIds.length > 0 ? { citedMemoryIds } : {}),
          });
          return;
        }

        if (method === "tools.call") {
          const name = params.name as string;
          const args = (params.args as Record<string, unknown>) ?? {};
          const workspace = path.resolve(config.workspace);
          const merged = await getMergedTools(config, workspace);
          const tool = merged.find((t) => t.name === name);
          if (!tool) {
            sendError(`Unknown tool: ${name}`);
            return;
          }
          try {
            const result = await tool.handler(args, workspace);
            send(result.ok ? { content: result.content } : { error: result.error });
          } catch (e: unknown) {
            sendError(e instanceof Error ? e.message : String(e));
          }
          return;
        }

        if (method === "tools.list") {
          const workspace = path.resolve(config.workspace);
          const merged = await getMergedTools(config, workspace);
          send({
            tools: merged.map((t) => ({
              name: t.name,
              description: t.description,
              inputSchema: t.inputSchema,
            })),
          });
          return;
        }

        if (method === "canvas.get") {
          const workspace = path.resolve((params.workspace as string) || config.workspace);
          const canvas = await readCanvas(workspace);
          send({ canvas });
          return;
        }

        if (method === "proactive.suggest") {
          const workspace = path.resolve((params.workspace as string) || config.workspace);
          const trigger = (params.trigger as "timer" | "event" | "on_open" | "explicit") || "explicit";
          try {
            const result = await runProactiveInference(config, { trigger, workspaceRoot: workspace });
            send(result);
          } catch (e: unknown) {
            sendError(e instanceof Error ? e.message : String(e));
          }
          return;
        }

        if (method === "heartbeat.tick") {
          const workspace = path.resolve((params.workspace as string) || config.workspace);
          try {
            const result = await runHeartbeatTick(config, workspace);
            send(result);
          } catch (e: unknown) {
            sendError(e instanceof Error ? e.message : String(e));
          }
          return;
        }

        if (method === "canvas.update") {
          const workspace = path.resolve((params.workspace as string) || config.workspace);
          const partial: Partial<CurrentPlan> = {};
          if (params.goal !== undefined) partial.goal = params.goal as string;
          if (params.steps !== undefined) partial.steps = params.steps as CurrentPlan["steps"];
          if (params.currentStepIndex !== undefined) partial.currentStepIndex = params.currentStepIndex as number;
          if (params.artifacts !== undefined) partial.artifacts = params.artifacts as CurrentPlan["artifacts"];
          const canvas = await updateCanvas(workspace, partial);
          send({ canvas });
          return;
        }

        if (method === "swarm.getTeams") {
          send({
            teams: config.swarm?.teams ?? [],
            defaultTeamId: config.swarm?.defaultTeamId,
          });
          return;
        }

        if (method === "knowledge.ingest") {
          const workspace = path.resolve((params.workspace as string) || config.workspace);
          const paths = Array.isArray(params.paths) && params.paths.length > 0
            ? (params.paths as string[]).filter((p): p is string => typeof p === "string")
            : (config.knowledge?.ingestPaths ?? []);
          try {
            const result = await ingestPaths(workspace, paths, {
              workspaceId: config.memory?.workspaceId,
            });
            send(result);
          } catch (e: unknown) {
            sendError(e instanceof Error ? e.message : String(e));
          }
          return;
        }

        if (method === "diagnostic.report") {
          const workspace = path.resolve((params.workspace as string) || config.workspace);
          const days = typeof params.days === "number" && params.days > 0 ? params.days : undefined;
          try {
            const { report, filePath } = await generateReport(config, { workspace, days });
            const suggestionsPath = await writeSuggestionsFile(workspace, report);
            send({ report, filePath, suggestionsPath });
          } catch (e: unknown) {
            sendError(e instanceof Error ? e.message : String(e));
          }
          return;
        }

        sendError(`Unknown method: ${method}`);
      } catch (e: unknown) {
        try {
          const errMsg = e instanceof Error ? e.message : String(e);
          ws.send(JSON.stringify({ id: msg.id, error: { message: errMsg } }));
        } catch (_) {
          ws.send(JSON.stringify({ error: { message: String(e) } }));
        }
      }
    });
  });
}
