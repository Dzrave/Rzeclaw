/**
 * WO-605: Skill 类型定义。
 * 技能 = 名称 + 描述 + 参数 schema + 执行入口（本地脚本等）。
 */

export type SkillInputSchema = {
  type: "object";
  properties?: Record<string, { type: string; description?: string }>;
  required?: string[];
};

export type Skill = {
  name: string;
  description: string;
  inputSchema: SkillInputSchema;
  /** 执行入口：本地脚本路径（相对 skill 所在目录或 workspace） */
  scriptPath: string;
  /** 加载时解析的绝对路径，限定在 workspace 内，供执行器使用 */
  scriptResolvedPath?: string;
  /** 可选：解释何时使用、注意事项 */
  usageHint?: string;
};

export function isSkillLike(obj: unknown): obj is Skill {
  if (obj == null || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.name === "string" &&
    typeof o.description === "string" &&
    o.inputSchema != null &&
    typeof o.inputSchema === "object" &&
    (o as { scriptPath?: string }).scriptPath != null
  );
}
