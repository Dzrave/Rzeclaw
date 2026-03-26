/**
 * Phase 17: 5 天滑动情景记忆（Rolling Episodic Memory）— 账本类型与存储.
 * WO-1701, WO-1702.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

/** 单日条目：时间衰减账本中的一天 */
export type DayEntry = {
  /** 相对日标签，如 "Yesterday (-1)", "Day -2" */
  day: string;
  /** 日期 YYYY-MM-DD */
  date: string;
  /** 当日核心进展摘要（约 100 字） */
  summary: string;
  /** 未完成任务列表，可选 */
  pending_tasks?: string[];
};

/** 滚动账本：5 天滑动情景记忆的持久化结构 */
export type RollingLedger = {
  /** 窗口标识，如 "5_days" */
  memory_window: string;
  /** 当前焦点（最近进展的一句话），可选 */
  current_focus?: string;
  /** 按时间从新到旧：Day -1 在最前，Day -5 在最后 */
  rolling_ledger: DayEntry[];
};

const FILENAME = "rolling_ledger.json";
const DEFAULT_MEMORY_WINDOW = "5_days";

/** 空账本结构 */
export function emptyRollingLedger(): RollingLedger {
  return {
    memory_window: DEFAULT_MEMORY_WINDOW,
    current_focus: undefined,
    rolling_ledger: [],
  };
}

function ledgerPath(workspaceDir: string): string {
  return path.join(workspaceDir, ".rezbot", "memory", FILENAME);
}

/**
 * 读取滚动账本。文件不存在或无效时返回空账本。
 * WO-1702
 */
export async function readRollingLedger(workspaceDir: string): Promise<RollingLedger> {
  const filePath = ledgerPath(workspaceDir);
  try {
    const raw = await readFile(filePath, "utf-8");
    const data = JSON.parse(raw) as unknown;
    if (data != null && typeof data === "object" && Array.isArray((data as RollingLedger).rolling_ledger)) {
      const ledger = data as RollingLedger;
      return {
        memory_window: typeof ledger.memory_window === "string" ? ledger.memory_window : DEFAULT_MEMORY_WINDOW,
        current_focus: typeof ledger.current_focus === "string" ? ledger.current_focus : undefined,
        rolling_ledger: (ledger.rolling_ledger as DayEntry[]).filter(
          (e) => e && typeof e.date === "string" && typeof e.summary === "string"
        ),
      };
    }
  } catch {
    // 文件不存在或 JSON 无效
  }
  return emptyRollingLedger();
}

/**
 * 写入滚动账本。目录不存在时会递归创建。
 * WO-1702
 */
export async function writeRollingLedger(workspaceDir: string, ledger: RollingLedger): Promise<void> {
  const dir = path.join(workspaceDir, ".rezbot", "memory");
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, FILENAME);
  const payload: RollingLedger = {
    memory_window: ledger.memory_window || DEFAULT_MEMORY_WINDOW,
    current_focus: ledger.current_focus,
    rolling_ledger: ledger.rolling_ledger || [],
  };
  await writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");
}

/** WO-1710: 将账本格式化为自然语言，供注入 system prompt（约 300–500 token 量级） */
export type FormatRollingLedgerOptions = {
  /** 视为「今天」的日期 YYYY-MM-DD；缺省为本地今日 */
  todayDate?: string;
  /** 是否包含各日的 pending_tasks，默认 true */
  includePendingTasks?: boolean;
};

function getTodayDateLocal(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatRollingLedgerForPrompt(
  ledger: RollingLedger,
  options?: FormatRollingLedgerOptions
): string {
  const today = options?.todayDate ?? getTodayDateLocal();
  const includePending = options?.includePendingTasks !== false;
  const parts: string[] = [`今天是 ${today}。`];
  if (ledger.rolling_ledger.length === 0 && !ledger.current_focus) {
    return parts[0];
  }
  if (ledger.current_focus?.trim()) {
    parts.push(`当前焦点：${ledger.current_focus.trim()}`);
  }
  if (ledger.rolling_ledger.length > 0) {
    parts.push("近期进展：");
    const dayLabels: Record<string, string> = {
      "Yesterday (-1)": "昨天",
      "Day -2": "前天",
      "Day -3": "3 天前",
      "Day -4": "4 天前",
      "Day -5": "5 天前",
    };
    for (const e of ledger.rolling_ledger) {
      const label = dayLabels[e.day] ?? e.day;
      let line = `${label}（${e.date}）：${e.summary.trim()}`;
      if (includePending && e.pending_tasks?.length) {
        line += `；未完成：${e.pending_tasks.join("、")}`;
      }
      parts.push(line);
    }
  }
  return parts.join(" ");
}

/** 读取账本并格式化为 prompt 用自然语言；供 Gateway/executor 在启用且非隐私时调用。WO-1711/1712 */
export async function getRollingContextForPrompt(workspaceDir: string): Promise<string> {
  const ledger = await readRollingLedger(workspaceDir);
  return formatRollingLedgerForPrompt(ledger);
}
