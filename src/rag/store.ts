/**
 * RAG-1: 按集合存储向量索引（文件 JSON），支持 add 与 cosine 检索。
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { cosineSimilarity, normalizeL2 } from "./embed-client.js";

export type VectorEntry = {
  id: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
};

function collectionPath(workspace: string, indexStoragePath: string, collection: string): string {
  const safe = collection.replace(/[/\\]/g, "_").trim() || "default";
  return join(workspace, indexStoragePath, safe, "vectors.json");
}

async function loadEntries(
  workspace: string,
  indexStoragePath: string,
  collection: string
): Promise<VectorEntry[]> {
  const file = collectionPath(workspace, indexStoragePath, collection);
  try {
    const raw = await readFile(file, "utf-8");
    const data = JSON.parse(raw) as { entries?: VectorEntry[] };
    return Array.isArray(data.entries) ? data.entries : [];
  } catch {
    return [];
  }
}

async function saveEntries(
  workspace: string,
  indexStoragePath: string,
  collection: string,
  entries: VectorEntry[]
): Promise<void> {
  const file = collectionPath(workspace, indexStoragePath, collection);
  const dir = join(workspace, indexStoragePath, collection.replace(/[/\\]/g, "_").trim() || "default");
  await mkdir(dir, { recursive: true });
  await writeFile(file, JSON.stringify({ entries }, null, 0), "utf-8");
}

export type SearchHit = { id: string; score: number; metadata?: Record<string, unknown> };

/**
 * 向集合追加一条向量；若 id 已存在则覆盖。
 */
export async function addVector(
  workspace: string,
  indexStoragePath: string,
  collection: string,
  id: string,
  embedding: number[],
  metadata?: Record<string, unknown>
): Promise<void> {
  const entries = await loadEntries(workspace, indexStoragePath, collection);
  const normalized = normalizeL2(embedding);
  const idx = entries.findIndex((e) => e.id === id);
  const entry: VectorEntry = { id, embedding: normalized, metadata };
  if (idx >= 0) entries[idx] = entry;
  else entries.push(entry);
  await saveEntries(workspace, indexStoragePath, collection, entries);
}

/**
 * 批量写入（替换同 id）；用于重建索引。
 */
export async function writeVectors(
  workspace: string,
  indexStoragePath: string,
  collection: string,
  entries: VectorEntry[]
): Promise<void> {
  const normalized = entries.map((e) => ({
    ...e,
    embedding: normalizeL2(e.embedding),
  }));
  await saveEntries(workspace, indexStoragePath, collection, normalized);
}

/**
 * 在集合内做余弦相似度检索；queryEmbedding 会被归一化。
 */
export async function searchVectors(
  workspace: string,
  indexStoragePath: string,
  collection: string,
  queryEmbedding: number[],
  topK: number
): Promise<SearchHit[]> {
  const entries = await loadEntries(workspace, indexStoragePath, collection);
  if (entries.length === 0) return [];
  const q = normalizeL2(queryEmbedding);
  const scored = entries.map((e) => ({
    id: e.id,
    score: cosineSimilarity(q, e.embedding),
    metadata: e.metadata,
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}
