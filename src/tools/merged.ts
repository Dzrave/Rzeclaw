/**
 * WO-613: 统一工具列表合并（CORE + Skills + MCP）。
 * WO-IDE-009: 当 ideOperation.uiAutomation 且 Windows 时追加 L2 工具（ui_describe / ui_act / ui_focus）。
 * WO-BT-024: 当 evolution.insertTree.enabled 时追加 evolved_skills 目录下的进化工具。
 */

import type { ToolDef } from "./types.js";
import { CORE_TOOLS } from "./index.js";
import { getSkillTools } from "../skills/index.js";
import { loadSkillsFromDir } from "../skills/load.js";
import { skillsToToolDefs } from "../skills/tools.js";
import { getMcpTools } from "../mcp/index.js";
import { getIdeOperationTools } from "./ide-ui.js";
import { createReplayOpsTool } from "./replay-ops.js";
import { getEvolvedSkillsDir } from "../flows/evolution-insert-tree.js";
import type { RzeclawConfig } from "../config.js";

/**
 * 返回合并后的工具列表：CORE_TOOLS + Skills + evolved_skills（若启用）+ MCP + L2 IDE UI（若启用）+ replay_ops（WO-IDE-014）。
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
  let evolvedTools: ToolDef[] = [];
  if (config.evolution?.insertTree?.enabled === true) {
    const evolvedDir = getEvolvedSkillsDir(config);
    const evolvedSkills = await loadSkillsFromDir(workspaceRoot, evolvedDir);
    evolvedTools = skillsToToolDefs(evolvedSkills);
  }
  const ideTools = getIdeOperationTools(config);
  const baseTools: ToolDef[] = [...CORE_TOOLS, ...skillTools, ...evolvedTools, ...mcpTools, ...ideTools];
  const replayTool = createReplayOpsTool(baseTools);
  return [...baseTools, replayTool];
}
