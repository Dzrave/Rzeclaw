import { WebSocketServer, type WebSocket } from "ws";
import { runAgentLoop } from "../agent/loop.js";
import type { RzeclawConfig } from "../config.js";
import { CORE_TOOLS, getTool } from "../tools/index.js";
import path from "node:path";

type Session = { messages: { role: "user" | "assistant"; content: string }[] };

const sessions = new Map<string, Session>();

function getOrCreateSession(sessionId: string): Session {
  let s = sessions.get(sessionId);
  if (!s) {
    s = { messages: [] };
    sessions.set(sessionId, s);
  }
  return s;
}

export function createGatewayServer(config: RzeclawConfig, port: number): void {
  const wss = new WebSocketServer({ port });

  wss.on("listening", () => {
    console.log(`[rzeclaw] Gateway ws://127.0.0.1:${port}`);
  });

  wss.on("connection", (ws: WebSocket) => {
    ws.on("message", async (raw: Buffer | ArrayBuffer | Buffer[]) => {
      let msg: {
        id?: string;
        method?: string;
        params?: { message?: string; sessionId?: string; name?: string; args?: Record<string, unknown> };
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

        if (method === "session.getOrCreate") {
          const sessionId = (params.sessionId as string) || "main";
          const session = getOrCreateSession(sessionId);
          send({ sessionId, messagesCount: session.messages.length });
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
          const { content, messages } = await runAgentLoop({
            config,
            userMessage: message,
            sessionMessages: session.messages,
            onText: (chunk) => {
              try {
                ws.send(JSON.stringify({ id, stream: "text", chunk }));
              } catch (_) {}
            },
          });
          session.messages = messages;
          send({ content });
          return;
        }

        if (method === "tools.call") {
          const name = params.name as string;
          const args = (params.args as Record<string, unknown>) ?? {};
          const workspace = path.resolve(config.workspace);
          const tool = getTool(name);
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
