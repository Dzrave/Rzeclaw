/**
 * Phase 13 WO-BT-008: Condition 节点求值。fileExists(path)、env(KEY)[==value]；不调用工具、不消耗 token。
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ConditionNode } from "./types.js";
import type { PlaceholderContext } from "./placeholders.js";
import { resolvePlaceholders } from "./placeholders.js";

/**
 * 求值单个 Condition 节点；path/key/value 支持 {{workspace}}、{{params.xxx}}。
 */
export function evaluateCondition(
  node: ConditionNode,
  workspace: string,
  params: Record<string, string>
): boolean {
  const ctx: PlaceholderContext = { workspace, params };
  if (node.predicate === "fileExists") {
    const pathResolved = resolvePlaceholders(node.path, ctx) as string;
    const full = pathResolved.startsWith(workspace) ? pathResolved : join(workspace, pathResolved);
    return existsSync(full);
  }
  if (node.predicate === "env") {
    const key = (resolvePlaceholders(node.key, ctx) as string) || "";
    const val = process.env[key];
    if (node.value === undefined) return val != null && val !== "";
    const expected = resolvePlaceholders(node.value, ctx) as string;
    return val === expected;
  }
  return false;
}
