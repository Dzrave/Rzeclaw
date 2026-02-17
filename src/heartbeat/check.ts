/**
 * WO-618 / Phase 9 WO-902: Heartbeat Check — 读取待办/清单，判断是否有需要执行的事项。
 * 支持多级列表（保留缩进层级）、优先级标记 [高]/[中]/[低]；可选 WO-903 LLM 判断。
 */

import type { RzeclawConfig } from "../config.js";
import { getLLMClient } from "../llm/index.js";

export type CheckResult = {
  /** 是否有待执行项 */
  hasWork: boolean;
  /** 建议执行的一条输入（如待办首条或 LLM 推荐） */
  suggestedInput?: string;
  /** 原始清单行（多行，已规范化） */
  lines: string[];
};

const PRIO_HIGH = /\[高\]|\[high\]/i;
const PRIO_MID = /\[中\]|\[medium\]/i;
const PRIO_LOW = /\[低\]|\[low\]/i;

function parseLine(raw: string): { text: string; priority: number } {
  const t = raw.trim();
  if (PRIO_HIGH.test(t)) return { text: t.replace(PRIO_HIGH, "").trim(), priority: 3 };
  if (PRIO_MID.test(t)) return { text: t.replace(PRIO_MID, "").trim(), priority: 2 };
  if (PRIO_LOW.test(t)) return { text: t.replace(PRIO_LOW, "").trim(), priority: 1 };
  return { text: t, priority: 2 };
}

/**
 * WO-902: 从清单文本解析多级待办（- / 1. 及子项），支持 [高][中][低]；输出规范化行，按优先级排序后取首条为 suggestedInput。
 */
export function check(listContent: string): CheckResult {
  const rawLines = (listContent ?? "").split("\n");
  const withPrio: { text: string; priority: number }[] = [];
  for (const raw of rawLines) {
    const t = raw.trim();
    if (t.length === 0 || t.startsWith("#")) continue;
    const stripped = t.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "").trim() || t;
    const parsed = parseLine(stripped);
    if (parsed.text) withPrio.push({ text: parsed.text, priority: parsed.priority });
  }
  withPrio.sort((a, b) => b.priority - a.priority);
  const lines = withPrio.map((x) => x.text);
  const suggestedInput = withPrio[0]?.text;
  return {
    hasWork: lines.length > 0,
    suggestedInput,
    lines,
  };
}

/**
 * WO-903: 使用 LLM 判断是否建议执行以及建议执行哪一条；无 API Key 时回退到 check()。
 */
export async function checkWithLLM(
  config: RzeclawConfig,
  _workspaceRoot: string,
  listContent: string
): Promise<CheckResult> {
  const fallback = check(listContent);
  if (!fallback.lines.length) return fallback;
  try {
    const client = getLLMClient(config);
    const prompt = `你是一个待办清单助手。下面是一份待办清单（可能含多级或优先级标记）。请判断：是否有建议立刻执行的一项？若有，返回那一项的原文（只返回这一条，不要解释）。若没有或清单为空，返回 NO。

待办清单：
\`\`\`
${listContent.slice(0, 4000)}
\`\`\`

用 JSON 回复，且只输出 JSON，格式：{"hasWork": true或false, "suggestedInput": "建议执行的一条原文" 或 null}`;
    const res = await client.createMessage({
      max_tokens: 256,
      messages: [{ role: "user", content: prompt }],
    });
    const text =
      (res.content?.[0] as { type: "text"; text?: string } | undefined)?.text ?? "";
    const json = text.replace(/```\w*\n?/g, "").trim();
    const start = json.indexOf("{");
    const end = json.lastIndexOf("}") + 1;
    if (start >= 0 && end > start) {
      const parsed = JSON.parse(json.slice(start, end)) as {
        hasWork?: boolean;
        suggestedInput?: string | null;
      };
      const hasWork = parsed.hasWork === true && !!parsed.suggestedInput;
      return {
        hasWork,
        suggestedInput: hasWork ? String(parsed.suggestedInput).trim() : undefined,
        lines: fallback.lines,
      };
    }
  } catch {
    // ignore (e.g. missing API key or provider error)
  }
  return fallback;
}
