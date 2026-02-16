/**
 * Lightweight per-session metrics: tool call count, failure count, total turns.
 * Persisted to a JSON file under workspace or state dir for later analysis.
 */

import { writeFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

export type SessionMetrics = {
  session_id: string;
  tool_call_count: number;
  tool_failure_count: number;
  total_turns: number;
  ts: string;
};

let metricsDir: string | null = null;

export function setMetricsDir(dir: string): void {
  metricsDir = dir;
}

export async function recordSession(metrics: SessionMetrics): Promise<void> {
  if (!metricsDir) return;
  try {
    await mkdir(metricsDir, { recursive: true });
    const file = path.join(metricsDir, "sessions.jsonl");
    const line = JSON.stringify(metrics) + "\n";
    await writeFile(file, line, { flag: "a" });
  } catch {
    // best-effort
  }
}

export async function readSessionMetrics(limit: number = 100): Promise<SessionMetrics[]> {
  if (!metricsDir) return [];
  return readSessionMetricsFromDir(metricsDir, limit);
}

/** WO-508: 从指定目录读取会话指标（用于 CLI 导出等）。 */
export async function readSessionMetricsFromDir(
  workspaceOrMetricsDir: string,
  limit: number = 100
): Promise<SessionMetrics[]> {
  const dir = path.join(workspaceOrMetricsDir, ".rzeclaw");
  const file = path.join(dir, "sessions.jsonl");
  try {
    const raw = await readFile(file, "utf-8");
    const lines = raw.trim().split("\n").filter(Boolean);
    const parsed = lines.slice(-limit).map((l) => JSON.parse(l) as SessionMetrics);
    return parsed;
  } catch {
    return [];
  }
}
