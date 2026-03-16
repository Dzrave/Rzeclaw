/**
 * Phase 14A WO-1401: Event Bus 统一 Event Schema（世界语）
 * 设计依据: docs/EVENT_BUS_AS_HUB_DESIGN.md §3
 */

/** 会话快照片段：Gateway 随 request 携带或执行层从 response 回写，用于同步会话状态 */
export type SessionSnapshotFragment = {
  messages: { role: "user" | "assistant"; content: string }[];
  sessionGoal?: string;
  sessionSummary?: string;
  sessionType?: string;
  /** WO-BT-022: 黑板槽位 */
  blackboard?: Record<string, string>;
};

/**
 * chat.request — 用户请求事件（接入层 → Bus）
 */
export interface ChatRequestEvent {
  /** 唯一关联 ID，用于匹配 response */
  correlationId: string;
  /** 来源节点标识：local_ui | gateway_ws | gateway_telegram | … */
  source: string;
  /** 用户原始消息 */
  message: string;
  /** 会话 ID，默认 "main" */
  sessionId?: string;
  /** 会话类型：dev | knowledge | pm | swarm_manager | general */
  sessionType?: string;
  /** 覆盖 workspace（可选） */
  workspace?: string;
  /** 蜂群团队 ID（可选） */
  teamId?: string;
  /** 隐私模式：true 时不写 L1、不持久化快照 */
  privacy?: boolean;
  /** 当前会话状态（Gateway 携带），执行层据此运行并回写更新 */
  sessionSnapshot?: SessionSnapshotFragment;
  /** WO-1507: 本会话已授权 scope 列表，同 scope 不再弹确认 */
  sessionGrantedScopes?: string[];
  /** 扩展字段，预留 */
  meta?: Record<string, unknown>;
  /** ISO 时间戳，便于审计 */
  ts?: string;
}

/**
 * chat.response — 执行层回复事件（Bus → 接入层）
 */
export interface ChatResponseEvent {
  /** 与 request 的 correlationId 一致 */
  correlationId: string;
  /** 成功时正文 */
  content?: string;
  /** 失败或需确认时的错误信息 */
  error?: string;
  /** 引用的记忆 ID（memory 启用时） */
  citedMemoryIds?: string[];
  /** 是否建议进化（evolution.insertTree） */
  evolutionSuggestion?: boolean;
  /** 更新后的会话（Gateway 合并后写快照） */
  messages?: { role: "user" | "assistant"; content: string }[];
  sessionGoal?: string;
  sessionSummary?: string;
  blackboard?: Record<string, string>;
  /** 若为 flow 执行，可带 generatedFlowId / suggestedRoute 等 */
  generatedFlowId?: string;
  suggestedRoute?: { hint: string; flowId: string };
  /** Phase 14C: 流水线下一环 agentId；存在时接入层发布 pipeline.stage_done 而非 chat.response */
  pipelineNextAgentId?: string;
  /** Phase 14C: 本回复来自的 agentId（协作溯源） */
  sourceAgentId?: string;
  [key: string]: unknown;
}

/**
 * chat.stream — 流式输出 chunk（可选）
 */
export interface ChatStreamEvent {
  correlationId: string;
  chunk: string;
  ts?: string;
}

/**
 * task.status — 长任务进度/状态（可选），供监控与任务解耦使用
 */
export interface TaskStatusEvent {
  correlationId: string;
  status: "pending" | "running" | "completed" | "failed";
  message?: string;
  ts: string;
}

/**
 * Phase 16 WO-1605/1634: 探索层 Event Bus 形态 — 探索层产出「编译后请求」发布到此 topic，执行层订阅并消费。
 * Payload 与 ChatRequestEvent 一致，可能带 meta.fromExploration、meta.explorationRecordId（已编译）或透传（未探索）。
 */
export const TOPIC_PLAN_READY = "task.plan_ready";

/** WO-1623 可选：Planner 产出 Plan_Fallback 时发布「技能请求」，供复盘或技能扩展消费 */
export const TOPIC_SKILL_REQUEST = "skill.request";

export interface SkillRequestEvent {
  correlationId: string;
  /** Fallback 说明（缺失能力描述） */
  content: string;
  /** 用户原始消息 */
  message?: string;
  sessionId?: string;
  ts: string;
}

/** 总线 Topic 常量 */
export const TOPIC_CHAT_REQUEST = "chat.request";
export const TOPIC_CHAT_RESPONSE = "chat.response";
export const TOPIC_CHAT_STREAM = "chat.stream";
export const TOPIC_TASK_STATUS = "task.status";
