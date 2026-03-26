/**
 * Phase 16 WO-1624/1625: Critic — 评分公式、提示与 LLM 调用、选出最优 planId
 */

import type { RezBotConfig } from "../config.js";
import { getLLMClient } from "../llm/index.js";
import type { PlanVariant, PlanScore, CriticResult } from "./types.js";

const MAX_CRITIC_TOKENS = 2048;

/** WO-1624: Score(P) = w1*E(success) - w2*Cost - w3*Risk，权重来自 config */
export function computePlanScore(
  planId: string,
  estimatedSuccess: number,
  estimatedCost: number,
  estimatedRisk: number,
  weights: { success?: number; cost?: number; risk?: number }
): number {
  const w1 = weights.success ?? 0.6;
  const w2 = weights.cost ?? 0.2;
  const w3 = weights.risk ?? 0.2;
  return w1 * estimatedSuccess - w2 * estimatedCost - w3 * estimatedRisk;
}

const DEFAULT_WEIGHTS = { success: 0.6, cost: 0.2, risk: 0.2 };

/** WO-1625: 构建 Critic 的 system + user prompt；权重来自 config.exploration.critic.weights */
export function buildCriticPrompt(
  variants: PlanVariant[],
  taskDescription: string,
  weights?: { success?: number; cost?: number; risk?: number }
): { system: string; user: string } {
  const w1 = weights?.success ?? DEFAULT_WEIGHTS.success;
  const w2 = weights?.cost ?? DEFAULT_WEIGHTS.cost;
  const w3 = weights?.risk ?? DEFAULT_WEIGHTS.risk;
  const plansJson = JSON.stringify(variants, null, 2);
  const system = `你是评估者（Critic）。对下列多个预案进行打分并选出最优的一个。

评分维度（每个预案给出 0～1 的估计）：
- estimatedSuccess：预估成功率
- estimatedCost：预估资源消耗（归一化 0～1，越高越耗）
- estimatedRisk：对系统/环境的破坏风险（0～1）

综合分 = ${w1}*estimatedSuccess - ${w2}*estimatedCost - ${w3}*estimatedRisk，取最高分的预案。

请**仅**输出一个 JSON 对象，格式：
{"chosenPlanId": "选中的 planId", "scores": [{"planId":"...","score":0.85,"estimatedSuccess":0.9,"estimatedCost":0.2,"estimatedRisk":0.1,"reason":"简短理由"}]}
不要输出其他文字。`;

  const user = `任务描述：${taskDescription}\n\n预案列表：\n${plansJson}`;
  return { system, user };
}

/** 从 Critic 文本中解析 chosenPlanId 与 scores（供测试与 E2E 使用） */
export function parseCriticOutput(text: string, variantIds: string[]): CriticResult | null {
  let raw = text.trim();
  const codeBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) raw = codeBlock[1].trim();
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const chosenPlanId = typeof o.chosenPlanId === "string" ? o.chosenPlanId : variantIds[0];
    const scoresArr = Array.isArray(o.scores) ? o.scores : [];
    const scores: PlanScore[] = scoresArr
      .filter((s): s is Record<string, unknown> => s != null && typeof s === "object")
      .map((s) => ({
        planId: String(s.planId ?? ""),
        score: typeof s.score === "number" ? s.score : 0,
        estimatedSuccess: typeof s.estimatedSuccess === "number" ? s.estimatedSuccess : undefined,
        estimatedCost: typeof s.estimatedCost === "number" ? s.estimatedCost : undefined,
        estimatedRisk: typeof s.estimatedRisk === "number" ? s.estimatedRisk : undefined,
        reason: typeof s.reason === "string" ? s.reason : undefined,
      }));
    return { chosenPlanId, scores };
  } catch {
    return null;
  }
}

/** WO-1625: 调用 Critic LLM，返回 chosenPlanId 与 scores。解析失败时返回 null，调用方应中止探索。 */
export async function callCritic(
  config: RezBotConfig,
  variants: PlanVariant[],
  taskDescription: string
): Promise<CriticResult | null> {
  if (variants.length === 0) {
    return { chosenPlanId: "", scores: [] };
  }
  if (variants.length === 1) {
    return {
      chosenPlanId: variants[0].planId,
      scores: [{ planId: variants[0].planId, score: 1 }],
    };
  }
  try {
    const client = getLLMClient(config);
    const weights = config.exploration?.critic?.weights;
    const { system, user } = buildCriticPrompt(variants, taskDescription, weights);
    const response = await client.createMessage({
      system,
      messages: [{ role: "user", content: user }],
      max_tokens: MAX_CRITIC_TOKENS,
    });
    const textBlock = response.content.find((b) => b.type === "text");
    const text = textBlock && "text" in textBlock ? textBlock.text : "";
    const variantIds = variants.map((v) => v.planId);
    const result = parseCriticOutput(text, variantIds);
    return result;
  } catch {
    return null;
  }
}
