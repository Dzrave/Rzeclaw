/**
 * Phase 17: 今日缓冲 — 供折叠任务消费的「当日」对话摘要/片段存储.
 * WO-1720, WO-1721, WO-1722.
 */

import { appendFile, readFile, mkdir } from "node:fs/promises";
import path from "node:path";

const MEMORY_DIR = ".rzeclaw/memory";

function getTodayDateLocal(): string {
  return new Date().toISOString().slice(0, 10);
}

function bufferFilePath(workspaceDir: string, date: string): string {
  return path.join(workspaceDir, MEMORY_DIR, `today_buffer_${date}.jsonl`);
}

export type TodayBufferEntry = {
  date: string;
  ts: string;
  sessionId: string;
  content: string;
  source?: string;
};

/** WO-1721: 追加一条到今日缓冲。date 缺省为本地今日。隐私会话勿调用。 */
export async function appendToTodayBuffer(params: {
  workspaceDir: string;
  date?: string;
  sessionId: string;
  content: string;
  source?: string;
}): Promise<void> {
  const date = params.date ?? getTodayDateLocal();
  const dir = path.join(params.workspaceDir, MEMORY_DIR);
  await mkdir(dir, { recursive: true });
  const filePath = bufferFilePath(params.workspaceDir, date);
  const line: TodayBufferEntry = {
    date,
    ts: new Date().toISOString(),
    sessionId: params.sessionId,
    content: params.content,
    source: params.source,
  };
  await appendFile(filePath, JSON.stringify(line) + "\n", "utf-8");
}

/** WO-1722: 读取指定日期的缓冲内容，供折叠任务消费。date 缺省为本地今日。返回拼接后的文本。 */
export async function readTodayBuffer(
  workspaceDir: string,
  date?: string
): Promise<{ date: string; text: string; entries: TodayBufferEntry[] }> {
  const d = date ?? getTodayDateLocal();
  const filePath = bufferFilePath(workspaceDir, d);
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    return { date: d, text: "", entries: [] };
  }
  const entries: TodayBufferEntry[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const e = JSON.parse(trimmed) as TodayBufferEntry;
      if (e && typeof e.content === "string") {
        entries.push(e);
      }
    } catch {
      // skip malformed line
    }
  }
  const text = entries.map((e) => e.content).filter(Boolean).join("\n\n");
  return { date: d, text, entries };
}
