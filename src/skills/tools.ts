/**
 * WO-608: Skill 转为 Agent 可用的 ToolDef 形态。
 */

import type { ToolDef } from "../tools/types.js";
import type { Skill } from "./types.js";
import { runSkillScript } from "./run.js";

/**
 * 将已加载的 Skill[] 转为 ToolDef[]，handler 委托给 Skill 执行器。
 */
export function skillsToToolDefs(skills: Skill[]): ToolDef[] {
  return skills.map((skill) => ({
    name: skill.name,
    description: skill.description,
    inputSchema: {
      type: "object" as const,
      properties: skill.inputSchema.properties ?? {},
      required: skill.inputSchema.required ?? [],
    },
    usageHint: skill.usageHint,
    handler: async (args: Record<string, unknown>, cwd: string) =>
      runSkillScript(
        skill.scriptPath,
        args,
        cwd,
        skill.scriptResolvedPath
      ),
  }));
}
