/**
 * L1 write pipeline: from session messages generate summary + facts and append to store.
 */

import { randomUUID } from "node:crypto";
import path from "node:path";
import type { RzeclawConfig } from "../config.js";
import { getLLMClient } from "../llm/index.js";
import type { Message } from "../agent/context.js";
import type { IMemoryStore } from "./store-interface.js";
import type { MemoryEntryInsert, Provenance } from "./types.js";
import { writeAuditLog } from "./audit.js";

/** WO-510: 简单规则：明显敏感内容不写入 L1，或脱敏。 */
function sanitizeForMemory(content: string): string {
  if (!content || !content.trim()) return "";
  let s = content;
  const pathRe = new RegExp("([A-Za-z]:\\\\[^\\s]+|\\\\/[^\\s]+)", "g");
  const patterns: Array<[RegExp, string]> = [
    [/\b(sk-[a-zA-Z0-9_-]{20,})/g, "[API_KEY_REDACTED]"],
    [/\b(api[_-]?key|apikey)\s*[:=]\s*["']?[^"'\s]{8,}/gi, "[API_KEY_REDACTED]"],
    [/\b(password|passwd|secret)\s*[:=]\s*["']?[^"'\s]{4,}/gi, "[SECRET_REDACTED]"],
    [pathRe, "[PATH_REDACTED]"],
  ];
  for (const [re, replacement] of patterns) {
    s = s.replace(re, replacement);
  }
  if (s.includes("[API_KEY_REDACTED]") || s.includes("[SECRET_REDACTED]")) {
    return "";
  }
  return s.trim();
}

const EXTRACT_PROMPT = `You are given a conversation between user and assistant (with optional tool use). Output exactly two sections:

SUMMARY:
(One short paragraph: what was done, main outcome, any open goal.)

FACTS:
(1–5 bullet points: key facts, decisions, or preferences the user or assistant stated. One per line, each line starting with "- ")

Keep SUMMARY and FACTS concise. Output only these two sections.`;

function parseSummaryAndFacts(text: string): { summary: string; facts: string[] } {
  const summaryMatch = text.match(/SUMMARY:\s*([\s\S]*?)(?=FACTS:|$)/i);
  const factsMatch = text.match(/FACTS:\s*([\s\S]*?)$/im);
  const summary = summaryMatch ? summaryMatch[1].trim() : "";
  const rawFacts = factsMatch ? factsMatch[1].trim() : "";
  const facts = rawFacts
    .split("\n")
    .map((l) => l.replace(/^\s*-\s*/, "").trim())
    .filter(Boolean);
  return { summary, facts };
}

export async function flushToL1(params: {
  config: RzeclawConfig;
  sessionId: string;
  messages: Message[];
  store: IMemoryStore;
  workspaceId?: string;
  taskHint?: string;
}): Promise<{ summary: string; factCount: number }> {
  const convText = params.messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n");
  if (!convText.trim()) {
    return { summary: "", factCount: 0 };
  }

  let text = "";
  try {
    const client = getLLMClient(params.config);
    const response = await client.createMessage({
      max_tokens: 1024,
      messages: [{ role: "user", content: `${EXTRACT_PROMPT}\n\n---\n\n${convText}` }],
    });
    const textBlock = response.content.find((b) => b.type === "text");
    text = textBlock && "text" in textBlock ? textBlock.text : "";
  } catch {
    return { summary: "", factCount: 0 };
  }

  const { summary: rawSummary, facts: rawFacts } = parseSummaryAndFacts(text);
  const summary = sanitizeForMemory(rawSummary);
  const facts = rawFacts.map(sanitizeForMemory).filter(Boolean);

  const provenance: Provenance = {
    source_type: "model",
    session_id: params.sessionId,
    turn_index: params.messages.length >> 1,
  };

  const workspaceDir = path.resolve(params.config.workspace);

  if (summary) {
    const entry: MemoryEntryInsert = {
      id: randomUUID(),
      content: summary,
      content_type: "summary",
      provenance,
      task_hint: params.taskHint,
      workspace_id: params.workspaceId,
      layer: "L1",
    };
    await params.store.append(entry);
    await writeAuditLog(workspaceDir, {
      when: new Date().toISOString(),
      who: params.sessionId,
      from_where: params.sessionId,
      entry_id: entry.id,
      workspace_id: params.workspaceId,
    });
  }

  for (const fact of facts) {
    const entry: MemoryEntryInsert = {
      id: randomUUID(),
      content: fact,
      content_type: "fact",
      provenance,
      task_hint: params.taskHint,
      workspace_id: params.workspaceId,
      layer: "L1",
    };
    await params.store.append(entry);
    await writeAuditLog(workspaceDir, {
      when: new Date().toISOString(),
      who: params.sessionId,
      from_where: params.sessionId,
      entry_id: entry.id,
      workspace_id: params.workspaceId,
    });
  }

  return { summary, factCount: facts.length };
}

/** WO-505: 仅生成 L0 会话内摘要（不写 L1），供多轮时「每 M 轮摘要 + 最近轮」使用。 */
export async function generateL0Summary(params: {
  config: RzeclawConfig;
  messages: Message[];
}): Promise<string> {
  if (params.messages.length === 0) return "";

  const convText = params.messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n");
  if (!convText.trim()) return "";

  try {
    const client = getLLMClient(params.config);
    const response = await client.createMessage({
      max_tokens: 512,
      messages: [{ role: "user", content: `${EXTRACT_PROMPT}\n\n---\n\n${convText}` }],
    });
    const textBlock = response.content.find((b) => b.type === "text");
    const text = textBlock && "text" in textBlock ? textBlock.text : "";
    const { summary } = parseSummaryAndFacts(text);
    return summary;
  } catch {
    return "";
  }
}
