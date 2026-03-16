/**
 * WO-1542/1543/1544/1545/1547: 结果存储、过期、查询、按 session 列表、过期清理
 * 设计依据: docs/TASK_GATEWAY_DECOUPLING_DESIGN.md §2.3、§4
 */

import type { ChatResponseEvent } from "../event-bus/schema.js";
import type { TaskResultRecord, TaskStatus } from "./types.js";
import { join } from "node:path";
import { mkdir, writeFile, readFile, unlink, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";

const DEFAULT_RETENTION_MINUTES = 24 * 60; // 24h
const memory = new Map<string, TaskResultRecord>();

function expiresAtFromNow(retentionMinutes: number): string {
  return new Date(Date.now() + retentionMinutes * 60 * 1000).toISOString();
}

/**
 * WO-1541: 创建任务记录（status=pending）。
 */
export function createTask(
  correlationId: string,
  sessionId?: string,
  retentionMinutes: number = DEFAULT_RETENTION_MINUTES
): void {
  const now = new Date().toISOString();
  memory.set(correlationId, {
    correlationId,
    sessionId,
    status: "pending",
    expiresAt: expiresAtFromNow(retentionMinutes),
    createdAt: now,
  });
}

/**
 * WO-1541: 将任务置为 running。
 */
export function setTaskRunning(correlationId: string): void {
  const t = memory.get(correlationId);
  if (t) t.status = "running";
}

/**
 * WO-1542/1543: 任务完成，写入结果存储（内存 + 可选持久化）。
 */
export function setTaskCompleted(
  correlationId: string,
  response: ChatResponseEvent,
  options?: { workspace?: string; retentionMinutes?: number }
): void {
  const retention = options?.retentionMinutes ?? DEFAULT_RETENTION_MINUTES;
  const now = new Date().toISOString();
  let t = memory.get(correlationId);
  if (!t) {
    t = {
      correlationId,
      sessionId: undefined,
      status: "completed",
      expiresAt: expiresAtFromNow(retention),
      createdAt: now,
    };
    memory.set(correlationId, t);
  }
  t.status = "completed";
  t.content = response.content;
  t.error = response.error;
  t.citedMemoryIds = response.citedMemoryIds;
  t.completedAt = now;
  t.expiresAt = expiresAtFromNow(retention);

  if (options?.workspace) {
    const dir = join(options.workspace, ".rzeclaw", "task_results");
    mkdir(dir, { recursive: true })
      .then(() =>
        writeFile(
          join(dir, `${correlationId.replace(/[/\\]/g, "_")}.json`),
          JSON.stringify(t),
          "utf-8"
        )
      )
      .catch(() => {});
  }
}

/**
 * WO-1542/1543: 任务失败。
 */
export function setTaskFailed(
  correlationId: string,
  error: string,
  options?: { workspace?: string; retentionMinutes?: number }
): void {
  const retention = options?.retentionMinutes ?? DEFAULT_RETENTION_MINUTES;
  const now = new Date().toISOString();
  let t = memory.get(correlationId);
  if (!t) {
    t = {
      correlationId,
      sessionId: undefined,
      status: "failed",
      expiresAt: expiresAtFromNow(retention),
      createdAt: now,
    };
    memory.set(correlationId, t);
  }
  t.status = "failed";
  t.error = error;
  t.completedAt = now;
  t.expiresAt = expiresAtFromNow(retention);

  if (options?.workspace) {
    const dir = join(options.workspace, ".rzeclaw", "task_results");
    mkdir(dir, { recursive: true })
      .then(() =>
        writeFile(
          join(dir, `${correlationId.replace(/[/\\]/g, "_")}.json`),
          JSON.stringify(t),
          "utf-8"
        )
      )
      .catch(() => {});
  }
}

/**
 * WO-1544: 按 correlationId 查询；若已过期返回 null 或标记过期。
 */
export async function getResult(
  correlationId: string,
  options?: { workspace?: string }
): Promise<TaskResultRecord | { status: "expired" } | null> {
  const t = memory.get(correlationId);
  if (t) {
    if (new Date(t.expiresAt) <= new Date()) return { status: "expired" };
    return t;
  }
  if (options?.workspace) {
    const file = join(options.workspace, ".rzeclaw", "task_results", `${correlationId.replace(/[/\\]/g, "_")}.json`);
    if (existsSync(file)) {
      try {
        const raw = await readFile(file, "utf-8");
        const parsed = JSON.parse(raw) as TaskResultRecord;
        if (new Date(parsed.expiresAt) <= new Date()) return { status: "expired" };
        memory.set(correlationId, parsed);
        return parsed;
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** 同步版 getResult（仅查内存） */
export function getResultSync(correlationId: string): TaskResultRecord | { status: "expired" } | null {
  const t = memory.get(correlationId);
  if (!t) return null;
  if (new Date(t.expiresAt) <= new Date()) return { status: "expired" };
  return t;
}

/**
 * WO-1545: 按 sessionId 列出最近 N 条任务的 correlationId、status、completedAt。
 */
export function listBySession(sessionId: string, limit: number = 20): Array<{ correlationId: string; status: TaskStatus; completedAt?: string }> {
  const list: Array<{ correlationId: string; status: TaskStatus; completedAt?: string }> = [];
  for (const t of memory.values()) {
    if (t.sessionId === sessionId) {
      list.push({
        correlationId: t.correlationId,
        status: t.status,
        completedAt: t.completedAt,
      });
    }
  }
  list.sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
  return list.slice(0, limit);
}

/**
 * WO-1547: 清理内存与磁盘中已过期的记录。
 */
export async function cleanupExpired(workspace?: string): Promise<{ deleted: number }> {
  const now = new Date();
  let deleted = 0;
  for (const [id, t] of memory.entries()) {
    if (new Date(t.expiresAt) <= now) {
      memory.delete(id);
      deleted++;
      if (workspace) {
        const file = join(workspace, ".rzeclaw", "task_results", `${id.replace(/[/\\]/g, "_")}.json`);
        try {
          await unlink(file);
        } catch (_) {}
      }
    }
  }
  if (workspace) {
    const dir = join(workspace, ".rzeclaw", "task_results");
    if (existsSync(dir)) {
      const files = await readdir(dir).catch(() => []);
      for (const f of files) {
        if (f.endsWith(".json")) {
          const path = join(dir, f);
          try {
            const raw = await readFile(path, "utf-8");
            const t = JSON.parse(raw) as TaskResultRecord;
            if (new Date(t.expiresAt) <= now) {
              await unlink(path);
              deleted++;
            }
          } catch (_) {}
        }
      }
    }
  }
  return { deleted };
}
