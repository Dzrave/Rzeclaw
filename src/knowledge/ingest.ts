/**
 * Phase 11 WO-1102/1103: 知识库摄取 — 单文件/批量读入、分块、写入 L1。
 */

import { readFile } from "node:fs/promises";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { IMemoryStore } from "../memory/store-interface.js";
import type { MemoryEntryInsert } from "../memory/types.js";
import { createStore } from "../memory/store-jsonl.js";

const CHUNK_MAX_CHARS = 2000;
const INGEST_EXTENSIONS = new Set([".md", ".txt", ".json", ".rst"]);

/**
 * 按段落与长度分块；单块不超过 CHUNK_MAX_CHARS。
 */
function chunkText(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const paragraphs = trimmed.split(/\n\s*\n/).filter((p) => p.trim());
  const chunks: string[] = [];
  let current = "";
  for (const p of paragraphs) {
    if (current.length + p.length + 2 > CHUNK_MAX_CHARS && current.length > 0) {
      chunks.push(current.trim());
      current = "";
    }
    current += (current ? "\n\n" : "") + p;
  }
  if (current.trim()) chunks.push(current.trim());
  if (chunks.length === 0 && trimmed.length > 0) {
    for (let i = 0; i < trimmed.length; i += CHUNK_MAX_CHARS) {
      chunks.push(trimmed.slice(i, i + CHUNK_MAX_CHARS));
    }
  }
  return chunks;
}

export type IngestFileResult = { path: string; chunksWritten: number; error?: string };

/**
 * WO-1102: 单文件摄取 — 读文件、分块、以 L1 document 写入 store。
 */
export async function ingestFile(
  workspaceRoot: string,
  relativePath: string,
  store: IMemoryStore,
  options: { workspaceId?: string; batchId: string; taskHint?: string }
): Promise<IngestFileResult> {
  const fullPath = path.resolve(workspaceRoot, relativePath);
  try {
    const raw = await readFile(fullPath, "utf-8");
    const chunks = chunkText(raw);
    const workspaceId = options.workspaceId ?? workspaceRoot;
    for (const content of chunks) {
      if (!content.trim()) continue;
      const entry: MemoryEntryInsert = {
        id: randomUUID(),
        content,
        content_type: "document",
        provenance: {
          source_type: "system",
          session_id: `ingest-${options.batchId}`,
          source_path: relativePath,
          ingest_batch_id: options.batchId,
        },
        layer: "L1",
        workspace_id: workspaceId,
        task_hint: options.taskHint ?? relativePath,
      };
      await store.append(entry);
    }
    return { path: relativePath, chunksWritten: chunks.length };
  } catch (e) {
    return {
      path: relativePath,
      chunksWritten: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * 收集目录下所有可摄取文件（按扩展名过滤）。
 */
async function collectFiles(
  workspaceRoot: string,
  dirOrFile: string,
  seen: Set<string>,
  out: string[]
): Promise<void> {
  const full = path.resolve(workspaceRoot, dirOrFile);
  const st = await stat(full).catch(() => null);
  if (!st) return;
  if (st.isFile()) {
    const ext = path.extname(dirOrFile).toLowerCase();
    if (INGEST_EXTENSIONS.has(ext) && !seen.has(dirOrFile)) {
      seen.add(dirOrFile);
      out.push(dirOrFile);
    }
    return;
  }
  if (!st.isDirectory()) return;
  const entries = await readdir(full, { withFileTypes: true });
  for (const e of entries) {
    const rel = path.join(dirOrFile, e.name);
    if (e.isDirectory()) await collectFiles(workspaceRoot, rel, seen, out);
    else {
      const ext = path.extname(e.name).toLowerCase();
      if (INGEST_EXTENSIONS.has(ext) && !seen.has(rel)) {
        seen.add(rel);
        out.push(rel);
      }
    }
  }
}

export type IngestResult = {
  ok: number;
  skipped: number;
  failed: number;
  details: IngestFileResult[];
};

/**
 * WO-1103: 批量摄取 — 扫描 ingestPaths，按扩展名过滤，逐个单文件摄取。
 */
export async function ingestPaths(
  workspaceRoot: string,
  paths: string[],
  options: { workspaceId?: string } = {}
): Promise<IngestResult> {
  const store = createStore(workspaceRoot, options.workspaceId);
  const batchId = randomUUID().slice(0, 8);
  const workspaceId = options.workspaceId ?? path.resolve(workspaceRoot);
  const seen = new Set<string>();
  const files: string[] = [];
  for (const p of paths) {
    await collectFiles(workspaceRoot, p, seen, files);
  }
  const details: IngestFileResult[] = [];
  let ok = 0;
  let failed = 0;
  for (const rel of files) {
    const result = await ingestFile(workspaceRoot, rel, store, {
      workspaceId,
      batchId,
      taskHint: rel,
    });
    details.push(result);
    if (result.error) failed++;
    else ok++;
  }
  return {
    ok,
    skipped: paths.length > 0 ? Math.max(0, paths.length - files.length) : 0,
    failed,
    details,
  };
}
