/**
 * RAG-4: 遥测日志 schema 与写入点。复盘只读此日志，不占用主链路。
 */

import { writeFile, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const TELEMETRY_DIR = ".rezbot/telemetry";
const EVENTS_FILE = "events.jsonl";

export type TelemetryEvent = {
  ts: string;
  type: string;
  sessionId?: string;
  flowId?: string;
  nodeId?: string;
  success?: boolean;
  durationMs?: number;
  tokenCount?: number;
  ragCollection?: string;
  ragScore?: number;
  intentSource?: string;
  payload?: Record<string, unknown>;
};

function eventsPath(workspace: string): string {
  return join(workspace, TELEMETRY_DIR, EVENTS_FILE);
}

export async function appendTelemetry(
  workspace: string,
  event: TelemetryEvent
): Promise<void> {
  const dir = join(workspace, TELEMETRY_DIR);
  await mkdir(dir, { recursive: true });
  const line = JSON.stringify({ ...event, ts: event.ts || new Date().toISOString() }) + "\n";
  try {
    await writeFile(eventsPath(workspace), line, { flag: "a", encoding: "utf-8" });
  } catch {
    // 不阻断主流程
  }
}

/**
 * 读取遥测事件（可选 since 时间戳 ISO8601）；用于复盘分析。
 */
export async function readTelemetry(
  workspace: string,
  since?: string
): Promise<TelemetryEvent[]> {
  const file = eventsPath(workspace);
  try {
    const raw = await readFile(file, "utf-8");
    const lines = raw.split("\n").filter((l) => l.trim());
    const events = lines.map((l) => JSON.parse(l) as TelemetryEvent);
    if (since) {
      return events.filter((e) => e.ts >= since);
    }
    return events;
  } catch {
    return [];
  }
}
