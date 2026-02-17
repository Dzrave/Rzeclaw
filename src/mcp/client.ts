/**
 * WO-610/611: MCP 客户端连接、list_tools、call_tool。
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { McpServerEntry } from "../config.js";
import type { ToolResult } from "../tools/types.js";

export type McpTool = {
  name: string;
  description?: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, object>;
    required?: string[];
  };
};

type McpClientState = {
  client: Client;
  transport: StdioClientTransport;
  tools: McpTool[];
};

const clientsByServer = new Map<string, McpClientState>();

/**
 * 连接并拉取工具列表；已连接则复用并返回缓存的 tools。
 */
export async function connectAndListTools(
  server: McpServerEntry,
  workspaceRoot: string
): Promise<McpTool[]> {
  const key = server.name;
  let state = clientsByServer.get(key);
  if (!state) {
    const transport = new StdioClientTransport({
      command: server.command,
      args: server.args ?? [],
      cwd: workspaceRoot,
    });
    const client = new Client(
      { name: "rzeclaw", version: "0.1.0" },
      { capabilities: {} }
    );
    await client.connect(transport);
    const list = await client.listTools();
    const tools = (list.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: {
        type: "object" as const,
        properties: t.inputSchema?.properties ?? {},
        required: t.inputSchema?.required ?? [],
      },
    }));
    state = { client, transport, tools };
    clientsByServer.set(key, state);
  }
  return state.tools;
}

/**
 * 调用 MCP 工具；若该 server 未连接则先 connectAndListTools。
 */
export async function callMcpTool(
  server: McpServerEntry,
  toolName: string,
  args: Record<string, unknown>,
  workspaceRoot: string
): Promise<ToolResult> {
  let state = clientsByServer.get(server.name);
  if (!state) {
    await connectAndListTools(server, workspaceRoot);
    state = clientsByServer.get(server.name)!;
  }
  try {
    const result = await state.client.callTool({
      name: toolName,
      arguments: args ?? {},
    });
    const content = (result as { content?: Array<{ type: string; text?: string }> }).content;
    const textPart = content?.find((c) => c.type === "text");
    const text = textPart && "text" in textPart ? textPart.text : JSON.stringify(result);
    return { ok: true, content: text ?? "" };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      code: "MCP_ERROR",
      suggestion: "Check MCP server logs and arguments.",
    };
  }
}
