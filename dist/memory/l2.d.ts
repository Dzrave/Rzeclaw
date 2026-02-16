/**
 * WO-303/304: L2 存储与从 L1 的推进。同一存储、layer='L2'；去重；可选冲突时写新条并标 supersedes_id/validity。
 */
import type { IMemoryStore } from "./store-interface.js";
export type PromoteL1ToL2Options = {
    workspace_id: string;
    /** 只推进该时间之后创建的 L1 条目（ISO） */
    created_after?: string;
    /** 最多推进条数 */
    limit?: number;
};
/**
 * 从 L1 推进到 L2：去重后追加，不静默覆盖。
 * 若某条与已有 L2 重复则跳过；冲突检测为轻量启发式（同 task_hint + 否定词可标 supersedes，此处仅做去重）。
 */
export declare function promoteL1ToL2(store: IMemoryStore, options: PromoteL1ToL2Options): Promise<{
    promoted: number;
    skipped: number;
}>;
/**
 * 当写入一条「修正/否定」时，将旧条目标记为 contradicted，新条已在 append 时带 supersedes_id。
 * 由调用方在 append 后调用。
 */
export declare function markSuperseded(store: IMemoryStore, oldEntryId: string): Promise<void>;
