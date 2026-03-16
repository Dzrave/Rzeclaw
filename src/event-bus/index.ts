/**
 * Phase 14A: Event Bus 为中枢 — 进程内逻辑总线与 Schema
 */

export {
  type ChatRequestEvent,
  type ChatResponseEvent,
  type ChatStreamEvent,
  type TaskStatusEvent,
  type SessionSnapshotFragment,
  TOPIC_CHAT_REQUEST,
  TOPIC_CHAT_RESPONSE,
  TOPIC_CHAT_STREAM,
  TOPIC_TASK_STATUS,
  TOPIC_PLAN_READY,
  TOPIC_SKILL_REQUEST,
  type SkillRequestEvent,
} from "./schema.js";

export {
  type CollaborationMeta,
  type PipelineStageDoneEvent,
  type DelegateRequestEvent,
  type DelegateResultEvent,
  type SwarmBroadcastEvent,
  type SwarmContributionEvent,
  TOPIC_PIPELINE_STAGE_DONE,
  TOPIC_DELEGATE_REQUEST,
  TOPIC_DELEGATE_RESULT,
  TOPIC_SWARM_BROADCAST,
  TOPIC_SWARM_CONTRIBUTION,
} from "./collaboration-schema.js";

export {
  subscribe,
  publish,
  requestResponse,
  publishStream,
  createCorrelationId,
} from "./bus.js";

export type { Topic, Payload, SubscriptionCallback } from "./bus.js";
