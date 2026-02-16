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
    onText?: (chunk: string) => void;
}): Promise<{
    content: string;
    messages: Message[];
    sessionId: string;
    citedMemoryIds?: string[];
}>;
