/**
 * Memory retrieval: query by conditions, return entries with provenance.
 * WO-302: task-aware scoring when task_hint is provided (keyword overlap + time).
 */

import type { IMemoryStore, QueryConditions } from "./store-interface.js";
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

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[\s\u3000，。！？、；：""''（）]+/g, " ")
    .split(" ")
    .filter(Boolean);
}

/** Score entry by task/content overlap with query and current task_hint. Higher = more relevant. */
function taskRelevanceScore(
  entry: MemoryEntry,
  queryTokens: string[],
  taskHintTokens: string[]
): number {
  const contentTokens = tokenize(entry.content);
  const hintTokens = entry.task_hint ? tokenize(entry.task_hint) : [];
  const allEntry = new Set([...contentTokens, ...hintTokens]);
  const allQuery = new Set([...queryTokens, ...taskHintTokens]);
  let overlap = 0;
  for (const t of allQuery) {
    if (allEntry.has(t)) overlap += 1;
    else if ([...allEntry].some((e) => e.includes(t) || t.includes(e))) overlap += 0.5;
  }
  return overlap;
}

export async function retrieve(
  store: IMemoryStore,
  query: string,
  options: RetrieveOptions = {}
): Promise<MemoryEntry[]> {
  const limit = options.limit ?? 10;
  const conditions: QueryConditions = {
    workspace_id: options.workspace_id,
    limit: limit * 3,
    content_type: options.content_type,
    validity: options.validity ?? "active",
    created_after: options.created_after,
    layer: options.layer,
  };
  let entries = await store.query_by_condition(conditions);
  if (options.includeCold && options.coldStore) {
    const coldEntries = await options.coldStore.query_by_condition(conditions);
    const hotIds = new Set(entries.map((e) => e.id));
    for (const e of coldEntries) {
      if (!hotIds.has(e.id)) entries.push(e);
    }
  }

  if (query.trim()) {
    const q = query.toLowerCase();
    entries = entries.filter(
      (e) =>
        e.content.toLowerCase().includes(q) ||
        (e.task_hint != null && e.task_hint.toLowerCase().includes(q))
    );
  }

  const queryTokens = tokenize(query);
  const taskHintTokens = options.task_hint ? tokenize(options.task_hint) : [];

  if (taskHintTokens.length > 0 || queryTokens.length > 0) {
    entries = entries
      .map((e) => ({ e, score: taskRelevanceScore(e, queryTokens, taskHintTokens) }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return (b.e.created_at > a.e.created_at ? 1 : -1);
      })
      .map((x) => x.e);
  }

  return entries.slice(0, limit);
}

/**
 * Format MemoryEntry[] as cited blocks for injection into context.
 */
export function formatAsCitedBlocks(entries: MemoryEntry[]): string {
  if (entries.length === 0) return "";
  return entries
    .map(
      (e) =>
        `[Memory#${e.id}] (来自 session ${e.provenance.session_id}${e.provenance.turn_index != null ? ` 第 ${e.provenance.turn_index} 轮` : ""}) ${e.content}`
    )
    .join("\n\n");
}

export const MEMORY_SYSTEM_INSTRUCTION =
  "以下为来自长期记忆的可靠内容，请仅基于此作答；若引用某条，请标明其 Memory#id。若记忆中无相关信息，请明确说明。";
