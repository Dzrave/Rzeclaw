import type { RzeclawConfig } from "../config.js";
import type { ToolDef } from "../tools/index.js";
import type { Message } from "./context.js";
export type { Message } from "./context.js";
export declare function runAgentLoop(params: {
    config: RzeclawConfig;
    userMessage: string;
    sessionMessages: Message[];
    sessionId?: string;
    /** WO-401: 当前会话目标，后续轮中注入；不传则从首条用户消息推导 */
    sessionGoal?: string;
    /** Optional L0 summary for long sessions (summary + recent 2 rounds) */
    sessionSummary?: string;
    /** Phase 17: 5 天滚动账本格式化的前文，注入 system prompt；隐私会话时由调用方传空或不传 */
    rollingContext?: string;
    /** Phase 10: 会话类型，用于注入角色片段 */
    sessionType?: string;
    /** Phase 10: 蜂群管理时的团队 id，用于注入协调范围 */
    teamId?: string;
    /** WO-SEC-006: 隐私会话标记；为 true 时调用方应不写入 L1、不持久化快照 */
    sessionFlags?: {
        privacy?: boolean;
    };
    /** WO-SEC-010: 本会话已授权的 scope 列表（如 ["file_write"]），同 scope 不再弹确认 */
    sessionGrantedScopes?: string[];
    /** WO-BT-022: 会话黑板，与 flow 共享；取槽注入 system，并可提供 write_slot 工具 */
    blackboard?: Record<string, string>;
    onText?: (chunk: string) => void;
    /** Phase 14B: 覆盖角色片段（如 Agent 蓝图的 systemPrompt） */
    roleFragmentOverride?: string;
    /** Phase 14B: 仅使用名称在此列表中的工具；未配置则用全局合并结果 */
    toolsFilter?: string[];
    /** Phase 14B: 写入 ops.log 的 Agent 实例/蓝图 id */
    agentId?: string;
    blueprintId?: string;
    /** Phase 14B WO-1439: 局部记忆 — 使用该 scope 的 store 做检索；includeGlobal 时合并全局只读 */
    localMemoryScope?: {
        workspaceId: string;
        retrieveLimit: number;
        includeGlobal?: boolean;
    };
    /** Phase 14C: 覆盖工具列表（如含 delegate_to_agent）；未传则用 getMergedTools + write_slot */
    toolsOverride?: ToolDef[];
}): Promise<{
    content: string;
    messages: Message[];
    sessionId: string;
    citedMemoryIds?: string[];
}>;
