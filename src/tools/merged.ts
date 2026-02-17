/**
 * WO-613: 统一工具列表合并（CORE + Skills + MCP）。
 * WO-IDE-009: 当 ideOperation.uiAutomation 且 Windows 时追加 L2 工具（ui_describe / ui_act / ui_focus）。
 */

import type { ToolDef } from "./types.js";
import { CORE_TOOLS } from "./index.js";
import { getSkillTools } from "../skills/index.js";
import { getMcpTools } from "../mcp/index.js";
import { getIdeOperationTools } from "./ide-ui.js";
import { createReplayOpsTool } from "./replay-ops.js";
import type { RzeclawConfig } from "../config.js";

/**
 * 返回合并后的工具列表：CORE_TOOLS + Skills + MCP + L2 IDE UI（若启用）+ replay_ops（WO-IDE-014）。
 * 供 runAgentLoop 与 Gateway 使用。
 */
export async function getMergedTools(
  config: RzeclawConfig,
  workspaceRoot: string
): Promise<ToolDef[]> {
  const [skillTools, mcpTools] = await Promise.all([
    getSkillTools(workspaceRoot, config),
    getMcpTools(config, workspaceRoot),
  ]);
  const ideTools = getIdeOperationTools(config);
  const baseTools: ToolDef[] = [...CORE_TOOLS, ...skillTools, ...mcpTools, ...ideTools];
  const replayTool = createReplayOpsTool(baseTools);
  return [...baseTools, replayTool];
}
