import { WebSocketServer } from "ws";
import { runAgentLoop } from "../agent/loop.js";
import { createStore } from "../memory/store-jsonl.js";
import { flushToL1, generateL0Summary } from "../memory/write-pipeline.js";
import { writeSessionSummaryFile } from "../memory/session-summary-file.js";
import { extractTaskHint } from "../memory/task-hint.js";
import { promoteL1ToL2 } from "../memory/l2.js";
import { writePromptSuggestions } from "../evolution/prompt-suggestions.js";
import { archiveCold } from "../memory/cold-archive.js";
import { writeSnapshot, readSnapshot, listSnapshots } from "../session/snapshot.js";
import { CORE_TOOLS, getTool } from "../tools/index.js";
import path from "node:path";
import { access } from "node:fs/promises";
const sessions = new Map();
function getOrCreateSession(sessionId) {
    let s = sessions.get(sessionId);
    if (!s) {
        s = { messages: [] };
        sessions.set(sessionId, s);
    }
    return s;
}
export function createGatewayServer(config, port) {
    const wss = new WebSocketServer({ port });
    wss.on("listening", () => {
        console.log(`[rzeclaw] Gateway ws://127.0.0.1:${port}`);
    });
    wss.on("connection", (ws) => {
        ws.on("message", async (raw) => {
            let msg = {};
            try {
                msg = JSON.parse(raw.toString());
                const id = msg.id ?? "";
                const method = msg.method ?? "";
                const params = msg.params ?? {};
                const send = (result) => {
                    ws.send(JSON.stringify({ id, result }));
                };
                const sendError = (error) => {
                    ws.send(JSON.stringify({ id, error: { message: error } }));
                };
                if (method === "session.getOrCreate") {
                    const sessionId = params.sessionId || "main";
                    const session = getOrCreateSession(sessionId);
                    send({
                        sessionId,
                        messagesCount: session.messages.length,
                        hasGoal: !!session.sessionGoal,
                        hasSummary: !!session.sessionSummary,
                    });
                    return;
                }
                if (method === "session.restore") {
                    const sessionId = params.sessionId || "main";
                    const workspace = path.resolve(config.workspace);
                    const snapshot = await readSnapshot(workspace, sessionId);
                    const session = getOrCreateSession(sessionId);
                    if (snapshot) {
                        session.messages = snapshot.messages;
                        session.sessionGoal = snapshot.sessionGoal;
                        session.sessionSummary = snapshot.sessionSummary;
                        send({ sessionId, restored: true, messagesCount: session.messages.length });
                    }
                    else {
                        send({ sessionId, restored: false, messagesCount: session.messages.length });
                    }
                    return;
                }
                if (method === "session.saveSnapshot") {
                    const sessionId = params.sessionId || "main";
                    const session = getOrCreateSession(sessionId);
                    const workspace = path.resolve(config.workspace);
                    await writeSnapshot(workspace, sessionId, {
                        messages: session.messages,
                        sessionGoal: session.sessionGoal,
                        sessionSummary: session.sessionSummary,
                    });
                    send({ sessionId, saved: true });
                    return;
                }
                if (method === "session.list") {
                    const workspace = path.resolve(params.workspace || config.workspace);
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
                    }
                    catch {
                        try {
                            const { mkdir } = await import("node:fs/promises");
                            await mkdir(workspace, { recursive: true });
                            workspaceWritable = true;
                        }
                        catch {
                            // leave false
                        }
                    }
                    send({
                        ok: true,
                        configLoaded: true,
                        workspaceWritable,
                        apiKeySet: !!process.env[config.apiKeyEnv ?? "ANTHROPIC_API_KEY"]?.trim(),
                    });
                    return;
                }
                if (method === "chat") {
                    const message = params.message;
                    const sessionId = params.sessionId || "main";
                    if (!message || typeof message !== "string") {
                        sendError("Missing message");
                        return;
                    }
                    const session = getOrCreateSession(sessionId);
                    if (!session.sessionGoal)
                        session.sessionGoal = message.trim().slice(0, 200);
                    const workspace = path.resolve(params.workspace || config.workspace);
                    const summaryEveryRounds = config.summaryEveryRounds ?? 0;
                    const rounds = Math.floor(session.messages.length / 2);
                    if (summaryEveryRounds > 0 &&
                        rounds >= summaryEveryRounds &&
                        rounds > 0 &&
                        rounds % summaryEveryRounds === 0) {
                        const newSummary = await generateL0Summary({
                            config,
                            messages: session.messages,
                        });
                        if (newSummary)
                            session.sessionSummary = newSummary;
                    }
                    const { content, messages, citedMemoryIds } = await runAgentLoop({
                        config,
                        userMessage: message,
                        sessionMessages: session.messages,
                        sessionId,
                        sessionGoal: session.sessionGoal,
                        sessionSummary: session.sessionSummary,
                        onText: (chunk) => {
                            try {
                                ws.send(JSON.stringify({ id, stream: "text", chunk }));
                            }
                            catch (_) { }
                        },
                    });
                    session.messages = messages;
                    await writeSnapshot(workspace, sessionId, {
                        messages: session.messages,
                        sessionGoal: session.sessionGoal,
                        sessionSummary: session.sessionSummary,
                    });
                    if (config.memory?.enabled && messages.length >= 2) {
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
                        if (typeof config.memory.coldAfterDays === "number" &&
                            config.memory.coldAfterDays > 0) {
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
                    const name = params.name;
                    const args = params.args ?? {};
                    const workspace = path.resolve(config.workspace);
                    const tool = getTool(name);
                    if (!tool) {
                        sendError(`Unknown tool: ${name}`);
                        return;
                    }
                    try {
                        const result = await tool.handler(args, workspace);
                        send(result.ok ? { content: result.content } : { error: result.error });
                    }
                    catch (e) {
                        sendError(e instanceof Error ? e.message : String(e));
                    }
                    return;
                }
                if (method === "tools.list") {
                    send({
                        tools: CORE_TOOLS.map((t) => ({
                            name: t.name,
                            description: t.description,
                            inputSchema: t.inputSchema,
                        })),
                    });
                    return;
                }
                sendError(`Unknown method: ${method}`);
            }
            catch (e) {
                try {
                    const errMsg = e instanceof Error ? e.message : String(e);
                    ws.send(JSON.stringify({ id: msg.id, error: { message: errMsg } }));
                }
                catch (_) {
                    ws.send(JSON.stringify({ error: { message: String(e) } }));
                }
            }
        });
    });
}
