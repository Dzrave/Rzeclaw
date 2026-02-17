/**
 * Phase 12 WO-1202～1205: 诊断报告数据汇总与生成、持久化。
 */

import path from "node:path";
import { readFile, mkdir, writeFile, readdir } from "node:fs/promises";
import { readSessionMetricsFromDir } from "../observability/metrics.js";
import type { RzeclawConfig } from "../config.js";
import { getHotFilePath } from "../memory/store-jsonl.js";

const RZECLAW_DIR = ".rzeclaw";
const DIAGNOSTIC_DIR = "diagnostics";
const DEFAULT_DAYS = 7;

function sinceIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

/** WO-1202: 会话与工具统计 */
async function aggregateSessions(
  workspaceDir: string,
  since: string
): Promise<{ sessionCount: number; totalToolCalls: number; totalToolFailures: number; totalTurns: number }> {
  const metrics = await readSessionMetricsFromDir(workspaceDir, 5000);
  const filtered = metrics.filter((m) => m.ts >= since);
  let totalToolCalls = 0;
  let totalToolFailures = 0;
  let totalTurns = 0;
  for (const m of filtered) {
    totalToolCalls += m.tool_call_count ?? 0;
    totalToolFailures += m.tool_failure_count ?? 0;
    totalTurns += m.total_turns ?? 0;
  }
  return {
    sessionCount: filtered.length,
    totalToolCalls,
    totalToolFailures,
    totalTurns,
  };
}

/** WO-1203: 记忆侧 — L1 条数（热存储行数）、audit 写入次数 */
async function aggregateMemory(
  workspaceDir: string,
  workspaceId?: string
): Promise<{ l1EntryCount: number; auditWriteCount: number }> {
  let l1EntryCount = 0;
  const hotPath = getHotFilePath(workspaceDir, workspaceId);
  try {
    const raw = await readFile(hotPath, "utf-8");
    l1EntryCount = raw.trim().split("\n").filter(Boolean).length;
  } catch {
    // no file
  }
  let auditWriteCount = 0;
  const auditPath = path.join(workspaceDir, RZECLAW_DIR, "audit.jsonl");
  try {
    const raw = await readFile(auditPath, "utf-8");
    auditWriteCount = raw.trim().split("\n").filter(Boolean).length;
  } catch {
    // no file
  }
  return { l1EntryCount, auditWriteCount };
}

/** WO-1204: Heartbeat 执行次数与结果 */
async function aggregateHeartbeat(
  workspaceDir: string,
  since: string
): Promise<{ totalRuns: number; executedCount: number; errorCount: number; lastTs?: string }> {
  const historyPath = path.join(workspaceDir, RZECLAW_DIR, "heartbeat_history.jsonl");
  let totalRuns = 0;
  let executedCount = 0;
  let errorCount = 0;
  let lastTs: string | undefined;
  try {
    const raw = await readFile(historyPath, "utf-8");
    const lines = raw.trim().split("\n").filter(Boolean);
    for (const line of lines) {
      const row = JSON.parse(line) as { ts?: string; executed?: boolean; error?: string };
      if (row.ts && row.ts >= since) {
        totalRuns++;
        if (row.executed) executedCount++;
        if (row.error) errorCount++;
        lastTs = row.ts;
      }
    }
  } catch {
    // no file or empty
  }
  return { totalRuns, executedCount, errorCount, lastTs };
}

export type DiagnosticReport = {
  generatedAt: string;
  workspace: string;
  intervalDays: number;
  since: string;
  sessions: {
    sessionCount: number;
    totalToolCalls: number;
    totalToolFailures: number;
    totalTurns: number;
    toolFailureRate: number;
  };
  memory: { l1EntryCount: number; auditWriteCount: number };
  heartbeat: {
    totalRuns: number;
    executedCount: number;
    errorCount: number;
    lastTs?: string;
  };
};

/** WO-1205: 生成完整报告并写入文件 */
export async function generateReport(
  config: RzeclawConfig,
  options: { workspace?: string; days?: number } = {}
): Promise<{ report: DiagnosticReport; filePath: string }> {
  const workspaceDir = path.resolve(options.workspace ?? config.workspace);
  const days = options.days ?? config.diagnostic?.intervalDays ?? DEFAULT_DAYS;
  const since = sinceIso(days);

  const [sessions, memory, heartbeat] = await Promise.all([
    aggregateSessions(workspaceDir, since),
    aggregateMemory(workspaceDir, config.memory?.workspaceId),
    aggregateHeartbeat(workspaceDir, since),
  ]);

  const toolFailureRate =
    sessions.totalToolCalls > 0
      ? Math.round((sessions.totalToolFailures / sessions.totalToolCalls) * 100) / 100
      : 0;

  const report: DiagnosticReport = {
    generatedAt: new Date().toISOString(),
    workspace: workspaceDir,
    intervalDays: days,
    since,
    sessions: {
      ...sessions,
      toolFailureRate,
    },
    memory,
    heartbeat,
  };

  const outDir = config.diagnostic?.outputPath
    ? path.join(workspaceDir, config.diagnostic.outputPath)
    : path.join(workspaceDir, RZECLAW_DIR, DIAGNOSTIC_DIR);
  await mkdir(outDir, { recursive: true });
  const dateStr = new Date().toISOString().slice(0, 10);
  const filePath = path.join(outDir, `report_${dateStr}.json`);
  await writeFile(filePath, JSON.stringify(report, null, 2), "utf-8");

  return { report, filePath };
}
