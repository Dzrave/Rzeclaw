/**
 * Phase 14B WO-1430: Agent 蓝图配置与按 id 查找
 * 设计依据: docs/MULTI_AGENT_ENTITY_DESIGN.md §2
 */

import type { RzeclawConfig, AgentBlueprint } from "../config.js";

/**
 * 按 id 获取蓝图；无多 Agent 配置或 id 不存在时返回 undefined。
 */
export function getAgentBlueprint(config: RzeclawConfig, id: string): AgentBlueprint | undefined {
  const list = config.agents?.blueprints;
  if (!list?.length) return undefined;
  return list.find((b) => b.id === id);
}

/** 是否启用了多 Agent（存在至少一个蓝图） */
export function hasAgentsEnabled(config: RzeclawConfig): boolean {
  return (config.agents?.blueprints?.length ?? 0) > 0;
}
