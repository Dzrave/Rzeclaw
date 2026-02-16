/**
 * L1 write pipeline: from session messages generate summary + facts and append to store.
 */
import type { RzeclawConfig } from "../config.js";
import type { Message } from "../agent/context.js";
import type { IMemoryStore } from "./store-interface.js";
export declare function flushToL1(params: {
    config: RzeclawConfig;
    sessionId: string;
    messages: Message[];
    store: IMemoryStore;
    workspaceId?: string;
    taskHint?: string;
}): Promise<{
    summary: string;
    factCount: number;
}>;
/** WO-505: 仅生成 L0 会话内摘要（不写 L1），供多轮时「每 M 轮摘要 + 最近轮」使用。 */
export declare function generateL0Summary(params: {
    config: RzeclawConfig;
    messages: Message[];
}): Promise<string>;
