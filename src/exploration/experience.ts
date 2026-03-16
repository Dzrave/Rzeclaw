/**
 * Phase 16 WO-1640/1641/1642/1643: 探索经验存储与复用（文件型，无向量）
 * 可读存储：workspace/.rzeclaw/rag/endogenous/exploration_experience.jsonl
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { PlanVariant } from "./types.js";

/** WO-1640: 探索经验条目 schema */
export type ExplorationExperienceEntry = {
  id: string;
  task_signature: string;
  intent?: string;
  chosen_plan: PlanVariant;
  snapshot_digest?: string;
  created_at: string;
  reuse_count: number;
  last_reused_at?: string;
  outcome_success_count?: number;
  outcome_fail_count?: number;
  last_outcome?: boolean;
  last_token_cost?: number;
  payload?: Record<string, unknown>;
};

const SUBDIR = ".rzeclaw";
const RAG_DIR = "rag";
const ENDOGENOUS_DIR = "endogenous";
const FILENAME = "exploration_experience.jsonl";
const MAX_RECENT = 100;

function getStoragePath(workspace: string): string {
  return join(workspace, SUBDIR, RAG_DIR, ENDOGENOUS_DIR, FILENAME);
}

function ensureDir(filePath: string): void {
  const dir = join(filePath, "..");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/** 读取最近 N 条（从文件末尾往前） */
export function listRecent(workspace: string, limit: number = 50): ExplorationExperienceEntry[] {
  const path = getStoragePath(workspace);
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf-8");
  const lines = raw.split("\n").filter((l) => l.trim());
  const entries: ExplorationExperienceEntry[] = [];
  for (let i = lines.length - 1; i >= 0 && entries.length < limit; i--) {
    try {
      const e = JSON.parse(lines[i]) as ExplorationExperienceEntry;
      if (e.id && e.task_signature && e.chosen_plan) entries.push(e);
    } catch {
      // skip malformed line
    }
  }
  return entries;
}

/** WO-1642 简单匹配：无向量时用任务签名与消息的包含/一致关系给分 */
export function findBestMatch(
  message: string,
  entries: ExplorationExperienceEntry[],
  reuseThreshold: number
): { entry: ExplorationExperienceEntry; score: number } | null {
  const normalized = (message ?? "").trim().toLowerCase();
  if (!normalized) return null;
  let best: { entry: ExplorationExperienceEntry; score: number } | null = null;
  for (const entry of entries) {
    const sig = (entry.task_signature ?? "").trim().toLowerCase();
    let score = 0;
    if (sig === normalized) score = 0.95;
    else if (sig && normalized.includes(sig)) score = 0.88;
    else if (sig && sig.includes(normalized)) score = 0.85;
    if (score >= reuseThreshold && (!best || score > best.score)) {
      best = { entry, score };
    }
  }
  return best;
}

/** WO-1641: 写入新条目 */
export function writeEntry(workspace: string, entry: Omit<ExplorationExperienceEntry, "id" | "created_at" | "reuse_count">): ExplorationExperienceEntry {
  const full: ExplorationExperienceEntry = {
    ...entry,
    id: randomUUID(),
    created_at: new Date().toISOString(),
    reuse_count: 0,
  };
  const path = getStoragePath(workspace);
  ensureDir(path);
  appendFileSync(path, JSON.stringify(full) + "\n", "utf-8");
  return full;
}

/** 更新条目的 reuse_count 与 last_reused_at（按 id 重写该行或整文件） */
export function updateReuseCount(workspace: string, id: string): void {
  const path = getStoragePath(workspace);
  if (!existsSync(path)) return;
  const raw = readFileSync(path, "utf-8");
  const lines = raw.split("\n").filter((l) => l.trim());
  const now = new Date().toISOString();
  let found = false;
  const updated = lines.map((line) => {
    try {
      const e = JSON.parse(line) as ExplorationExperienceEntry;
      if (e.id === id) {
        found = true;
        return JSON.stringify({
          ...e,
          reuse_count: (e.reuse_count ?? 0) + 1,
          last_reused_at: now,
        });
      }
    } catch {
      // keep line as-is
    }
    return line;
  });
  if (found) writeFileSync(path, updated.join("\n") + "\n", "utf-8");
}

/** 按 id 查找条目（用于结果回写，WO-1644） */
export function getEntryById(workspace: string, id: string): ExplorationExperienceEntry | null {
  const path = getStoragePath(workspace);
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf-8");
  const lines = raw.split("\n").filter((l) => l.trim());
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const e = JSON.parse(lines[i]) as ExplorationExperienceEntry;
      if (e.id === id) return e;
    } catch {
      // skip
    }
  }
  return null;
}

/** WO-1644: 执行结果回写 — 按 id 更新 last_outcome、outcome_success_count/outcome_fail_count、last_token_cost */
export function updateOutcome(
  workspace: string,
  id: string,
  outcome: { success: boolean; tokenCount?: number }
): boolean {
  const path = getStoragePath(workspace);
  if (!existsSync(path)) return false;
  const raw = readFileSync(path, "utf-8");
  const lines = raw.split("\n").filter((l) => l.trim());
  let found = false;
  const updated = lines.map((line) => {
    try {
      const e = JSON.parse(line) as ExplorationExperienceEntry;
      if (e.id === id) {
        found = true;
        const successCount = (e.outcome_success_count ?? 0) + (outcome.success ? 1 : 0);
        const failCount = (e.outcome_fail_count ?? 0) + (outcome.success ? 0 : 1);
        return JSON.stringify({
          ...e,
          last_outcome: outcome.success,
          outcome_success_count: successCount,
          outcome_fail_count: failCount,
          last_token_cost: outcome.tokenCount ?? e.last_token_cost,
        });
      }
    } catch {
      // keep as-is
    }
    return line;
  });
  if (found) writeFileSync(path, updated.join("\n") + "\n", "utf-8");
  return found;
}

/** WO-1655: 删除指定 id 的探索经验条目（复盘应用 exploration_trim 时调用） */
export function removeExplorationEntries(workspace: string, ids: string[]): boolean {
  const path = getStoragePath(workspace);
  if (!existsSync(path)) return true;
  const idSet = new Set(ids);
  const raw = readFileSync(path, "utf-8");
  const lines = raw.split("\n").filter((l) => l.trim());
  const kept = lines.filter((line) => {
    try {
      const e = JSON.parse(line) as ExplorationExperienceEntry;
      return !idSet.has(e.id);
    } catch {
      return true;
    }
  });
  writeFileSync(path, kept.join("\n") + (kept.length ? "\n" : ""), "utf-8");
  return true;
}
