/**
 * WO-616: Heartbeat 单次 tick — Orient → Check → Act → Record。
 * Phase 9: 开头同步画布到任务；Check 可选 LLM；Act 可选仅写 pending。
 */

import type { RzeclawConfig } from "../config.js";
import { syncCanvasToTasks } from "../proactive/canvas-sync.js";
import { orient } from "./orient.js";
import { check, checkWithLLM } from "./check.js";
import { act } from "./act.js";
import { record } from "./record.js";

/**
 * 执行一次 Heartbeat 循环。
 */
export async function runHeartbeatTick(
  config: RzeclawConfig,
  workspaceRoot: string
): Promise<{ executed: boolean; content?: string; error?: string; pending?: string }> {
  await syncCanvasToTasks(workspaceRoot);
  const orientResult = await orient(config, workspaceRoot);
  const checkResult = config.heartbeat?.checkUseLLM
    ? await checkWithLLM(config, workspaceRoot, orientResult.checklistContent)
    : check(orientResult.checklistContent);
  const actResult = await act(config, workspaceRoot, checkResult);

  await record(workspaceRoot, {
    ts: new Date().toISOString(),
    executed: actResult.executed,
    content: actResult.content,
    error: actResult.error,
    suggestedInput: checkResult.suggestedInput,
  });

  return {
    executed: actResult.executed,
    content: actResult.content,
    error: actResult.error,
    pending: actResult.pending,
  };
}
