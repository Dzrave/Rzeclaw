/**
 * Phase 16 WO-1611～1614: 先验扫描（Affordance-Aware）— FSM/黑板、可用技能与 MCP、snapshot_digest、编排
 */

import { createHash } from "node:crypto";
import type { RzeclawConfig } from "../config.js";
import type { SnapshotContext } from "./types.js";
import type { FlowDef } from "../flows/types.js";
import { getMergedTools } from "../tools/merged.js";

/** WO-1611: 抓取 FSM 与黑板（当前无全局会话 FSM 时用占位） */
function gatherFsmAndBlackboard(session?: {
  blackboard?: Record<string, string>;
}): Pick<SnapshotContext, "fsm" | "blackboard"> {
  return {
    fsm: "general",
    blackboard: session?.blackboard && typeof session.blackboard === "object" ? { ...session.blackboard } : undefined,
  };
}

/** WO-1612: 从流程库与工具列表得到 availableActions，取前 K 个（按 id/name 排序稳定） */
function gatherAvailableActions(
  flowLibrary: Map<string, FlowDef> | null,
  toolNames: string[],
  maxRelevant: number
): { id: string; description?: string }[] {
  const flowIds = flowLibrary ? Array.from(flowLibrary.keys()).sort() : [];
  const actions: { id: string; description?: string }[] = [];
  for (const id of flowIds) {
    actions.push({ id, description: `flow: ${id}` });
  }
  for (const name of toolNames.sort()) {
    if (actions.some((a) => a.id === name)) continue;
    actions.push({ id: name, description: `tool: ${name}` });
  }
  if (maxRelevant > 0 && actions.length > maxRelevant) {
    return actions.slice(0, maxRelevant);
  }
  return actions;
}

/** WO-1613: 对 availableActions 的 id 列表做稳定哈希 */
function computeSnapshotDigest(actions: { id: string }[]): string {
  const ids = actions.map((a) => a.id).sort();
  const payload = ids.join("\n");
  return createHash("sha256").update(payload, "utf8").digest("hex").slice(0, 16);
}

/**
 * WO-1614: 先验扫描编排 — 返回完整 SnapshotContext
 * 若未传 toolNames，则通过 getMergedTools(config, workspace) 获取。
 */
export async function buildSnapshotContext(
  config: RzeclawConfig,
  options: {
    workspace: string;
    message: string;
    session?: { blackboard?: Record<string, string> };
    flowLibrary?: Map<string, FlowDef> | null;
    toolNames?: string[];
  }
): Promise<SnapshotContext> {
  const { session, flowLibrary = null, toolNames: providedToolNames } = options;
  const maxRelevant = config.exploration?.snapshot?.maxRelevantSkills ?? 10;

  let toolNames: string[] = providedToolNames ?? [];
  if (toolNames.length === 0) {
    try {
      const tools = await getMergedTools(config, options.workspace);
      toolNames = tools.map((t) => t.name);
    } catch {
      // 忽略工具加载失败，仅用 flow 列表
    }
  }

  const { fsm, blackboard } = gatherFsmAndBlackboard(session);
  const availableActions = gatherAvailableActions(flowLibrary, toolNames, maxRelevant);
  const snapshot_digest = availableActions.length > 0 ? computeSnapshotDigest(availableActions) : undefined;

  return {
    fsm,
    blackboard,
    availableActions,
    snapshot_digest,
  };
}
