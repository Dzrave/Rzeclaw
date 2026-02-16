/**
 * Append-only JSONL store (one file per workspace). No native deps; satisfies IMemoryStore.
 */

import { readFile, appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MemoryEntry, MemoryEntryInsert, Validity } from "./types.js";
import type { IMemoryStore, QueryConditions } from "./store-interface.js";

const FILENAME = "memory.jsonl";
const COLD_SUFFIX = "_cold.jsonl";

function getMemoryDir(workspaceDir: string): string {
  return path.join(workspaceDir, ".rzeclaw", "memory");
}

/** WO-407: 热存储文件路径（供冷归档读取/重写） */
export function getHotFilePath(workspaceDir: string, workspaceId?: string): string {
  const dir = getMemoryDir(workspaceDir);
  return workspaceId ? path.join(dir, `${workspaceId}.jsonl`) : path.join(dir, FILENAME);
}

/** WO-407: 冷存储文件路径 */
export function getColdFilePath(workspaceDir: string, workspaceId?: string): string {
  const dir = getMemoryDir(workspaceDir);
  return workspaceId ? path.join(dir, `${workspaceId}${COLD_SUFFIX}`) : path.join(dir, "memory_cold.jsonl");
}

function parseLine(line: string): MemoryEntry | null {
  const t = line.trim();
  if (!t) return null;
  try {
    return JSON.parse(t) as MemoryEntry;
  } catch {
    return null;
  }
}

export class JsonlMemoryStore implements IMemoryStore {
  constructor(private readonly filePath: string) {}

  private async ensureDir(): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
  }

  async append(entry: MemoryEntryInsert): Promise<void> {
    await this.ensureDir();
    const created_at = entry.created_at ?? new Date().toISOString();
    const row: MemoryEntry = {
      ...entry,
      created_at,
      validity: entry.validity ?? "active",
    } as MemoryEntry;
    const line = JSON.stringify(row) + "\n";
    await appendFile(this.filePath, line);
  }

  async query_by_condition(conditions: QueryConditions): Promise<MemoryEntry[]> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf-8");
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return [];
      throw e;
    }
    const lines = raw.split("\n").filter(Boolean);
    let entries = lines.map(parseLine).filter((e): e is MemoryEntry => e != null);

    if (conditions.validity != null) {
      entries = entries.filter((e) => e.validity === conditions.validity);
    }
    if (conditions.content_type != null) {
      entries = entries.filter((e) => e.content_type === conditions.content_type);
    }
    if (conditions.session_id != null) {
      entries = entries.filter((e) => e.provenance.session_id === conditions.session_id);
    }
    if (conditions.workspace_id != null) {
      entries = entries.filter((e) => e.workspace_id === conditions.workspace_id);
    }
    if (conditions.created_after != null) {
      entries = entries.filter((e) => e.created_at >= conditions.created_after!);
    }
    if (conditions.task_hint != null) {
      const kw = conditions.task_hint.toLowerCase();
      entries = entries.filter(
        (e) => e.task_hint != null && e.task_hint.toLowerCase().includes(kw)
      );
    }
    if (conditions.layer != null) {
      entries = entries.filter((e) => e.layer === conditions.layer);
    }

    entries.sort((a, b) => (b.created_at > a.created_at ? 1 : -1));
    const limit = conditions.limit ?? 50;
    return entries.slice(0, limit);
  }

  async get_provenance(id: string): Promise<MemoryEntry["provenance"] | null> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf-8");
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return null;
      throw e;
    }
    for (const line of raw.split("\n").filter(Boolean)) {
      const e = parseLine(line);
      if (e?.id === id) return e.provenance;
    }
    return null;
  }

  async update_validity(id: string, validity: Validity): Promise<void> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf-8");
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return;
      throw e;
    }
    const lines = raw.split("\n").filter(Boolean);
    let found = false;
    const updated = lines.map((line) => {
      const e = parseLine(line);
      if (e?.id === id) {
        found = true;
        return JSON.stringify({ ...e, validity }) + "\n";
      }
      return line + "\n";
    });
    if (found) await writeFile(this.filePath, updated.join(""));
  }
}

export function createStore(workspaceDir: string, workspaceId?: string): IMemoryStore {
  return new JsonlMemoryStore(getHotFilePath(workspaceDir, workspaceId));
}

/** WO-407: 冷存储 Store，默认检索不包含冷数据，需显式传入 coldStore + includeCold */
export function createColdStore(workspaceDir: string, workspaceId?: string): IMemoryStore {
  return new JsonlMemoryStore(getColdFilePath(workspaceDir, workspaceId));
}
