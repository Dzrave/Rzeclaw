/**
 * Append-only JSONL store (one file per workspace). No native deps; satisfies IMemoryStore.
 */
import type { MemoryEntry, MemoryEntryInsert, Validity } from "./types.js";
import type { IMemoryStore, QueryConditions } from "./store-interface.js";
/** WO-407: 热存储文件路径（供冷归档读取/重写） */
export declare function getHotFilePath(workspaceDir: string, workspaceId?: string): string;
/** WO-407: 冷存储文件路径 */
export declare function getColdFilePath(workspaceDir: string, workspaceId?: string): string;
export declare class JsonlMemoryStore implements IMemoryStore {
    private readonly filePath;
    constructor(filePath: string);
    private ensureDir;
    append(entry: MemoryEntryInsert): Promise<void>;
    query_by_condition(conditions: QueryConditions): Promise<MemoryEntry[]>;
    get_provenance(id: string): Promise<MemoryEntry["provenance"] | null>;
    update_validity(id: string, validity: Validity): Promise<void>;
}
export declare function createStore(workspaceDir: string, workspaceId?: string): IMemoryStore;
/** WO-407: 冷存储 Store，默认检索不包含冷数据，需显式传入 coldStore + includeCold */
export declare function createColdStore(workspaceDir: string, workspaceId?: string): IMemoryStore;
