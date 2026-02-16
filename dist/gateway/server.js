import { WebSocketServer } from "ws";
import { runAgentLoop } from "../agent/loop.js";
import { CORE_TOOLS, getTool } from "../tools/index.js";
import path from "node:path";
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
                    send({ sessionId, messagesCount: session.messages.length });
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
                    const { content, messages } = await runAgentLoop({
                        config,
                        userMessage: message,
                        sessionMessages: session.messages,
                        onText: (chunk) => {
                            try {
                                ws.send(JSON.stringify({ id, stream: "text", chunk }));
                            }
                            catch (_) { }
                        },
                    });
                    session.messages = messages;
                    send({ content });
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
