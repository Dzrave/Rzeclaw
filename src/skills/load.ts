/**
 * WO-606: 本地 Skill 目录加载。
 * 从 workspace/.rzeclaw/skills/ 或配置路径加载 *.json，白名单仅此目录。
 */

import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Skill } from "./types.js";
import { isSkillLike } from "./types.js";

const DEFAULT_SKILLS_DIR = ".rzeclaw/skills";

/**
 * 从目录加载所有 .json 技能定义；非 JSON 或格式错误则跳过该文件。
 */
export async function loadSkillsFromDir(
  workspaceRoot: string,
  skillsDirRelative?: string
): Promise<Skill[]> {
  const dir = join(
    workspaceRoot,
    skillsDirRelative ?? DEFAULT_SKILLS_DIR
  );
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const out: Skill[] = [];
  const workspaceAbs = resolve(workspaceRoot);
  for (const name of entries) {
    if (!name.endsWith(".json")) continue;
    const jsonPath = join(dir, name);
    try {
      const raw = await readFile(jsonPath, "utf-8");
      const data = JSON.parse(raw) as unknown;
      const skill = normalizeSkill(data, jsonPath, workspaceAbs);
      if (skill) out.push(skill);
    } catch {
      // skip invalid file
    }
  }
  return out;
}

function normalizeSkill(
  data: unknown,
  jsonPath: string,
  workspaceRoot: string
): Skill | null {
  if (!isSkillLike(data)) return null;
  const s = data as Skill;
  const skillDir = resolve(jsonPath, "..");
  const scriptFull = resolve(skillDir, s.scriptPath.trim());
  const workspaceAbs = resolve(workspaceRoot);
  if (!scriptFull.startsWith(workspaceAbs)) return null;
  return {
    name: s.name.trim(),
    description: (s.description ?? "").trim(),
    inputSchema: {
      type: "object",
      properties: s.inputSchema?.properties ?? {},
      required: s.inputSchema?.required ?? [],
    },
    scriptPath: s.scriptPath.trim(),
    scriptResolvedPath: scriptFull,
    usageHint: s.usageHint?.trim(),
  };
}
