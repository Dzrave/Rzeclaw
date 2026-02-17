/**
 * Memory unit schema (L1/L2). Immutable id; append-only; provenance for traceability.
 */
export type ContentType = "fact" | "summary" | "preference" | "task_outcome" | "tool_experience" | "document";
export type Validity = "active" | "superseded" | "contradicted";
export type SourceType = "user" | "model" | "tool" | "system";
export interface Provenance {
    source_type: SourceType;
    session_id: string;
    turn_index?: number;
    message_id?: string;
    quote_start?: number;
    quote_end?: number;
    /** Phase 11: 摄取来源文件路径 */
    source_path?: string;
    /** Phase 11: 摄取批次 id */
    ingest_batch_id?: string;
}
export interface MemoryEntry {
    id: string;
    content: string;
    content_type: ContentType;
    provenance: Provenance;
    task_hint?: string;
    validity?: Validity;
    created_at: string;
    supersedes_id?: string;
    workspace_id?: string;
    layer?: "L1" | "L2";
}
export type MemoryEntryInsert = Omit<MemoryEntry, "created_at"> & {
    created_at?: string;
};
