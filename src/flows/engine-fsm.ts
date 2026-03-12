/**
 * Phase 13 WO-BT-004/010: FSM 引擎。从 initial 执行 action 序列；action 可为工具调用或 runFlow（内嵌 BT）。
 */

import type { FSMFlowDef } from "./types.js";
import { isRunFlowAction } from "./types.js";
import type { FlowRunToolContext } from "./run-tool.js";
import { runToolForFlow } from "./run-tool.js";

export type FSMRunResult = { content: string; success: boolean };

function paramsToStringRecord(params: Record<string, unknown> | undefined): Record<string, string> {
  if (!params || typeof params !== "object") return {};
  return Object.fromEntries(
    Object.entries(params).map(([k, v]) => [k, v != null ? String(v) : ""])
  );
}

export async function runFSM(
  flow: FSMFlowDef,
  ctx: FlowRunToolContext
): Promise<FSMRunResult> {
  const parts: string[] = [];
  let current = flow.initial;
  const stateMap = new Map(flow.states.map((s) => [s.id, s]));

  for (let step = 0; step < 100; step++) {
    const state = stateMap.get(current);
    if (!state) {
      parts.push(`[FSM] Unknown state: ${current}`);
      return { content: parts.join("\n"), success: false };
    }

    if (!state.action) {
      parts.push(`[FSM] Reached terminal state: ${current}`);
      return {
        content: parts.join("\n"),
        success: current.toLowerCase() !== "error",
      };
    }

    let outcome: "success" | "failure";
    let line: string;

    if (isRunFlowAction(state.action)) {
      if (!ctx.runSubFlow) {
        parts.push(`[FSM] runFlow requires runSubFlow: ${state.action.runFlow}`);
        return { content: parts.join("\n"), success: false };
      }
      const subParams = paramsToStringRecord(state.action.params);
      const res = await ctx.runSubFlow(state.action.runFlow, subParams);
      outcome = res.success ? "success" : "failure";
      line = res.content;
    } else {
      const result = await runToolForFlow(state.action.tool, state.action.args, ctx);
      outcome = result.ok ? "success" : "failure";
      line = result.ok ? result.content : `Error: ${result.error}`;
    }
    parts.push(`[${current}] ${line}`);

    const transition = flow.transitions.find((t) => t.from === current && t.on === outcome);
    if (!transition) {
      parts.push(`[FSM] No transition from ${current} on ${outcome}`);
      return {
        content: parts.join("\n"),
        success: false,
      };
    }
    current = transition.to;
  }

  parts.push("[FSM] Max steps reached");
  return { content: parts.join("\n"), success: false };
}
