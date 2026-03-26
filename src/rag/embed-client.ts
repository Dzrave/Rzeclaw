/**
 * RAG-1: 向量嵌入客户端。按配置调用 Ollama 或 OpenAI 兼容的 /embeddings 接口。
 */

import type { RezBotConfig } from "../config.js";

export type EmbeddingProvider = {
  embed(texts: string[]): Promise<number[][]>;
};

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/** 内联归一化后余弦相似度等价于点积；检索时用点积即可 */
export function normalizeL2(vec: number[]): number[] {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) sum += vec[i]! * vec[i]!;
  const norm = Math.sqrt(sum) || 1;
  return vec.map((x) => x / norm);
}

async function fetchEmbeddings(
  endpoint: string,
  model: string,
  texts: string[],
  isOllama: boolean
): Promise<number[][]> {
  const url = isOllama ? `${endpoint.replace(/\/$/, "")}/api/embeddings` : `${endpoint.replace(/\/$/, "")}/embeddings`;
  const body = isOllama
    ? { model, prompt: texts.length === 1 ? texts[0] : texts }
    : { model, input: texts };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Embedding API error ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    data?: Array<{ embedding: number[] }>;
    embeddings?: number[][];
  };
  if (isOllama && Array.isArray(data.embeddings)) {
    return data.embeddings;
  }
  if (Array.isArray(data.data)) {
    return data.data.map((d) => d.embedding);
  }
  throw new Error("Unexpected embedding API response shape");
}

export function getEmbeddingProvider(config: RezBotConfig): EmbeddingProvider | null {
  const ve = config.vectorEmbedding;
  if (!ve?.enabled || !ve.endpoint || !ve.model) return null;
  const provider = ve.provider ?? "ollama";
  const endpoint = ve.endpoint;
  const model = ve.model;
  return {
    async embed(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];
      const isOllama = provider === "ollama";
      if (isOllama && texts.length > 1) {
        const results: number[][] = [];
        for (const t of texts) {
          const one = await fetchEmbeddings(endpoint, model, [t], true);
          results.push(one[0] ?? []);
        }
        return results;
      }
      return fetchEmbeddings(endpoint, model, texts, isOllama);
    },
  };
}

export { cosineSimilarity };
