import type { MemoryEntry, MemoryEntryInsert, Validity } from "./types.js";

export type QueryConditions = {
  content_type?: string;
  validity?: string;
  session_id?: string;
  task_hint?: string; // keyword match
  created_after?: string; // ISO
  workspace_id?: string;
  limit?: number;
  /** WO-303: filter by layer (L1 vs L2) */
  layer?: "L1" | "L2";
};

export interface IMemoryStore {
  append(entry: MemoryEntryInsert): Promise<void>;
  query_by_condition(conditions: QueryConditions): Promise<MemoryEntry[]>;
  get_provenance(id: string): Promise<MemoryEntry["provenance"] | null>;
  /** WO-304: update validity of an existing entry (e.g. mark superseded/contradicted). */
  update_validity(id: string, validity: Validity): Promise<void>;
}
