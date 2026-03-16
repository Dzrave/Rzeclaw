/**
 * Phase 16 WO-1621/1622: Planner — 系统提示词模板、LLM 调用、解析 PlanVariant[] 或 Plan_Fallback
 */

import type { RzeclawConfig } from "../config.js";
import { getLLMClient } from "../llm/index.js";
import type { SnapshotContext } from "./types.js";
import type { PlanVariant, PlanFallback } from "./types.js";

const MAX_PLANNER_TOKENS = 4096;

const DEFAULT_MAX_VARIANTS = 5;

/** WO-1621: 构建 Planner 的 system + user prompt，注入快照与用户消息；maxVariants 来自 config.exploration.planner.maxVariants */
export function buildPlannerPrompt(
  snapshot: SnapshotContext,
  userMessage: string,
  maxVariants: number = DEFAULT_MAX_VARIANTS
): { system: string; user: string } {
  const actionsList = snapshot.availableActions
    .map((a) => `- ${a.id}${a.description ? ` (${a.description})` : ""}`)
    .join("\n");
  const blackboardStr =
    snapshot.blackboard && Object.keys(snapshot.blackboard).length > 0
      ? JSON.stringify(snapshot.blackboard, null, 0)
      : "（无）";
  const n = Math.max(1, Math.min(10, Math.round(maxVariants)));
  const system = `你是一个严谨的架构师。请**仅使用**系统已提供的能力解决问题，不要虚构任何不存在的工具或节点。

【当前上下文】
- 环境/FSM：${snapshot.fsm ?? "general"}
- 黑板：${blackboardStr}

【你只能调用以下节点和工具】严禁使用列表外的 actionId。
${actionsList}

【任务】
根据用户意图与上述约束，给出 ${n} 种组合这些现有节点完成任务的**预案**。每个预案为 JSON 对象，格式：
{
  "planId": "唯一标识如 plan_1",
  "title": "简短标题（可选）",
  "steps": [
    { "step": 1, "actionId": "必须来自上述列表的 id", "params": {}, "description": "可选" }
  ],
  "preconditions": ["可选前提"]
}

若**无论如何组合现有节点都无法完成任务**，请只输出一行：
Plan_Fallback: Request_New_Skill
然后换行写一句话说明缺失的能力。

请直接输出：要么多行 JSON 数组（每个元素一个预案），要么 Plan_Fallback 行+说明。不要输出其他解释。`;

  const user = `用户请求：\n${userMessage}`;
  return { system, user };
}

/** 从 LLM 文本中尝试解析 JSON 数组（可能被包在 ```json ... ``` 中） */
function extractJsonArray(text: string): unknown[] | null {
  let raw = text.trim();
  const codeBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) raw = codeBlock[1].trim();
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** 检测是否为 Plan_Fallback 输出 */
function parseFallback(text: string): PlanFallback | null {
  const line = text.split("\n")[0].trim();
  if (!/^Plan_Fallback\s*:\s*Request_New_Skill/i.test(line)) return null;
  const rest = text.slice(text.indexOf("\n") + 1).trim() || "缺少的能力未说明";
  return { type: "Plan_Fallback", subtype: "Request_New_Skill", content: rest };
}

/** WO-1622: 解析 Planner 输出为 PlanVariant[] 或 Plan_Fallback；校验 actionId 在 availableActions 中 */
export function parsePlannerOutput(
  text: string,
  allowedActionIds: Set<string>
): { variants: PlanVariant[] } | { fallback: PlanFallback } {
  const fallback = parseFallback(text);
  if (fallback) return { fallback };

  const arr = extractJsonArray(text);
  if (!arr || arr.length === 0) return { variants: [] };

  const variants: PlanVariant[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const planId = typeof o.planId === "string" ? o.planId : `plan_${variants.length + 1}`;
    const rawSteps = Array.isArray(o.steps) ? (o.steps as Record<string, unknown>[]) : [];
    const steps: { step: number; actionId: string; params?: Record<string, string>; description?: string }[] = [];
    let variantValid = true;
    for (let i = 0; i < rawSteps.length; i++) {
      const s = rawSteps[i];
      const actionId = String(s?.actionId ?? "").trim();
      if (!allowedActionIds.has(actionId)) {
        variantValid = false;
        break;
      }
      steps.push({
        step: i + 1,
        actionId,
        params:
          s && typeof s.params === "object" && s.params !== null
            ? (s.params as Record<string, string>)
            : undefined,
        description: typeof s.description === "string" ? s.description : undefined,
      });
    }
    if (!variantValid || steps.length === 0) continue;
    const preconditions = Array.isArray(o.preconditions)
      ? (o.preconditions as unknown[]).filter((p): p is string => typeof p === "string")
      : undefined;
    variants.push({
      planId,
      title: typeof o.title === "string" ? o.title : undefined,
      steps,
      preconditions,
    });
  }
  return { variants };
}

/** WO-1622: 调用 Planner LLM（仅文本，无工具），返回 PlanVariant[] 或 Plan_Fallback；LLM 异常时抛出，由 tryExploration 捕获并回退 */
export async function callPlanner(
  config: RzeclawConfig,
  snapshot: SnapshotContext,
  userMessage: string
): Promise<{ variants: PlanVariant[] } | { fallback: PlanFallback }> {
  const maxVariants = config.exploration?.planner?.maxVariants ?? DEFAULT_MAX_VARIANTS;
  const { system, user } = buildPlannerPrompt(snapshot, userMessage, maxVariants);
  const client = getLLMClient(config);
  const response = await client.createMessage({
    system,
    messages: [{ role: "user", content: user }],
    max_tokens: MAX_PLANNER_TOKENS,
  });
  const textBlock = response.content.find((b) => b.type === "text");
  const text = textBlock && "text" in textBlock ? textBlock.text : "";
  const allowedIds = new Set(snapshot.availableActions.map((a) => a.id));
  return parsePlannerOutput(text, allowedIds);
}
