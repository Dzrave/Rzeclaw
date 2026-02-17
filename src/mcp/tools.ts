/**
 * WO-612: MCP Tools 转为 Agent Tool 形态，命名空间避免与 CORE/Skill 冲突。
 */

import type { ToolDef } from "../tools/types.js";
import type { McpTool } from "./client.js";
import { callMcpTool } from "./client.js";
import type { McpServerEntry } from "../config.js";

const MCP_PREFIX = "mcp_";

/**
 * 为 MCP 工具生成唯一名称：mcp_<serverName>_<toolName>
 */
export function mcpToolName(serverName: string, toolName: string): string {
  const safe = (s: string) => s.replace(/\W/g, "_");
  return `${MCP_PREFIX}${safe(serverName)}_${safe(toolName)}`;
}

/**
 * 解析 mcp_<server>_<tool> 为 { serverName, toolName }，若不是 MCP 前缀则返回 null。
 */
export function parseMcpToolName(name: string): { serverName: string; toolName: string } | null {
  if (!name.startsWith(MCP_PREFIX)) return null;
  const rest = name.slice(MCP_PREFIX.length);
  const i = rest.indexOf("_");
  if (i <= 0) return null;
  return { serverName: rest.slice(0, i), toolName: rest.slice(i + 1) };
}

/**
 * 将单个 MCP Server 的 tools 转为 ToolDef[]，名称带 mcp_<serverName>_ 前缀。
 */
export function mcpToolsToToolDefs(
  server: McpServerEntry,
  tools: McpTool[],
  workspaceRoot: string
): ToolDef[] {
  return tools.map((t) => ({
    name: mcpToolName(server.name, t.name),
    description: t.description ?? `MCP tool: ${t.name}`,
    inputSchema: {
      type: "object" as const,
      properties: (t.inputSchema?.properties as Record<string, { type: string; description?: string }>) ?? {},
      required: t.inputSchema?.required ?? [],
    },
    handler: async (args: Record<string, unknown>) =>
      callMcpTool(server, t.name, args, workspaceRoot),
  }));
}
