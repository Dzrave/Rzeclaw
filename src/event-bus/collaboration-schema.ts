/**
 * Phase 14C WO-1460/1461/1465/1470: 协作事件基底与 pipeline/delegate/swarm payload
 * 设计依据: docs/EVENT_BUS_COLLABORATION_DESIGN.md §2～5
 */

/** 协作事件通用元数据（关联与溯源） */
export interface CollaborationMeta {
  pipelineId: string;
  parentEventId?: string;
  correlationId: string;
  /** 发起方 agentId（主控或完成本阶段的 Agent） */
  sourceAgentId?: string;
  /** 目标 agentId（委派/广播时的接收方） */
  targetAgentId?: string;
  ts: string;
}

/** WO-1461: pipeline.stage_done — 阶段完成，下游可认领 */
export interface PipelineStageDoneEvent extends CollaborationMeta {
  stageName?: string;
  /** 本阶段产出：文本或结构化数据 */
  output: unknown;
  /** 显式指定下一阶段 Agent；为空则由订阅者按规则认领 */
  nextAgentId?: string;
  /** 当前黑板片段供下游使用 */
  blackboardSnapshot?: Record<string, string>;
}

/** WO-1465: delegate.request — 委派请求（主控 → 打工人） */
export interface DelegateRequestEvent extends CollaborationMeta {
  /** 本次委派唯一 ID */
  delegateId: string;
  task: {
    message: string;
    params?: Record<string, unknown>;
    blackboard?: Record<string, string>;
  };
}

/** WO-1465: delegate.result — 委派结果（打工人 → 主控） */
export interface DelegateResultEvent extends CollaborationMeta {
  delegateId: string;
  /** 打工人完成方 */
  sourceAgentId: string;
  /** 主控方 */
  targetAgentId: string;
  success: boolean;
  content?: string;
  error?: string;
  blackboardDelta?: Record<string, string>;
}

/** WO-1470: swarm.broadcast — 广播任务 */
export interface SwarmBroadcastEvent extends CollaborationMeta {
  broadcastId: string;
  task: {
    message: string;
    params?: Record<string, unknown>;
  };
  /** 空表示所有订阅者均可认领 */
  targetAgentIds?: string[];
}

/** WO-1470: swarm.contribution — 单 Agent 贡献结果 */
export interface SwarmContributionEvent extends CollaborationMeta {
  broadcastId: string;
  /** 贡献者 agentId */
  sourceAgentId: string;
  result: unknown;
}

/** 协作 Topic 常量 */
export const TOPIC_PIPELINE_STAGE_DONE = "pipeline.stage_done";
export const TOPIC_DELEGATE_REQUEST = "delegate.request";
export const TOPIC_DELEGATE_RESULT = "delegate.result";
export const TOPIC_SWARM_BROADCAST = "swarm.broadcast";
export const TOPIC_SWARM_CONTRIBUTION = "swarm.contribution";
