/**
 * WO-303/304: L2 存储与从 L1 的推进。同一存储、layer='L2'；去重；可选冲突时写新条并标 supersedes_id/validity。
 */
import { randomUUID } from "node:crypto";
function normalizeContent(s) {
    return s.replace(/\s+/g, " ").trim().toLowerCase();
}
/** 与已有 L2 内容是否重复（规范化后一致或高度重叠） */
function isDuplicate(newContent, existingL2) {
    const norm = normalizeContent(newContent);
    for (const e of existingL2) {
        if (normalizeContent(e.content) === norm)
            return true;
        if (e.content.length > 0 && norm.length > 0) {
            const a = norm.length;
            const b = normalizeContent(e.content).length;
            const overlap = [...norm].filter((c) => e.content.toLowerCase().includes(c)).length;
            if (a > 0 && overlap / Math.max(a, b) >= 0.9)
                return true;
        }
    }
    return false;
}
/**
 * 从 L1 推进到 L2：去重后追加，不静默覆盖。
 * 若某条与已有 L2 重复则跳过；冲突检测为轻量启发式（同 task_hint + 否定词可标 supersedes，此处仅做去重）。
 */
export async function promoteL1ToL2(store, options) {
    const created_after = options.created_after ?? new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const limit = options.limit ?? 100;
    const l1Entries = await store.query_by_condition({
        workspace_id: options.workspace_id,
        layer: "L1",
        created_after,
        validity: "active",
        limit,
    });
    const l2Entries = await store.query_by_condition({
        workspace_id: options.workspace_id,
        layer: "L2",
        validity: "active",
        limit: 5000,
    });
    let promoted = 0;
    let skipped = 0;
    for (const e of l1Entries) {
        if (isDuplicate(e.content, l2Entries)) {
            skipped += 1;
            continue;
        }
        const entry = {
            id: randomUUID(),
            content: e.content,
            content_type: e.content_type,
            provenance: e.provenance,
            task_hint: e.task_hint,
            workspace_id: e.workspace_id ?? options.workspace_id,
            layer: "L2",
        };
        await store.append(entry);
        l2Entries.push({
            ...e,
            id: entry.id,
            content: e.content,
            created_at: new Date().toISOString(),
            layer: "L2",
        });
        promoted += 1;
    }
    return { promoted, skipped };
}
/**
 * 当写入一条「修正/否定」时，将旧条目标记为 contradicted，新条已在 append 时带 supersedes_id。
 * 由调用方在 append 后调用。
 */
export async function markSuperseded(store, oldEntryId) {
    await store.update_validity(oldEntryId, "contradicted");
}
