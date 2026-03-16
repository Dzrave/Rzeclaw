/**
 * Phase 16 WO-1611～1614: 先验扫描（Affordance-Aware）— FSM/黑板、可用技能与 MCP、snapshot_digest、编排
 */

import { createHash } from "node:crypto";
import type { RzeclawConfig } from "../config.js";
import type { SnapshotContext } from "./types.js";
import type { FlowDef } from "../flows/types.js";
import { getMergedTools } from "../tools/merged.js";

/** WO-1611: 抓取 FSM 与黑板；sessionState 为会话级 FSM（如 Idle / Deep_Reasoning / Executing_Task） */
function gatherFsmAndBlackboard(session?: {
  blackboard?: Record<string, string>;
  sessionState?: string;
}): Pick<SnapshotContext, "fsm" | "blackboard"> {
  return {
    fsm: session?.sessionState && typeof session.sessionState === "string" ? session.sessionState : "general",
    blackboard: session?.blackboard && typeof session.blackboard === "object" ? { ...session.blackboard } : undefined,
  };
}

/** 简单相关度得分：消息是否包含 action id 或描述中的词（0 或 1），用于语义排序 */
function relevanceScore(action: { id: string; description?: string }, message: string): number {
  const m = (message ?? "").trim().toLowerCase();
  if (!m) return 0;
  if (m.includes(action.id.toLowerCase())) return 1;
  const desc = (action.description ?? "").toLowerCase();
  const words = desc.replace(/[^\w\u4e00-\u9fff]+/g, " ").split(/\s+/).filter(Boolean);
  for (const w of words) {
    if (w.length >= 2 && m.includes(w)) return 0.5;
  }
  return 0;
}

/** WO-1612: 从流程库与工具列表得到 availableActions；若提供 message 则按与消息的相关度排序后取前 K 个 */
function gatherAvailableActions(
  flowLibrary: Map<string, FlowDef> | null,
  toolNames: string[],
  maxRelevant: number,
  message?: string
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
  if (message && message.trim()) {
    actions.sort((a, b) => relevanceScore(b, message) - relevanceScore(a, message));
  } else {
    actions.sort((a, b) => a.id.localeCompare(b.id));
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
    session?: { blackboard?: Record<string, string>; sessionState?: string };
    flowLibrary?: Map<string, FlowDef> | null;
    toolNames?: string[];
  }
): Promise<SnapshotContext> {
  const { session, flowLibrary = null, toolNames: providedToolNames, message } = options;
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
  const availableActions = gatherAvailableActions(flowLibrary, toolNames, maxRelevant, message);
  const snapshot_digest = availableActions.length > 0 ? computeSnapshotDigest(availableActions) : undefined;

  return {
    fsm,
    blackboard,
    availableActions,
    snapshot_digest,
  };
}
