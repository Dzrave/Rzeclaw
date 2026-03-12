/**
 * WO-LM-003: router_v1 schema，与内嵌小模型设计一致；意图分类与动机 RAG 产出均兼容此形态。
 */

export type RouterV1State =
  | "ROUTE_TO_LOCAL_FLOW"
  | "ESCALATE_TO_CLOUD"
  | "NO_ACTION"
  | "UNKNOWN";

export type RouterV1 = {
  state: RouterV1State;
  flowId?: string;
  params?: Record<string, unknown>;
  confidence: number;
  reason?: string;
};
