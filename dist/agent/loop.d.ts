import type { RzeclawConfig } from "../config.js";
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
    onText?: (chunk: string) => void;
}): Promise<{
    content: string;
    messages: Message[];
    sessionId: string;
    citedMemoryIds?: string[];
}>;
