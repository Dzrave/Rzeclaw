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
/** WO-BT-007: 可选 source/flowId，区分 flow 与 agent 调用 */
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
  /** WO-BT-007: 来源为 flow 时标注，便于审计区分 */
  source?: "flow" | "agent";
  flowId?: string;
  /** Phase 14B: 执行该操作的 Agent 实例 id / 蓝图 id，便于按 Agent 过滤与统计 */
  agentId?: string;
  blueprintId?: string;
  /** WO-1505: 会话 ID，用于按会话扫描高风险与会话结束建议 */
  sessionId?: string;
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

/** WO-1512: 隐私会话下可选不写或脱敏后写 */
export type AppendOpLogOptions = {
  /** 为 true 时不写入 ops.log（隐私会话 + opsLogPrivacySessionPolicy === "omit"） */
  skipWrite?: boolean;
};

/**
 * 追加一条操作记录到 workspace/.rzeclaw/ops.log；目录不存在则创建。
 * WO-SEC-005: 写入前对 args、result_summary 脱敏，避免敏感信息落盘。
 * WO-1512: 传入 options.skipWrite 时跳过写入（隐私会话脱敏策略）。
 */
export async function appendOpLog(
  workspaceRoot: string,
  entry: OpLogEntry,
  options?: AppendOpLogOptions
): Promise<void> {
  if (options?.skipWrite) return;
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

/** WO-1505: 读取某会话最近 N 条操作记录（用于会话结束高风险建议）。 */
export async function readLastNEntriesBySession(
  workspaceRoot: string,
  sessionId: string,
  n: number
): Promise<OpLogEntry[]> {
  const all = await readLastNEntries(workspaceRoot, Math.max(n * 5, 500));
  const filtered = all.filter((e) => e.sessionId === sessionId);
  return filtered.slice(-n);
}

/** WO-BT-018 可选：读取某 flow 最近若干条失败的工具调用（source=flow, flowId 匹配, result_ok=false），用于拼入 failureSummary。 */
export async function readRecentFlowFailureEntries(
  workspaceRoot: string,
  flowId: string,
  limit: number
): Promise<OpLogEntry[]> {
  const candidates = await readLastNEntries(workspaceRoot, Math.max(500, limit * 10));
  const filtered = candidates.filter(
    (e) => e.source === "flow" && e.flowId === flowId && e.result_ok === false
  );
  return filtered.slice(-limit);
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
