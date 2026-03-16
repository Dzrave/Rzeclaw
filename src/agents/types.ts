/**
 * Phase 14B WO-1431: Agent 实例类型与状态枚举
 * 设计依据: docs/MULTI_AGENT_ENTITY_DESIGN.md §3
 */

/** Agent 实例宏观状态（FSM） */
export type AgentInstanceState =
  | "idle"       // 等待指令
  | "executing"  // 正在执行 flow 或 runAgentLoop
  | "waiting"    // 等待其他 Agent 或外部回调
  | "done";      // 本次任务结束，可回收或保留

/** Agent 实例（蓝图在运行时的具现） */
export interface AgentInstance {
  instanceId: string;
  blueprintId: string;
  state: AgentInstanceState;
  blackboard: Record<string, string>;
  sessionId?: string;
  createdAt?: string;
  lastActiveAt?: string;
}
