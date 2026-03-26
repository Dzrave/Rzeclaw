/**
 * RAG-2: 动机 RAG 条目 schema、存储路径；与 router_v1 对齐的 translated。
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { RezBotConfig } from "../config.js";
import { getEmbeddingProvider } from "./embed-client.js";
import { addVector, writeVectors } from "./store.js";

const MOTIVATION_DIR = ".rezbot/rag/motivation";
const MOTIVATION_FILE = "entries.json";

/** 与 router_v1 对齐：动机命中后直接驱动 Executor / 会话 FSM */
export type MotivationTranslated = {
  state: "ROUTE_TO_LOCAL_FLOW" | "ESCALATE_TO_CLOUD" | "NO_ACTION" | "UNKNOWN";
  flowId?: string;
  params?: Record<string, unknown>;
  events?: Array<{ action: string; skill_id?: string; [k: string]: unknown }>;
};

export type MotivationEntry = {
  id: string;
  motivation_cluster: string[];
  description: string;
  translated: MotivationTranslated;
  context_requirement?: string;
  confidence_default?: number;
  updated_at?: string;
};

function motivationPath(workspace: string): string {
  return join(workspace, MOTIVATION_DIR, MOTIVATION_FILE);
}

export async function readMotivationEntries(workspace: string): Promise<MotivationEntry[]> {
  const file = motivationPath(workspace);
  try {
    const raw = await readFile(file, "utf-8");
    const data = JSON.parse(raw) as { entries?: MotivationEntry[] } | MotivationEntry[];
    if (Array.isArray(data)) return data;
    return Array.isArray(data.entries) ? data.entries : [];
  } catch {
    return [];
  }
}

export async function writeMotivationEntries(
  workspace: string,
  entries: MotivationEntry[]
): Promise<void> {
  const dir = join(workspace, MOTIVATION_DIR);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, MOTIVATION_FILE),
    JSON.stringify({ entries }, null, 2),
    "utf-8"
  );
}

/**
 * 从条目生成用于 embedding 的文本（motivation_cluster + description）。
 */
function entryToEmbedText(e: MotivationEntry): string {
  const cluster = Array.isArray(e.motivation_cluster)
    ? e.motivation_cluster.join(" ")
    : "";
  return `${cluster} ${e.description ?? ""}`.trim() || e.id;
}

/**
 * RAG-2: 重建 motivation 集合索引（从 entries.json 读取 → embed → 写入向量库）。
 */
export async function indexMotivation(
  config: RezBotConfig,
  workspace: string
): Promise<{ indexed: number; errors: string[] }> {
  if (!config.vectorEmbedding?.enabled) return { indexed: 0, errors: [] };
  const coll = config.vectorEmbedding.collections?.motivation;
  if (!coll?.enabled) return { indexed: 0, errors: [] };
  const provider = getEmbeddingProvider(config);
  if (!provider) return { indexed: 0, errors: ["vectorEmbedding provider not configured"] };
  const entries = await readMotivationEntries(workspace);
  const errors: string[] = [];
  if (entries.length === 0) return { indexed: 0, errors: [] };
  const texts = entries.map(entryToEmbedText);
  const indexStoragePath = config.vectorEmbedding.indexStoragePath ?? ".rezbot/embeddings";
  try {
    const embeddings = await provider.embed(texts);
    const vectorEntries = entries.map((e, i) => ({
      id: e.id,
      embedding: embeddings[i] ?? [],
      metadata: {
        translated: e.translated,
        confidence_default: e.confidence_default,
      },
    }));
    const valid = vectorEntries.filter((v) => v.embedding.length > 0);
    await writeVectors(workspace, indexStoragePath, "motivation", valid);
    return { indexed: valid.length, errors };
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
    return { indexed: 0, errors };
  }
}

/**
 * RAG-2: 追加一条动机条目并写入向量索引（LLM 澄清后固化时调用）。
 */
export async function addMotivationEntry(
  config: RezBotConfig,
  workspace: string,
  entry: MotivationEntry
): Promise<{ success: boolean; error?: string }> {
  const entries = await readMotivationEntries(workspace);
  if (entries.some((e) => e.id === entry.id)) {
    const idx = entries.findIndex((e) => e.id === entry.id);
    entry.updated_at = new Date().toISOString();
    entries[idx] = entry;
  } else {
    entry.updated_at = new Date().toISOString();
    entries.push(entry);
  }
  await writeMotivationEntries(workspace, entries);
  if (!config.vectorEmbedding?.enabled) return { success: true };
  const provider = getEmbeddingProvider(config);
  if (!provider) return { success: true };
  const coll = config.vectorEmbedding.collections?.motivation;
  if (!coll?.enabled) return { success: true };
  const text = entryToEmbedText(entry);
  const indexStoragePath = config.vectorEmbedding.indexStoragePath ?? ".rezbot/embeddings";
  try {
    const [emb] = await provider.embed([text]);
    if (emb?.length) {
      await addVector(workspace, indexStoragePath, "motivation", entry.id, emb, {
        translated: entry.translated,
        confidence_default: entry.confidence_default,
      });
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
