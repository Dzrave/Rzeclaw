/**
 * Phase 13: 占位符解析。{{workspace}}、{{params.xxx}}；递归替换对象中的字符串值。
 */

export type PlaceholderContext = {
  workspace: string;
  params: Record<string, string>;
  /** WO-BT-011: 前序 Action 节点 nodeId → content，供 {{resultOf.<nodeId>}} 引用 */
  resultOf?: Record<string, string>;
  /** WO-BT-022: 会话黑板槽位，供 {{blackboard.<key>}} 引用 */
  blackboard?: Record<string, string>;
};

function replaceInString(s: string, ctx: PlaceholderContext): string {
  let out = s;
  out = out.replace(/\{\{workspace\}\}/g, ctx.workspace);
  for (const [k, v] of Object.entries(ctx.params)) {
    out = out.replace(new RegExp(`\\{\\{params\\.${escapeRegExp(k)}\\}\\}`, "g"), v);
  }
  if (ctx.resultOf) {
    for (const [k, v] of Object.entries(ctx.resultOf)) {
      out = out.replace(new RegExp(`\\{\\{resultOf\\.${escapeRegExp(k)}\\}\\}`, "g"), v);
    }
  }
  if (ctx.blackboard) {
    for (const [k, v] of Object.entries(ctx.blackboard)) {
      out = out.replace(new RegExp(`\\{\\{blackboard\\.${escapeRegExp(k)}\\}\\}`, "g"), v);
    }
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 递归处理 obj：所有字符串值中的 {{workspace}}、{{params.xxx}} 被替换；非字符串不变。
 */
export function resolvePlaceholders(
  obj: unknown,
  ctx: PlaceholderContext
): unknown {
  if (typeof obj === "string") {
    return replaceInString(obj, ctx);
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => resolvePlaceholders(item, ctx));
  }
  if (obj != null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = resolvePlaceholders(v, ctx);
    }
    return result;
  }
  return obj;
}
