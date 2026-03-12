/**
 * Phase 13 WO-BT-026: 拓扑自我迭代。触发后组装上下文 → LLM 输出 EditOp[] → applyEditOps 执行并落盘。
 */

import type { RzeclawConfig } from "../config.js";
import { getLLMClient } from "../llm/index.js";
import { getFlow, applyEditOps } from "./crud.js";
import type { EditOp } from "./crud.js";
import type { ApplyEditOpsResult } from "./crud.js";
import { isBTFlow } from "./types.js";
import type { BTNode } from "./types.js";

const SYSTEM_PROMPT = `You are a behavior tree flow editor. Output only a valid JSON array of edit operations, no other text or markdown.
Each operation must be one of:
- insertNode: { "op": "insertNode", "parentNodeId": "root" or node id, "position": number, "node": { "type": "Action"|"Sequence"|"Selector"|"Fallback", ... } }
- removeNode: { "op": "removeNode", "nodeId": "string" }
- replaceSubtree: { "op": "replaceSubtree", "nodeId": "string", "newSubtree": { single BT node } }
- reorderChildren: { "op": "reorderChildren", "parentNodeId": "string", "order": ["id1","id2",...] }
- wrapWithDecorator: { "op": "wrapWithDecorator", "nodeId": "string", "decoratorType": "retry" }
Use "root" for the root node id. Output only the JSON array.`;

export type RunTopologyIterationParams = {
  config: RzeclawConfig;
  workspace: string;
  libraryPath: string;
  flowId: string;
  /** 可选：近期失败摘要，供 LLM 参考 */
  failureSummary?: string;
  actor?: string;
};

export type RunTopologyIterationResult =
  | { success: true; appliedCount: number }
  | { success: false; error: string; appliedCount?: number };

/**
 * 拓扑自我迭代：取当前 flow 与可选失败摘要 → 调 LLM 生成 EditOp[] → applyEditOps 执行。
 */
export async function runTopologyIteration(
  params: RunTopologyIterationParams
): Promise<RunTopologyIterationResult> {
  const { config, workspace, libraryPath, flowId, failureSummary, actor = "topology_iteration" } = params;
  const flow = await getFlow(workspace, libraryPath, flowId);
  if (!flow) return { success: false, error: "flow not found" };
  if (!isBTFlow(flow)) return { success: false, error: "flow is not BT" };

  const flowJson = JSON.stringify(flow, null, 2);
  let userContent = `Current BT flow (flowId=${flowId}):\n${flowJson}`;
  if (failureSummary) userContent += `\n\nRecent failures or issues:\n${failureSummary}`;
  userContent += "\n\nOutput a JSON array of edit operations to improve or fix this flow.";

  const client = getLLMClient(config);
  const response = await client.createMessage({
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
    max_tokens: 4096,
  });

  const lastBlock = response.content[response.content.length - 1];
  const text =
    lastBlock?.type === "text"
      ? (lastBlock as { text?: string }).text ?? ""
      : response.content.map((c) => (c as { text?: string }).text).filter(Boolean).join("");
  const raw = text.trim();
  let jsonStr = raw;
  const codeMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeMatch) jsonStr = codeMatch[1].trim();
  let ops: unknown[];
  try {
    ops = JSON.parse(jsonStr) as unknown[];
  } catch (e) {
    return { success: false, error: `LLM output is not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!Array.isArray(ops)) return { success: false, error: "LLM output is not a JSON array" };

  const editOps: EditOp[] = [];
  for (let i = 0; i < ops.length; i++) {
    const o = ops[i];
    if (o == null || typeof o !== "object" || typeof (o as { op?: string }).op !== "string") continue;
    const op = o as Record<string, unknown>;
    const opName = op.op as string;
    if (opName === "insertNode") {
      if (
        typeof op.parentNodeId === "string" &&
        typeof op.position === "number" &&
        op.node != null &&
        typeof op.node === "object"
      )
        editOps.push({
          op: "insertNode",
          parentNodeId: op.parentNodeId,
          position: op.position,
          node: op.node as BTNode,
        });
    } else if (opName === "removeNode" && typeof op.nodeId === "string") {
      editOps.push({ op: "removeNode", nodeId: op.nodeId });
    } else if (opName === "replaceSubtree" && typeof op.nodeId === "string" && op.newSubtree != null) {
      editOps.push({
        op: "replaceSubtree",
        nodeId: op.nodeId,
        newSubtree: op.newSubtree as BTNode,
      });
    } else if (opName === "reorderChildren" && typeof op.parentNodeId === "string" && Array.isArray(op.order)) {
      editOps.push({
        op: "reorderChildren",
        parentNodeId: op.parentNodeId,
        order: op.order as string[],
      });
    } else if (opName === "wrapWithDecorator" && typeof op.nodeId === "string" && typeof op.decoratorType === "string") {
      editOps.push({ op: "wrapWithDecorator", nodeId: op.nodeId, decoratorType: op.decoratorType });
    }
  }

  if (editOps.length === 0) return { success: true, appliedCount: 0 };

  const result: ApplyEditOpsResult = await applyEditOps(workspace, libraryPath, flowId, editOps, { actor });
  if (result.success) return { success: true, appliedCount: result.appliedCount };
  return { success: false, error: result.error ?? "applyEditOps failed", appliedCount: result.appliedCount };
}
