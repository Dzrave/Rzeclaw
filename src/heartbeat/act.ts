/**
 * WO-619 / Phase 9 WO-904: Heartbeat Act — 若有待办则调用 runAgentLoop 执行一条；可配置仅写 pending 不执行。
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { runAgentLoop } from "../agent/loop.js";
import type { RzeclawConfig } from "../config.js";
import type { CheckResult } from "./check.js";

export type ActResult = {
  executed: boolean;
  content?: string;
  error?: string;
  /** WO-904: 当 requireConfirmation 时仅写回待执行项，不执行 */
  pending?: string;
};

const PENDING_FILE = ".rzeclaw/heartbeat_pending.json";

/**
 * 若有 suggestedInput：若 requireConfirmation 则仅写入 heartbeat_pending.json 并返回 pending；否则执行 runAgentLoop。
 */
export async function act(
  config: RzeclawConfig,
  workspaceRoot: string,
  checkResult: CheckResult
): Promise<ActResult> {
  if (!checkResult.hasWork || !checkResult.suggestedInput) {
    return { executed: false };
  }
  if (config.heartbeat?.requireConfirmation) {
    const dir = join(workspaceRoot, ".rzeclaw");
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(workspaceRoot, PENDING_FILE),
      JSON.stringify(
        { suggestedInput: checkResult.suggestedInput, ts: new Date().toISOString() },
        null,
        2
      ),
      "utf-8"
    );
    return { executed: false, pending: checkResult.suggestedInput };
  }
  try {
    const { content } = await runAgentLoop({
      config: { ...config, workspace: workspaceRoot },
      userMessage: checkResult.suggestedInput,
      sessionMessages: [],
      sessionId: `heartbeat-${Date.now()}`,
    });
    return { executed: true, content };
  } catch (e) {
    return {
      executed: true,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
