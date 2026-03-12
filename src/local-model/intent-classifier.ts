/**
 * WO-LM-003: 意图分类对接 Router。规则未命中时调用本地模型得到 router_v1，与动机 RAG、规则路由统一数据流。
 */

import type { RzeclawConfig } from "../config.js";
import { localModelComplete } from "./client.js";
import type { RouterV1, RouterV1State } from "./types.js";

const ROUTER_V1_STATES: RouterV1State[] = [
  "ROUTE_TO_LOCAL_FLOW",
  "ESCALATE_TO_CLOUD",
  "NO_ACTION",
  "UNKNOWN",
];

const INTENT_SYSTEM = `你是一个路由助手。根据用户消息，输出一条 JSON，且仅输出该 JSON，不要其他文字。
格式（严格遵循）：
{"state":"ROUTE_TO_LOCAL_FLOW|ESCALATE_TO_CLOUD|NO_ACTION|UNKNOWN","flowId":"可选，当 state 为 ROUTE_TO_LOCAL_FLOW 时必填，且必须是下列 ID 之一","params":{},"confidence":0.0~1.0,"reason":"简短说明"}
规则：
- state=ROUTE_TO_LOCAL_FLOW 表示可由本地流程处理，必须填写 flowId 且 flowId 必须是给定列表中的某一个。
- state=ESCALATE_TO_CLOUD 表示需要云端大模型处理。
- NO_ACTION 表示无需执行；UNKNOWN 表示无法判断。
- confidence 为 0~1 的置信度。`;

function parseRouterV1(text: string): RouterV1 | null {
  const trimmed = text.trim();
  let raw = trimmed;
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) raw = fence[1].trim();
  try {
    const o = JSON.parse(raw) as unknown;
    if (o == null || typeof o !== "object") return null;
    const obj = o as Record<string, unknown>;
    const state = obj.state as string;
    if (!ROUTER_V1_STATES.includes(state as RouterV1State)) return null;
    const confidence = typeof obj.confidence === "number" ? obj.confidence : 0;
    if (confidence < 0 || confidence > 1) return null;
    const flowId = typeof obj.flowId === "string" ? obj.flowId : undefined;
    const params = obj.params != null && typeof obj.params === "object" ? (obj.params as Record<string, unknown>) : undefined;
    const reason = typeof obj.reason === "string" ? obj.reason : undefined;
    return {
      state: state as RouterV1State,
      flowId,
      params,
      confidence,
      reason,
    };
  } catch {
    return null;
  }
}

export type CallIntentClassifierResult =
  | { ok: true; router: RouterV1 }
  | { ok: false; error: string };

/**
 * 调用本地模型做意图分类，返回 router_v1；失败或解析失败返回 ok: false。
 * flowIdsInLibrary 用于校验 ROUTE_TO_LOCAL_FLOW 时的 flowId 是否合法。
 */
export async function callIntentClassifier(
  config: RzeclawConfig,
  message: string,
  flowIdsInLibrary: Set<string>
): Promise<CallIntentClassifierResult> {
  const list = Array.from(flowIdsInLibrary).slice(0, 100);
  const userPrompt = `可选 flowId 列表（只能从下列选一个）：${list.join(", ")}\n\n用户消息：${message}`;
  try {
    const raw = await localModelComplete(config, userPrompt, INTENT_SYSTEM);
    const router = parseRouterV1(raw);
    if (!router) return { ok: false, error: "无法解析 router_v1" };
    if (router.state === "ROUTE_TO_LOCAL_FLOW") {
      if (!router.flowId || !flowIdsInLibrary.has(router.flowId)) {
        return { ok: false, error: `flowId ${router.flowId ?? "缺失"} 不在流程库中` };
      }
    }
    return { ok: true, router };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export type { RouterV1, RouterV1State };
