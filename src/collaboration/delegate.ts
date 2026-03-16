/**
 * Phase 14C WO-1466～1469: 委派 request/result、主控等待、打工人执行、超时与失败
 * 设计依据: docs/EVENT_BUS_COLLABORATION_DESIGN.md §4
 */

import type { RzeclawConfig } from "../config.js";
import { subscribe, publish } from "../event-bus/bus.js";
import type { DelegateRequestEvent, DelegateResultEvent } from "../event-bus/collaboration-schema.js";
import { TOPIC_DELEGATE_REQUEST, TOPIC_DELEGATE_RESULT } from "../event-bus/collaboration-schema.js";
import { hasAgentsEnabled, getAgentBlueprint } from "../agents/blueprints.js";
import { runAgentWithInput } from "../gateway/chat-executor.js";

const DELEGATE_TIMEOUT_MS = 120_000; // 2 min

const pendingByDelegateId = new Map<
  string,
  {
    resolve: (event: DelegateResultEvent) => void;
    reject: (err: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  }
>();

let resultListenerRegistered = false;

function ensureResultListener(): void {
  if (resultListenerRegistered) return;
  resultListenerRegistered = true;
  subscribe<DelegateResultEvent>(TOPIC_DELEGATE_RESULT, (event) => {
    const pending = pendingByDelegateId.get(event.delegateId);
    if (pending) {
      pending.resolve(event);
      clearTimeout(pending.timeoutId);
      pendingByDelegateId.delete(event.delegateId);
    }
  });
}

export function createDelegateId(): string {
  return `del_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * 主控发布 delegate.request 并等待 delegate.result（或超时）。
 */
export function requestDelegation(
  config: RzeclawConfig,
  params: {
    sourceAgentId: string;
    targetAgentId: string;
    task: { message: string; params?: Record<string, unknown>; blackboard?: Record<string, string> };
    pipelineId?: string;
    correlationId?: string;
  },
  options?: { timeoutMs?: number }
): Promise<DelegateResultEvent> {
  ensureResultListener();
  const delegateId = createDelegateId();
  const timeoutMs = options?.timeoutMs ?? config.eventBus?.responseTimeoutMs ?? DELEGATE_TIMEOUT_MS;
  const ts = new Date().toISOString();
  const pipelineId = params.pipelineId ?? delegateId;
  const correlationId = params.correlationId ?? delegateId;

  const request: DelegateRequestEvent = {
    pipelineId,
    correlationId,
    sourceAgentId: params.sourceAgentId,
    targetAgentId: params.targetAgentId,
    delegateId,
    task: params.task,
    ts,
  };

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      if (pendingByDelegateId.delete(delegateId)) {
        reject(new Error(`Delegation timeout: no result within ${timeoutMs}ms`));
      }
    }, timeoutMs);

    pendingByDelegateId.set(delegateId, {
      resolve: (event: DelegateResultEvent) => {
        clearTimeout(timeoutId);
        pendingByDelegateId.delete(delegateId);
        resolve(event);
      },
      reject: (err: Error) => {
        clearTimeout(timeoutId);
        pendingByDelegateId.delete(delegateId);
        reject(err);
      },
      timeoutId,
    });

    publish(TOPIC_DELEGATE_REQUEST, request);
  });
}

/**
 * 订阅 delegate.request：当 targetAgentId 为本进程某 Agent 时执行任务并发布 delegate.result。
 */
export function subscribeToDelegateRequest(config: RzeclawConfig): () => void {
  if (!hasAgentsEnabled(config)) return () => {};

  return subscribe<DelegateRequestEvent>(TOPIC_DELEGATE_REQUEST, async (event) => {
    const targetId = event.targetAgentId;
    if (!targetId) return;
    const blueprint = getAgentBlueprint(config, targetId);
    if (!blueprint) return;

    const message = event.task.message;
    const blackboard = event.task.blackboard ?? {};
    const ts = new Date().toISOString();

    try {
      const response = await runAgentWithInput(config, {
        agentId: targetId,
        message,
        blackboard,
        correlationId: event.correlationId,
        pipelineId: event.pipelineId,
        sessionId: `delegate_${event.delegateId}`,
      });

      const result: DelegateResultEvent = {
        delegateId: event.delegateId,
        pipelineId: event.pipelineId,
        correlationId: event.correlationId,
        sourceAgentId: targetId,
        targetAgentId: event.sourceAgentId ?? "",
        success: !response.error,
        content: response.content,
        error: response.error,
        blackboardDelta: response.blackboard,
        ts,
      };
      publish(TOPIC_DELEGATE_RESULT, result);
    } catch (err) {
      const result: DelegateResultEvent = {
        delegateId: event.delegateId,
        pipelineId: event.pipelineId,
        correlationId: event.correlationId,
        sourceAgentId: targetId,
        targetAgentId: event.sourceAgentId ?? "",
        success: false,
        error: err instanceof Error ? err.message : String(err),
        ts,
      };
      publish(TOPIC_DELEGATE_RESULT, result);
    }
  });
}
