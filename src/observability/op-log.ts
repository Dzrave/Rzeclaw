/**
 * WO-IDE-006: 结构化操作审计 — 每行一条 JSON，便于导出、查询与重放。
 * WO-SEC-005: 写入前对 args、result_summary 脱敏。
 */

import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { sanitizeForLog, sanitizeObject } from "../security/sanitize.js";

/** WO-SEC-004: 操作风险分级，用于事后检查与纠正 */
export type RiskLevel = "low" | "medium" | "high";

/** WO-IDE-012: 可选的撤销参数，用于 undo_last 重放逆操作 */
export type OpLogEntry = {
  op_id: string;
  tool: string;
  args: Record<string, unknown>;
  result_ok: boolean;
  result_summary: string;
  channel_used?: string;
  ts: string;
  /** 若存在，undo_last 可执行该 tool+args 以撤销本步 */
  undo_hint?: { tool: string; args: Record<string, unknown> };
  /** WO-SEC-004: 风险分级，兼容旧条目无此字段 */
  risk_level?: RiskLevel;
};

/**
 * WO-SEC-004: 根据工具名、参数与结果摘要判定风险等级。
 */
export function classifyOpRisk(
  tool: string,
  args: Record<string, unknown>,
  resultSummary: string
): RiskLevel {
  if (tool === "process" && args.action === "kill") return "high";
  if (tool === "bash" && typeof args.command === "string") {
    const cmd = (args.command as string).toLowerCase();
    if (
      /rm\s+(-rf?|--recursive)/.test(cmd) ||
      /format\s+[a-z]:/.test(cmd) ||
      /del\s+\/f\s+\/s/.test(cmd) ||
      /mkfs|dd\s+if|diskpart|reg\s+delete/.test(cmd)
    ) {
      return "high";
    }
  }
  if (tool === "write" || tool === "edit") {
    const pathArg = (args.path as string) ?? "";
    if (/^(\/usr|\/etc|\/var|C:\\Windows|C:\\Program)/i.test(pathArg)) return "high";
    return "medium";
  }
  return "low";
}

const OP_LOG_FILENAME = "ops.log";

/**
 * 追加一条操作记录到 workspace/.rzeclaw/ops.log；目录不存在则创建。
 * WO-SEC-005: 写入前对 args、result_summary 脱敏，避免敏感信息落盘。
 */
export async function appendOpLog(workspaceRoot: string, entry: OpLogEntry): Promise<void> {
  const dir = join(workspaceRoot, ".rzeclaw");
  const file = join(dir, OP_LOG_FILENAME);
  try {
    await mkdir(dir, { recursive: true });
    const sanitized: OpLogEntry = {
      ...entry,
      args: sanitizeObject(entry.args) as Record<string, unknown>,
      result_summary: sanitizeForLog(entry.result_summary),
    };
    const line = JSON.stringify(sanitized) + "\n";
    await appendFile(file, line, "utf-8");
  } catch {
    // 审计写入失败不阻断主流程
  }
}

const OP_LOG_PATH = (workspaceRoot: string) => join(workspaceRoot, ".rzeclaw", OP_LOG_FILENAME);

/**
 * WO-IDE-013: 从 ops.log 末尾向前查找最近一条含 undo_hint 的条目。
 */
export async function readLastUndoableEntry(workspaceRoot: string): Promise<OpLogEntry | null> {
  const file = OP_LOG_PATH(workspaceRoot);
  try {
    const raw = await readFile(file, "utf-8");
    const lines = raw.split("\n").filter((l) => l.trim());
    for (let i = lines.length - 1; i >= 0; i--) {
      const entry = JSON.parse(lines[i]!) as OpLogEntry;
      if (entry.undo_hint) return entry;
    }
  } catch {
    // file not found or parse error
  }
  return null;
}

/** WO-IDE-014: 读取最近 N 条操作记录（从文件末尾向前）。 */
export async function readLastNEntries(workspaceRoot: string, n: number): Promise<OpLogEntry[]> {
  const file = OP_LOG_PATH(workspaceRoot);
  try {
    const raw = await readFile(file, "utf-8");
    const lines = raw.split("\n").filter((l) => l.trim());
    const from = Math.max(0, lines.length - n);
    const out: OpLogEntry[] = [];
    for (let i = lines.length - 1; i >= from; i--) {
      out.unshift(JSON.parse(lines[i]!) as OpLogEntry);
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * 从 ToolResult 生成简短摘要（用于 result_summary），最多 200 字符。
 */
export function summarizeResult(result: { ok: boolean; content?: string; error?: string }): string {
  if (result.ok) {
    const c = result.content ?? "";
    return c.length <= 200 ? c : c.slice(0, 197) + "...";
  }
  const e = result.error ?? "unknown error";
  return e.length <= 200 ? `error: ${e}` : `error: ${e.slice(0, 193)}...`;
}
