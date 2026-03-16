/**
 * Phase 16: 探索层类型定义
 * WO-1610: SnapshotContext；WO-1620: PlanStep / PlanVariant / Plan_Fallback；WO-1624: PlanScore
 */

/** 先验扫描得到的上下文（FSM、黑板、可用动作、摘要哈希） */
export type SnapshotContext = {
  fsm?: string;
  blackboard?: Record<string, string>;
  availableActions: { id: string; description?: string }[];
  snapshot_digest?: string;
};

/** 预案单步（必须在 availableActions 中） */
export type PlanStep = {
  step: number;
  actionId: string;
  agentId?: string;
  params?: Record<string, string>;
  description?: string;
};

/** 一条预案（3～5 个步骤） */
export type PlanVariant = {
  planId: string;
  title?: string;
  steps: PlanStep[];
  preconditions?: string[];
};

/** 无法用现有能力完成时的回退预案 */
export type PlanFallback = {
  type: "Plan_Fallback";
  subtype: "Request_New_Skill";
  content: string;
};

/** Critic 对单条预案的评分 */
export type PlanScore = {
  planId: string;
  score: number;
  estimatedSuccess?: number;
  estimatedCost?: number;
  estimatedRisk?: number;
  reason?: string;
};

export type CriticResult = {
  chosenPlanId: string;
  scores: PlanScore[];
};
