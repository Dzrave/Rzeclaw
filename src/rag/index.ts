/**
 * RAG-1: 向量层统一入口。embed/search 抽象；内源 skills/flows 索引与检索。
 */

import type { RzeclawConfig } from "../config.js";
import { getEmbeddingProvider } from "./embed-client.js";
import { searchVectors, writeVectors } from "./store.js";
import type { SearchHit } from "./store.js";
import { listFlows } from "../flows/crud.js";
import { loadSkillsFromDir } from "../skills/load.js";
import { indexMotivation } from "./motivation.js";

const DEFAULT_INDEX_PATH = ".rzeclaw/embeddings";

function getIndexStoragePath(config: RzeclawConfig): string {
  return config.vectorEmbedding?.indexStoragePath ?? DEFAULT_INDEX_PATH;
}

function isCollectionEnabled(config: RzeclawConfig, collection: string): boolean {
  if (!config.vectorEmbedding?.enabled) return false;
  const coll = config.vectorEmbedding.collections?.[collection];
  return coll?.enabled === true;
}

/**
 * 对文本列表做向量嵌入；未配置或未启用时返回空数组。
 */
export async function embed(config: RzeclawConfig, texts: string[]): Promise<number[][]> {
  const provider = getEmbeddingProvider(config);
  if (!provider || texts.length === 0) return [];
  return provider.embed(texts);
}

/**
 * 在指定集合内检索；未启用或无 provider 时返回 []。query 会先被 embed 再检索。
 */
export async function search(
  config: RzeclawConfig,
  workspace: string,
  collection: string,
  query: string,
  topK: number
): Promise<SearchHit[]> {
  if (!isCollectionEnabled(config, collection)) return [];
  const provider = getEmbeddingProvider(config);
  if (!provider) return [];
  const indexStoragePath = getIndexStoragePath(config);
  const [queryEmb] = await provider.embed([query]);
  if (!queryEmb?.length) return [];
  return searchVectors(workspace, indexStoragePath, collection, queryEmb, topK);
}

/**
 * RAG-1: 从流程库元数据生成 flows 集合索引（flowId + type 作为可检索文本）。
 */
export async function indexFlows(
  config: RzeclawConfig,
  workspace: string,
  libraryPath: string
): Promise<{ indexed: number; errors: string[] }> {
  if (!config.vectorEmbedding?.enabled || !isCollectionEnabled(config, "flows")) {
    return { indexed: 0, errors: [] };
  }
  const provider = getEmbeddingProvider(config);
  if (!provider) return { indexed: 0, errors: ["vectorEmbedding provider not configured"] };
  const indexStoragePath = getIndexStoragePath(config);
  const list = await listFlows(workspace, libraryPath);
  const errors: string[] = [];
  const texts = list.map((e) => `${e.flowId} ${e.type}`);
  if (texts.length === 0) return { indexed: 0, errors: [] };
  try {
    const embeddings = await provider.embed(texts);
    const entries = list.map((e, i) => ({
      id: e.flowId,
      embedding: embeddings[i] ?? [],
      metadata: { type: e.type, flowId: e.flowId },
    }));
    const valid = entries.filter((e) => e.embedding.length > 0);
    await writeVectors(workspace, indexStoragePath, "flows", valid);
    return { indexed: valid.length, errors };
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
    return { indexed: 0, errors };
  }
}

/**
 * RAG-1: 从 Skill 目录生成 skills 集合索引（name + description）。
 */
export async function indexSkills(
  config: RzeclawConfig,
  workspace: string
): Promise<{ indexed: number; errors: string[] }> {
  if (!config.vectorEmbedding?.enabled || !isCollectionEnabled(config, "skills")) {
    return { indexed: 0, errors: [] };
  }
  const provider = getEmbeddingProvider(config);
  if (!provider) return { indexed: 0, errors: ["vectorEmbedding provider not configured"] };
  const skillsDir = config.skills?.dir ?? ".rzeclaw/skills";
  const skills = await loadSkillsFromDir(workspace, skillsDir);
  const errors: string[] = [];
  if (skills.length === 0) return { indexed: 0, errors: [] };
  const texts = skills.map((s) => `${s.name} ${s.description}`);
  try {
    const embeddings = await provider.embed(texts);
    const indexStoragePath = getIndexStoragePath(config);
    const entries = skills.map((s, i) => ({
      id: s.name,
      embedding: embeddings[i] ?? [],
      metadata: { name: s.name, description: s.description?.slice(0, 200) },
    }));
    const valid = entries.filter((e) => e.embedding.length > 0);
    await writeVectors(workspace, indexStoragePath, "skills", valid);
    return { indexed: valid.length, errors };
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
    return { indexed: 0, errors };
  }
}

export { getEmbeddingProvider, cosineSimilarity, normalizeL2 } from "./embed-client.js";
export type { EmbeddingProvider } from "./embed-client.js";
export { addVector, searchVectors, writeVectors } from "./store.js";
export type { VectorEntry, SearchHit } from "./store.js";
export {
  readMotivationEntries,
  writeMotivationEntries,
  indexMotivation,
  addMotivationEntry,
} from "./motivation.js";
export type { MotivationEntry, MotivationTranslated } from "./motivation.js";

/** RAG-3: 外源灌入 — 将文档列表 embed 后写入指定集合 */
export async function ingestToCollection(
  config: RzeclawConfig,
  workspace: string,
  collection: string,
  documents: Array<{ id: string; text: string; metadata?: Record<string, unknown> }>
): Promise<{ indexed: number; errors: string[] }> {
  if (!config.vectorEmbedding?.enabled) return { indexed: 0, errors: ["vectorEmbedding disabled"] };
  const provider = getEmbeddingProvider(config);
  if (!provider) return { indexed: 0, errors: ["vectorEmbedding provider not configured"] };
  const coll = config.vectorEmbedding.collections?.[collection];
  if (!coll?.enabled) return { indexed: 0, errors: [`collection ${collection} not enabled`] };
  const indexStoragePath = getIndexStoragePath(config);
  const errors: string[] = [];
  const texts = documents.map((d) => d.text);
  if (texts.length === 0) return { indexed: 0, errors: [] };
  try {
    const embeddings = await provider.embed(texts);
    const entries = documents.map((d, i) => ({
      id: d.id,
      embedding: embeddings[i] ?? [],
      metadata: d.metadata,
    }));
    const valid = entries.filter((e) => e.embedding.length > 0);
    await writeVectors(workspace, indexStoragePath, collection, valid);
    return { indexed: valid.length, errors };
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
    return { indexed: 0, errors };
  }
}

/**
 * RAG-1 热重载：按集合名重建索引。设计 §2.1.3 显式 API/命令触发。
 * collection 为 "flows"|"skills"|"motivation" 时从可读源重建；其他集合仅支持外源灌入，需先 ingestToCollection。
 */
export async function reindexCollection(
  config: RzeclawConfig,
  workspace: string,
  collection: "flows" | "skills" | "motivation",
  libraryPath?: string
): Promise<{ indexed: number; errors: string[] }> {
  if (collection === "flows") {
    const lib = libraryPath ?? config.flows?.libraryPath;
    if (!lib) return { indexed: 0, errors: ["flows 需要 libraryPath"] };
    return indexFlows(config, workspace, lib);
  }
  if (collection === "skills") return indexSkills(config, workspace);
  if (collection === "motivation") return indexMotivation(config, workspace);
  return { indexed: 0, errors: [`不支持的集合: ${collection}`] };
}

/** RAG-3: 为 flow 绑定的外源集合做检索，返回可拼入 LLM 上下文的文本 */
export async function getRagContextForFlow(
  config: RzeclawConfig,
  workspace: string,
  externalCollections: string[],
  query: string,
  topKPerCollection: number
): Promise<string> {
  if (!externalCollections.length) return "";
  const parts: string[] = [];
  for (const coll of externalCollections) {
    const hits = await search(config, workspace, coll, query, topKPerCollection);
    if (hits.length > 0) {
      const ids = hits.map((h) => h.id).join(", ");
      parts.push(`[${coll}] 相关条目: ${ids}`);
    }
  }
  return parts.length > 0 ? `RAG 检索:\n${parts.join("\n")}` : "";
}
