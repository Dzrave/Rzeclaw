/**
 * Phase 14C WO-1470～1472: 蜂群 broadcast / contribution、认领与聚合
 * 设计依据: docs/EVENT_BUS_COLLABORATION_DESIGN.md §5
 */

import type { RezBotConfig } from "../config.js";
import { subscribe, publish } from "../event-bus/bus.js";
import type { SwarmBroadcastEvent, SwarmContributionEvent } from "../event-bus/collaboration-schema.js";
import { TOPIC_SWARM_BROADCAST, TOPIC_SWARM_CONTRIBUTION } from "../event-bus/collaboration-schema.js";
import { hasAgentsEnabled, getAgentBlueprint } from "../agents/blueprints.js";
import { runAgentWithInput } from "../gateway/chat-executor.js";

const SWARM_COLLECT_TIMEOUT_MS = 60_000;
const SWARM_DEFAULT_MIN_CONTRIBUTIONS = 1;

const pendingByBroadcastId = new Map<
  string,
  {
    resolve: (contributions: SwarmContributionEvent[]) => void;
    timeoutId: ReturnType<typeof setTimeout>;
    contributions: SwarmContributionEvent[];
    minContributions: number;
  }
>();

let contributionListenerRegistered = false;

function ensureContributionListener(): void {
  if (contributionListenerRegistered) return;
  contributionListenerRegistered = true;
  subscribe<SwarmContributionEvent>(TOPIC_SWARM_CONTRIBUTION, (event) => {
    const pending = pendingByBroadcastId.get(event.broadcastId);
    if (pending) {
      pending.contributions.push(event);
      if (pending.contributions.length >= pending.minContributions) {
        clearTimeout(pending.timeoutId);
        pendingByBroadcastId.delete(event.broadcastId);
        pending.resolve(pending.contributions);
      }
    }
  });
}

export function createBroadcastId(): string {
  return `swarm_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * 发起方发布 swarm.broadcast 并收集 contribution，超时或达到 minContributions 后 resolve。
 */
export function requestSwarmBroadcast(
  config: RezBotConfig,
  params: {
    sourceAgentId: string;
    task: { message: string; params?: Record<string, unknown> };
    targetAgentIds?: string[];
    pipelineId?: string;
    correlationId?: string;
  },
  options?: { timeoutMs?: number; minContributions?: number }
): Promise<SwarmContributionEvent[]> {
  ensureContributionListener();
  const broadcastId = createBroadcastId();
  const timeoutMs = options?.timeoutMs ?? SWARM_COLLECT_TIMEOUT_MS;
  const minContributions = options?.minContributions ?? SWARM_DEFAULT_MIN_CONTRIBUTIONS;
  const ts = new Date().toISOString();
  const pipelineId = params.pipelineId ?? broadcastId;
  const correlationId = params.correlationId ?? broadcastId;

  const broadcast: SwarmBroadcastEvent = {
    pipelineId,
    correlationId,
    sourceAgentId: params.sourceAgentId,
    broadcastId,
    task: params.task,
    targetAgentIds: params.targetAgentIds,
    ts,
  };

  publish(TOPIC_SWARM_BROADCAST, broadcast);

  return new Promise((resolve) => {
    const contributions: SwarmContributionEvent[] = [];
    const timeoutId = setTimeout(() => {
      const p = pendingByBroadcastId.get(broadcastId);
      if (p) {
        pendingByBroadcastId.delete(broadcastId);
        p.resolve(p.contributions);
      }
    }, timeoutMs);

    pendingByBroadcastId.set(broadcastId, {
      resolve: (c) => {
        clearTimeout(timeoutId);
        pendingByBroadcastId.delete(broadcastId);
        resolve(c);
      },
      timeoutId,
      contributions,
      minContributions,
    });
  });
}

/**
 * 订阅 swarm.broadcast：targetAgentIds 含自己或为空时认领，执行后发布 swarm.contribution。
 */
export function subscribeToSwarmBroadcast(config: RezBotConfig): () => void {
  if (!hasAgentsEnabled(config)) return () => {};

  return subscribe<SwarmBroadcastEvent>(TOPIC_SWARM_BROADCAST, async (event) => {
    const targetIds = event.targetAgentIds?.length
      ? event.targetAgentIds
      : (config.agents?.blueprints ?? []).map((b) => b.id);
    const ts = new Date().toISOString();

    const runOne = async (agentId: string): Promise<void> => {
      const blueprint = getAgentBlueprint(config, agentId);
      if (!blueprint) return;
      try {
        const response = await runAgentWithInput(config, {
          agentId,
          message: event.task.message,
          correlationId: event.correlationId,
          pipelineId: event.pipelineId,
          sessionId: `swarm_${event.broadcastId}`,
        });
        const contribution: SwarmContributionEvent = {
          broadcastId: event.broadcastId,
          pipelineId: event.pipelineId,
          correlationId: event.correlationId,
          sourceAgentId: agentId,
          result: response.content ?? response.error,
          ts: new Date().toISOString(),
        };
        publish(TOPIC_SWARM_CONTRIBUTION, contribution);
      } catch (err) {
        const contribution: SwarmContributionEvent = {
          broadcastId: event.broadcastId,
          pipelineId: event.pipelineId,
          correlationId: event.correlationId,
          sourceAgentId: agentId,
          result: err instanceof Error ? err.message : String(err),
          ts,
        };
        publish(TOPIC_SWARM_CONTRIBUTION, contribution);
      }
    };

    await Promise.all(targetIds.map((id) => runOne(id)));
  });
}
