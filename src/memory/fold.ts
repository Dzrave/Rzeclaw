/**
 * Phase 17: 记忆折叠任务 — 将「当日缓冲」压缩为日级摘要并更新滚动账本.
 * WO-1730, WO-1731, WO-1732, WO-1733, WO-1740.
 */

import { randomUUID } from "node:crypto";
import type { RezBotConfig } from "../config.js";
import { getLLMClient } from "../llm/index.js";
import { readTodayBuffer } from "./today-buffer.js";
import {
  readRollingLedger,
  writeRollingLedger,
  emptyRollingLedger,
  type RollingLedger,
  type DayEntry,
} from "./rolling-ledger.js";
import { createStore } from "./store-jsonl.js";

const FOLD_PROMPT = `请将以下「当日」对话/摘要提炼成约 100 字以内的核心进展，并提取出未完成的 Pending Tasks。
输出格式（仅输出这两部分）：
SUMMARY:
(一段话：当日主要做了什么、结果、未解决事项。)

PENDING_TASKS:
(每行一个未完成任务，以 "- " 开头；若无则写 "- 无")

---`;

function parseFoldOutput(text: string): { summary: string; pending_tasks: string[] } {
  const summaryMatch = text.match(/SUMMARY:\s*([\s\S]*?)(?=PENDING_TASKS:|$)/i);
  const tasksMatch = text.match(/PENDING_TASKS:\s*([\s\S]*?)$/im);
  const summary = summaryMatch ? summaryMatch[1].trim().slice(0, 300) : "(无当日记录)";
  const rawTasks = tasksMatch ? tasksMatch[1].trim() : "";
  const pending_tasks = rawTasks
    .split("\n")
    .map((l) => l.replace(/^\s*-\s*/, "").trim())
    .filter((s) => s && s !== "无");
  return { summary, pending_tasks };
}

const DAY_LABELS = ["Yesterday (-1)", "Day -2", "Day -3", "Day -4", "Day -5"];

export type FoldResult = {
  success: boolean;
  date: string;
  evicted?: DayEntry;
  /** WO-1741: 本次折叠产出的未完成任务，可写入早报 */
  foldedPendingTasks?: string[];
  error?: string;
};

/**
 * 对指定日期执行折叠：读当日缓冲 → LLM 摘要 + pending_tasks → 更新账本 FIFO。
 * date 为要折叠的日期 YYYY-MM-DD（通常为「昨天」）；被挤出的 Day -5 通过 evicted 返回供淘汰逻辑使用。
 * WO-1730, WO-1731
 */
export async function runFoldForDate(
  workspaceDir: string,
  date: string,
  config: RezBotConfig
): Promise<FoldResult> {
  const windowDays = config.memory?.rollingLedger?.windowDays ?? 5;
  const { text } = await readTodayBuffer(workspaceDir, date);
  let summary = "(无当日记录)";
  let pending_tasks: string[] = [];
  if (text.trim()) {
    try {
      const client = getLLMClient(config);
      const response = await client.createMessage({
        max_tokens: 512,
        messages: [{ role: "user", content: `${FOLD_PROMPT}\n\n${text}` }],
      });
      const block = response.content?.find((b) => b.type === "text");
      const out = block && "text" in block ? block.text : "";
      const parsed = parseFoldOutput(out);
      summary = parsed.summary || summary;
      pending_tasks = parsed.pending_tasks || [];
    } catch (e) {
      return {
        success: false,
        date,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }
  const newEntry: DayEntry = {
    day: "Yesterday (-1)",
    date,
    summary,
    pending_tasks: pending_tasks.length ? pending_tasks : undefined,
  };
  let ledger = await readRollingLedger(workspaceDir);
  if (ledger.rolling_ledger.length === 0 && ledger.current_focus === undefined) {
    ledger = emptyRollingLedger();
  }
  const shifted: DayEntry[] = [newEntry];
  for (let i = 0; i < ledger.rolling_ledger.length; i++) {
    const label = DAY_LABELS[Math.min(i + 1, DAY_LABELS.length - 1)];
    shifted.push({ ...ledger.rolling_ledger[i], day: label });
  }
  const trimmed = shifted.slice(0, windowDays);
  const evicted = shifted.length > windowDays ? shifted[windowDays] : undefined;
  const updated: RollingLedger = {
    ...ledger,
    rolling_ledger: trimmed,
    current_focus: newEntry.summary.slice(0, 80),
  };
  await writeRollingLedger(workspaceDir, updated);

  if (evicted && shouldPromoteEvictedToRag(evicted)) {
    await promoteEvictedDayToL1(workspaceDir, evicted, config);
  }

  return {
    success: true,
    date,
    evicted,
    foldedPendingTasks: pending_tasks.length ? pending_tasks : undefined,
  };
}

function shouldPromoteEvictedToRag(entry: DayEntry): boolean {
  const s = (entry.summary || "").trim();
  if (!s || s === "(无当日记录)") return false;
  return s.length >= 30;
}

async function promoteEvictedDayToL1(
  workspaceDir: string,
  entry: DayEntry,
  config: RezBotConfig
): Promise<void> {
  if (!config.memory?.enabled) return;
  const store = createStore(workspaceDir, config.memory.workspaceId);
  await store.append({
    id: randomUUID(),
    content: entry.summary,
    content_type: "summary",
    provenance: { source_type: "system", session_id: "rolling_ledger_fold" },
    workspace_id: config.memory.workspaceId,
    layer: "L1",
  });
}
