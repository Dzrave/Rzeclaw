/**
 * Phase 12 WO-1207: 基于诊断报告生成改进建议（规则），写入 self_improvement_suggestions.md。
 */

import path from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
import type { DiagnosticReport } from "./report.js";

export function generateSuggestions(report: DiagnosticReport): string[] {
  const suggestions: string[] = [];
  if (report.sessions.sessionCount > 0 && report.sessions.toolFailureRate > 0.1) {
    suggestions.push("工具调用失败率较高，建议检查相关工具参数、权限或网络；可查看会话日志定位失败步骤。");
  }
  if (report.heartbeat.totalRuns > 0 && report.heartbeat.errorCount > 0) {
    suggestions.push("Heartbeat 执行曾出现错误，建议检查 HEARTBEAT.md 清单内容与 API Key、模型可用性。");
  }
  if (report.sessions.sessionCount > 0 && report.memory.l1EntryCount === 0 && report.memory.auditWriteCount === 0) {
    suggestions.push("会话有产生但记忆未写入，若需长期记忆可启用 config.memory.enabled 并确认写入流程。");
  }
  if (suggestions.length === 0) {
    suggestions.push("近期运行未见明显异常；可定期查看诊断报告与知识库摄取情况。");
  }
  return suggestions.slice(0, 3);
}

const SUGGESTIONS_FILE = "self_improvement_suggestions.md";
const RZECLAW_DIR = ".rzeclaw";

/**
 * 将建议写入 workspace/.rzeclaw/self_improvement_suggestions.md
 */
export async function writeSuggestionsFile(
  workspaceDir: string,
  report: DiagnosticReport,
  customSuggestions?: string[]
): Promise<string> {
  const suggestions = customSuggestions ?? generateSuggestions(report);
  const dir = path.join(workspaceDir, RZECLAW_DIR);
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, SUGGESTIONS_FILE);
  const content = `# 自我改进建议\n\n生成时间: ${report.generatedAt}\n\n## 建议\n\n${suggestions.map((s) => `- ${s}`).join("\n")}\n`;
  await writeFile(filePath, content, "utf-8");
  return filePath;
}
