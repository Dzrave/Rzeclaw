/**
 * Phase 14B WO-1432: Agent 实例创建与回收策略
 * 设计依据: docs/MULTI_AGENT_ENTITY_DESIGN.md §3.2
 */

import type { AgentInstance, AgentInstanceState } from "./types.js";
import { getAgentBlueprint } from "./blueprints.js";
import type { RezBotConfig } from "../config.js";

const instancesByBlueprint = new Map<string, AgentInstance[]>();
const INSTANCE_IDLE_RECYCLE_MS = 30 * 60 * 1000; // 30 min
let recycleTimer: ReturnType<typeof setTimeout> | null = null;

function generateInstanceId(blueprintId: string): string {
  return `inst_${blueprintId}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 根据蓝图创建新实例（state=idle，空黑板）。
 */
export function createInstance(config: RezBotConfig, blueprintId: string, sessionId?: string): AgentInstance | null {
  const blueprint = getAgentBlueprint(config, blueprintId);
  if (!blueprint) return null;
  const now = new Date().toISOString();
  const instance: AgentInstance = {
    instanceId: generateInstanceId(blueprintId),
    blueprintId,
    state: "idle",
    blackboard: {},
    sessionId,
    createdAt: now,
    lastActiveAt: now,
  };
  let list = instancesByBlueprint.get(blueprintId);
  if (!list) {
    list = [];
    instancesByBlueprint.set(blueprintId, list);
  }
  list.push(instance);
  return instance;
}

/**
 * 获取或创建实例：若该 blueprint 下已有 idle/done 实例则复用（更新 lastActiveAt、sessionId），否则创建新实例。
 * 策略：同一 blueprint 可保留多个实例，取最近活动的 idle 或 done 复用。
 */
export function getOrCreateInstance(config: RezBotConfig, blueprintId: string, sessionId?: string): AgentInstance | null {
  const list = instancesByBlueprint.get(blueprintId);
  const now = new Date().toISOString();
  if (list?.length) {
    const idleOrDone = list.filter((i) => i.state === "idle" || i.state === "done");
    if (idleOrDone.length > 0) {
      const byActive = [...idleOrDone].sort(
        (a, b) => new Date(b.lastActiveAt ?? b.createdAt ?? 0).getTime() - new Date(a.lastActiveAt ?? a.createdAt ?? 0).getTime()
      );
      const chosen = byActive[0]!;
      chosen.lastActiveAt = now;
      chosen.sessionId = sessionId ?? chosen.sessionId;
      chosen.state = "idle";
      return chosen;
    }
  }
  return createInstance(config, blueprintId, sessionId);
}

/**
 * 将实例状态更新为给定值（执行层在开始/结束时调用）。
 */
export function setInstanceState(instance: AgentInstance, state: AgentInstanceState): void {
  instance.state = state;
  instance.lastActiveAt = new Date().toISOString();
}

/**
 * Phase 15 WO-OF-001: 返回当前所有 Agent 实例的扁平列表（只读），供 Gateway agents.list 使用。
 */
export function listAllInstances(_config: RezBotConfig): AgentInstance[] {
  const out: AgentInstance[] = [];
  for (const list of instancesByBlueprint.values()) {
    for (const instance of list) {
      out.push(instance);
    }
  }
  return out;
}

/**
 * 回收超时未活动的 idle/done 实例（从列表中移除，不删持久化）。
 */
function recycleStaleInstances(config: RezBotConfig): void {
  const cutoff = Date.now() - INSTANCE_IDLE_RECYCLE_MS;
  for (const [blueprintId, list] of instancesByBlueprint) {
    const kept = list.filter((i) => {
      if (i.state !== "idle" && i.state !== "done") return true;
      const t = i.lastActiveAt ?? i.createdAt ?? "";
      return new Date(t).getTime() > cutoff;
    });
    if (kept.length === 0) instancesByBlueprint.delete(blueprintId);
    else instancesByBlueprint.set(blueprintId, kept);
  }
}

/**
 * 启动后台定时回收（可选）；在 Gateway 或执行层初始化时调用一次即可。
 */
export function startRecycleTimer(config: RezBotConfig): void {
  if (recycleTimer) return;
  const intervalMs = 5 * 60 * 1000;
  function run() {
    recycleStaleInstances(config);
    recycleTimer = setTimeout(run, intervalMs);
  }
  recycleTimer = setTimeout(run, intervalMs);
}
