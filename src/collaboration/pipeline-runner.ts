/**
 * Phase 14C WO-1462～1464: 流水线 stage_done 订阅与续跑，最后一环发布 chat.response
 * 设计依据: docs/EVENT_BUS_COLLABORATION_DESIGN.md §3
 */

import type { RezBotConfig } from "../config.js";
import type { ChatResponseEvent } from "../event-bus/schema.js";
import type { PipelineStageDoneEvent } from "../event-bus/collaboration-schema.js";
import { TOPIC_PIPELINE_STAGE_DONE } from "../event-bus/collaboration-schema.js";
import { TOPIC_CHAT_RESPONSE } from "../event-bus/schema.js";
import { publish } from "../event-bus/bus.js";
import { hasAgentsEnabled } from "../agents/blueprints.js";
import { runAgentWithInput } from "../gateway/chat-executor.js";
import { setTaskCompleted } from "../task-results/store.js";
import path from "node:path";

function isPipelineStageDoneEvent(p: unknown): p is PipelineStageDoneEvent {
  return (
    typeof p === "object" &&
    p !== null &&
    "pipelineId" in p &&
    "correlationId" in p &&
    "output" in p &&
    "ts" in p
  );
}

/**
 * 处理 pipeline.stage_done：无 nextAgentId 时发布 chat.response 结束流水线；有则运行下一环并发布 stage_done 或 chat.response。
 */
export async function handlePipelineStageDone(
  config: RezBotConfig,
  event: PipelineStageDoneEvent,
  onStream?: (chunk: string) => void
): Promise<void> {
  const { correlationId, pipelineId, sourceAgentId, output, nextAgentId, blackboardSnapshot, ts } = event;

  if (!nextAgentId) {
    const content = typeof output === "string" ? output : JSON.stringify(output);
    const response: ChatResponseEvent = {
      correlationId,
      content,
      messages: [],
      blackboard: blackboardSnapshot ?? {},
    };
    const workspace = path.resolve(config.workspace);
    const retentionMinutes = config.taskResults?.retentionMinutes ?? 24 * 60;
    setTaskCompleted(correlationId, response, { workspace, retentionMinutes });
    publish(TOPIC_CHAT_RESPONSE, response);
    return;
  }

  if (!hasAgentsEnabled(config)) return;

  const message = typeof output === "string" ? output : JSON.stringify(output);
  const response = await runAgentWithInput(
    config,
    {
      agentId: nextAgentId,
      message,
      blackboard: blackboardSnapshot,
      correlationId,
      pipelineId,
      sessionId: pipelineId,
    },
    onStream
  );

  if (response.error) {
    publish(TOPIC_CHAT_RESPONSE, { ...response, correlationId });
    return;
  }

  if (response.pipelineNextAgentId) {
    const nextEvent: PipelineStageDoneEvent = {
      pipelineId,
      correlationId,
      sourceAgentId: nextAgentId,
      output: response.content ?? "",
      nextAgentId: response.pipelineNextAgentId,
      blackboardSnapshot: response.blackboard,
      ts: new Date().toISOString(),
    };
    publish(TOPIC_PIPELINE_STAGE_DONE, nextEvent);
  } else {
    const workspace = path.resolve(config.workspace);
    const retentionMinutes = config.taskResults?.retentionMinutes ?? 24 * 60;
    setTaskCompleted(correlationId, response, { workspace, retentionMinutes });
    publish(TOPIC_CHAT_RESPONSE, response);
  }
}

export function isPipelineStageDonePayload(p: unknown): p is PipelineStageDoneEvent {
  return isPipelineStageDoneEvent(p);
}
