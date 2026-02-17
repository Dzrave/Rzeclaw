/**
 * WO-617: Heartbeat Orient — 加载身份/策略（HEARTBEAT.md 或 checklistPath）。
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RzeclawConfig } from "../config.js";

export type OrientResult = {
  /** 清单/策略文本，供 Check 使用 */
  checklistContent: string;
  /** 可选：AGENTS.md 等身份描述 */
  identityHint?: string;
};

const DEFAULT_CHECKLIST = "HEARTBEAT.md";
const IDENTITY_FILE = "AGENTS.md";

/**
 * 加载 Orient 上下文：checklistPath 或 HEARTBEAT.md，可选 AGENTS.md。
 */
export async function orient(
  config: RzeclawConfig,
  workspaceRoot: string
): Promise<OrientResult> {
  const checklistPath =
    config.heartbeat?.checklistPath ?? DEFAULT_CHECKLIST;
  const path = join(workspaceRoot, checklistPath);
  let checklistContent = "";
  try {
    checklistContent = await readFile(path, "utf-8");
  } catch {
    checklistContent = "";
  }
  let identityHint: string | undefined;
  try {
    identityHint = await readFile(join(workspaceRoot, IDENTITY_FILE), "utf-8");
  } catch {
    // optional
  }
  return { checklistContent, identityHint };
}
