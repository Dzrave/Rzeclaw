/**
 * Phase 6: MCP 客户端 — 连接、拉取 Tools、调用、转为 ToolDef。
 */

export { connectAndListTools, callMcpTool } from "./client.js";
export type { McpTool } from "./client.js";
export { mcpToolName, parseMcpToolName, mcpToolsToToolDefs } from "./tools.js";

import type { ToolDef } from "../tools/types.js";
import type { RzeclawConfig } from "../config.js";
import { connectAndListTools } from "./client.js";
import { mcpToolsToToolDefs } from "./tools.js";

/**
 * 获取所有已配置 MCP Server 的工具（合并为 ToolDef 列表，名称带 mcp_ 前缀）。
 */
export async function getMcpTools(
  config: RzeclawConfig,
  workspaceRoot: string
): Promise<ToolDef[]> {
  const mcp = config.mcp;
  if (!mcp?.enabled || !Array.isArray(mcp.servers) || mcp.servers.length === 0) {
    return [];
  }
  const out: ToolDef[] = [];
  for (const server of mcp.servers) {
    try {
      const tools = await connectAndListTools(server, workspaceRoot);
      out.push(...mcpToolsToToolDefs(server, tools, workspaceRoot));
    } catch {
      // skip failed server
    }
  }
  return out;
}
