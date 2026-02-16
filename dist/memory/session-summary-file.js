/**
 * Write session summary ("学到了什么") to a file for human or later read-only use.
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
export async function writeSessionSummaryFile(params) {
    const dir = path.join(params.workspaceDir, ".rzeclaw", "session_summaries");
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `${params.sessionId}.md`);
    const content = `# Session ${params.sessionId}\n\n## Summary\n\n${params.summary || "(no summary)"}\n\n## Facts extracted\n\n${params.factCount} fact(s) written to memory.\n`;
    await writeFile(filePath, content, "utf-8");
}
