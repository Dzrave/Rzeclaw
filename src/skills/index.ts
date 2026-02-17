/**
 * Phase 6: Skills 模块 — 类型、加载、执行、转为 Tool。
 */

export type { Skill, SkillInputSchema } from "./types.js";
export { loadSkillsFromDir } from "./load.js";
export { runSkillScript } from "./run.js";
export { skillsToToolDefs } from "./tools.js";

import { loadSkillsFromDir } from "./load.js";
import { skillsToToolDefs } from "./tools.js";
import type { RzeclawConfig } from "../config.js";
import type { ToolDef } from "../tools/types.js";

/**
 * 获取当前 workspace 下已加载的 Skill 对应的 ToolDef 列表。
 * 若 config.skills?.enabled 为 false 或未配置，返回空数组。
 */
export async function getSkillTools(
  workspaceRoot: string,
  config: RzeclawConfig
): Promise<ToolDef[]> {
  const skillsConfig = config.skills;
  if (skillsConfig?.enabled !== true) return [];
  const skills = await loadSkillsFromDir(workspaceRoot, skillsConfig.dir);
  return skillsToToolDefs(skills);
}
