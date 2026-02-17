/**
 * WO-620 / Phase 12: Heartbeat Record — 写回最近一次结果并追加历史供诊断。
 */

import { writeFile, mkdir, appendFile } from "node:fs/promises";
import { join } from "node:path";

export type RecordPayload = {
  ts: string;
  executed: boolean;
  content?: string;
  error?: string;
  suggestedInput?: string;
};

const DIR = ".rzeclaw";
const FILE = "heartbeat_last.json";
const HISTORY_FILE = "heartbeat_history.jsonl";

/**
 * 将本次 Heartbeat 执行结果写入 heartbeat_last.json，并追加一行到 heartbeat_history.jsonl。
 */
export async function record(
  workspaceRoot: string,
  payload: RecordPayload
): Promise<void> {
  const dir = join(workspaceRoot, DIR);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, FILE),
    JSON.stringify(payload, null, 2),
    "utf-8"
  );
  const historyLine = JSON.stringify({
    ts: payload.ts,
    executed: payload.executed,
    error: payload.error ?? null,
  }) + "\n";
  await appendFile(join(dir, HISTORY_FILE), historyLine);
}
