/**
 * Phase 16 WO-1632: 将最优预案编译为执行层可消费的「消息」（供 runAgentLoop 使用）
 * 执行层不感知探索层，仅将编译后的消息作为 userMessage 传入 runAgentLoop。
 */

import type { PlanVariant } from "./types.js";

const PREFIX = "【系统预案】请严格按以下步骤执行，每步使用对应工具或流程。\n\n";
const SUFFIX = "\n\n---\n用户原意：";

/** WO-1632: 将 PlanVariant 编译为单条文本消息，保持 correlationId 等由上层传递 */
export function compilePlanToMessage(plan: PlanVariant, originalUserMessage: string): string {
  const stepsText = plan.steps
    .map(
      (s) =>
        `${s.step}. ${s.actionId}` +
        (s.params && Object.keys(s.params).length > 0 ? ` 参数: ${JSON.stringify(s.params)}` : "") +
        (s.description ? ` — ${s.description}` : "")
    )
    .join("\n");
  return `${PREFIX}${stepsText}${SUFFIX}\n${originalUserMessage}`;
}
