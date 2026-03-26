/**
 * Phase 14B WO-1439: Agent 局部记忆 — 存储隔离与 workspaceId 约定
 * 设计依据: docs/MULTI_AGENT_ENTITY_DESIGN.md §6.1
 *
 * 与全局记忆关系：
 * - 全局：createStore(workspace, config.memory.workspaceId) → .rezbot/memory/<workspaceId>.jsonl
 * - 局部：createStore(workspace, getAgentMemoryWorkspaceId(blueprintId)) → .rezbot/memory/agent_<blueprintId>.jsonl
 * 检索/写入时使用对应 store；可选「局部 + 全局只读」由 runAgentLoop 的 localMemoryScope.includeGlobal 控制。
 */

/** 局部记忆使用的 workspaceId 前缀，与全局 workspaceId 区分 */
const AGENT_MEMORY_PREFIX = "agent_";

/**
 * 返回该 Agent 蓝图对应的记忆存储 scope（用作 createStore 的 workspaceId）。
 * 写入 L1 时使用此 workspaceId 作为 entry.workspace_id，检索时使用同一 store 即仅查该 Agent 的局部记忆。
 */
export function getAgentMemoryWorkspaceId(blueprintId: string): string {
  return AGENT_MEMORY_PREFIX + blueprintId;
}

/** 判断 workspaceId 是否为 Agent 局部记忆 scope */
export function isAgentMemoryWorkspaceId(workspaceId: string): boolean {
  return workspaceId.startsWith(AGENT_MEMORY_PREFIX);
}
