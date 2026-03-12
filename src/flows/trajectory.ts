/**
 * Phase 13 WO-BT-012/013: 从成功轨迹生成 FSM 或 BT。输入为 ops 日志中的工具调用序列；写入流程库须经校验（此处提供生成与落盘，完整 CRUD 见 Phase G）。
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { OpLogEntry } from "../observability/op-log.js";
import type { FSMFlowDef, FSMState, FSMTransition, BTFlowDef, BTNode } from "./types.js";

export type TrajectoryStep = { tool: string; args: Record<string, unknown>; result_ok: boolean };

/**
 * 从 OpLogEntry 序列得到工具调用轨迹（仅含 tool、args、result_ok）。
 */
export function opsToTrajectory(entries: OpLogEntry[]): TrajectoryStep[] {
  return entries.map((e) => ({
    tool: e.tool,
    args: e.args,
    result_ok: e.result_ok,
  }));
}

/**
 * WO-BT-012: 从轨迹生成 FSM。每步对应一状态，action 为 tool+args；迁移 success→next、failure→error。
 */
export function trajectoryToFSM(
  flowId: string,
  trajectory: TrajectoryStep[]
): FSMFlowDef {
  const states: FSMState[] = [];
  const transitions: FSMTransition[] = [];
  for (let i = 0; i < trajectory.length; i++) {
    const step = trajectory[i]!;
    const stateId = `step_${i}`;
    states.push({
      id: stateId,
      action: { tool: step.tool, args: step.args },
    });
    transitions.push({ from: stateId, to: "error", on: "failure" });
    if (i === trajectory.length - 1) {
      transitions.push({ from: stateId, to: "done", on: "success" });
    } else {
      transitions.push({ from: stateId, to: `step_${i + 1}`, on: "success" });
    }
  }
  states.push({ id: "done" });
  states.push({ id: "error" });
  return {
    id: flowId,
    version: "1",
    type: "fsm",
    initial: "step_0",
    states,
    transitions,
  };
}

/**
 * WO-BT-013: 从轨迹生成 BT。单一 Sequence，每步为 Action 节点。
 */
export function trajectoryToBT(flowId: string, trajectory: TrajectoryStep[]): BTFlowDef {
  const children: BTNode[] = trajectory.map((step) => ({
    type: "Action",
    tool: step.tool,
    args: step.args,
  }));
  return {
    id: flowId,
    version: "1",
    type: "bt",
    root: { type: "Sequence", children },
  };
}

/**
 * 将 flow 写入 workspace/<libraryPath>/<flowId>.json。目录不存在则创建。
 * 完整校验与 CRUD 见 Phase G createFlow；此处仅落盘供加载器读取。
 */
export async function writeFlowToLibrary(
  workspace: string,
  libraryPath: string,
  flow: FSMFlowDef | BTFlowDef
): Promise<void> {
  const dir = join(workspace, libraryPath);
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${flow.id}.json`);
  await writeFile(file, JSON.stringify(flow, null, 2), "utf-8");
}
