/**
 * Phase 13 WO-BT-005/008/009/011: BT 引擎。Sequence/Selector/Fallback + Action；Condition；FSM 内嵌；resultOf 占位符。
 */

import type { BTFlowDef, BTNode } from "./types.js";
import { isBTFlow, isFSMFlow } from "./types.js";
import type { FlowRunToolContext } from "./run-tool.js";
import { runToolForFlow } from "./run-tool.js";
import { runFSM } from "./engine-fsm.js";
import { evaluateCondition } from "./condition.js";

export type BTRunResult = { content: string; success: boolean };

async function runBTNode(
  node: BTNode,
  ctx: FlowRunToolContext,
  acc: string[]
): Promise<{ success: boolean }> {
  switch (node.type) {
    case "Sequence": {
      for (const child of node.children) {
        const r = await runBTNode(child, ctx, acc);
        if (!r.success) return { success: false };
      }
      return { success: true };
    }
    case "Selector":
    case "Fallback": {
      const children = node.children;
      for (let i = 0; i < children.length; i++) {
        const child = children[i]!;
        const isLast = i === children.length - 1;
        if (isLast && child.type === "LLM") {
          if (!ctx.runLLMNode || !ctx.userMessage) {
            acc.push("Error: LLM node requires runLLMNode and userMessage");
            return { success: false };
          }
          const res = await ctx.runLLMNode({
            message: ctx.userMessage,
            contextSummary: acc.length > 0 ? acc.join("\n") : undefined,
          });
          acc.push(res.content);
          return { success: res.success };
        }
        const r = await runBTNode(child, ctx, acc);
        if (r.success) return { success: true };
      }
      return { success: false };
    }
    case "Action": {
      const result = await runToolForFlow(node.tool, node.args, ctx);
      if (node.id && ctx.placeholderContext.resultOf) {
        ctx.placeholderContext.resultOf[node.id] = result.ok ? result.content : (result.error ?? "");
      }
      acc.push(result.ok ? result.content : `Error: ${result.error}`);
      return { success: result.ok };
    }
    case "Condition": {
      const ok = evaluateCondition(
        node,
        ctx.workspace,
        ctx.placeholderContext.params
      );
      return { success: ok };
    }
    case "FSM": {
      const lib = ctx.flowLibrary;
      if (!lib) {
        acc.push("Error: FSM node requires flowLibrary");
        return { success: false };
      }
      const sub = lib.get(node.fsmId);
      if (!sub || !isFSMFlow(sub)) {
        acc.push(`Error: FSM flow not found or not FSM: ${node.fsmId}`);
        return { success: false };
      }
      const res = await runFSM(sub, ctx);
      acc.push(res.content);
      return { success: res.success };
    }
    default:
      return { success: false };
  }
}

export async function runBT(
  flow: BTFlowDef,
  ctx: FlowRunToolContext
): Promise<BTRunResult> {
  const parts: string[] = [];
  if (!ctx.placeholderContext.resultOf) {
    ctx.placeholderContext.resultOf = {};
  }
  const ok = (await runBTNode(flow.root, ctx, parts)).success;
  return {
    content: parts.join("\n").trim() || (ok ? "Done." : "Flow failed."),
    success: ok,
  };
}
