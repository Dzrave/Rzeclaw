/**
 * Write session summary ("学到了什么") to a file for human or later read-only use.
 * Phase 15: readYesterdaySummary for office frontend "昨日小记".
 */

import { writeFile, mkdir, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

export async function writeSessionSummaryFile(params: {
  workspaceDir: string;
  sessionId: string;
  summary: string;
  factCount: number;
}): Promise<void> {
  const dir = path.join(params.workspaceDir, ".rzeclaw", "session_summaries");
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${params.sessionId}.md`);
  const content = `# Session ${params.sessionId}\n\n## Summary\n\n${params.summary || "(no summary)"}\n\n## Facts extracted\n\n${params.factCount} fact(s) written to memory.\n`;
  await writeFile(filePath, content, "utf-8");
}

/** Yesterday date string (YYYY-MM-DD) in local time */
function getYesterdayDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Read session summary files whose mtime date is yesterday, concatenate for "昨日小记".
 * Returns empty memo if no files or dir missing.
 */
export async function readYesterdaySummary(workspaceDir: string): Promise<{ date: string; memo: string }> {
  const date = getYesterdayDate();
  const dir = path.join(workspaceDir, ".rzeclaw", "session_summaries");
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return { date, memo: "" };
  }
  const yesterdayStart = new Date(date + "T00:00:00").getTime();
  const yesterdayEnd = new Date(date + "T23:59:59.999").getTime();
  const parts: string[] = [];
  for (const name of entries) {
    if (!name.endsWith(".md")) continue;
    const filePath = path.join(dir, name);
    let mtimeMs: number;
    try {
      const st = await stat(filePath);
      mtimeMs = st.mtimeMs;
    } catch {
      continue;
    }
    if (mtimeMs < yesterdayStart || mtimeMs > yesterdayEnd) continue;
    try {
      const content = await readFile(filePath, "utf-8");
      const summarySection = content.replace(/^# Session .+?\n\n## Summary\n\n/s, "").replace(/\n\n## Facts extracted[\s\S]*/s, "").trim();
      if (summarySection) parts.push(`[${name.slice(0, -3)}] ${summarySection}`);
    } catch {
      // skip
    }
  }
  const memo = parts.length ? parts.join("\n\n") : "";
  return { date, memo };
}
