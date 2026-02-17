/**
 * Memory retrieval: query by conditions, return entries with provenance.
 * WO-302: task-aware scoring when task_hint is provided (keyword overlap + time).
 */
import type { IMemoryStore } from "./store-interface.js";
import type { MemoryEntry } from "./types.js";
export type RetrieveOptions = {
    workspace_id?: string;
    limit?: number;
    content_type?: string;
    validity?: string;
    task_hint?: string;
    created_after?: string;
    /** Phase 11 WO-1105: 仅 L1、仅 L2 或不过滤 */
    layer?: "L1" | "L2";
    includeCold?: boolean;
    coldStore?: IMemoryStore;
};
export declare function retrieve(store: IMemoryStore, query: string, options?: RetrieveOptions): Promise<MemoryEntry[]>;
/**
 * Format MemoryEntry[] as cited blocks for injection into context.
 */
export declare function formatAsCitedBlocks(entries: MemoryEntry[]): string;
export declare const MEMORY_SYSTEM_INSTRUCTION = "\u4EE5\u4E0B\u4E3A\u6765\u81EA\u957F\u671F\u8BB0\u5FC6\u7684\u53EF\u9760\u5185\u5BB9\uFF0C\u8BF7\u4EC5\u57FA\u4E8E\u6B64\u4F5C\u7B54\uFF1B\u82E5\u5F15\u7528\u67D0\u6761\uFF0C\u8BF7\u6807\u660E\u5176 Memory#id\u3002\u82E5\u8BB0\u5FC6\u4E2D\u65E0\u76F8\u5173\u4FE1\u606F\uFF0C\u8BF7\u660E\u786E\u8BF4\u660E\u3002";
