/**
 * WO-405: 会话结束或定期，让模型输出「若改进 system/工具描述，建议…」的文本，追加到 workspace/.rzeclaw/prompt_suggestions.md，不自动应用。
 */

import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import type { RzeclawConfig } from "../config.js";
import { getApiKey } from "../config.js";

const PROMPT = `Based on the following session summary, suggest 1–3 concrete improvements to the assistant's system prompt or tool descriptions (e.g. clearer intent→tool mapping, better error hints). Output only the suggestions, one per line, each line starting with "- ". If you have no suggestion, output exactly: "- (none)"`;

const FILENAME = "prompt_suggestions.md";

/**
 * 根据会话摘要让模型生成改进建议并追加到 workspace/.rzeclaw/prompt_suggestions.md。
 * 不修改实际 prompt；仅写入建议供人工采纳。
 */
export async function writePromptSuggestions(params: {
  config: RzeclawConfig;
  workspaceDir: string;
  sessionId: string;
  summary: string;
}): Promise<void> {
  const apiKey = getApiKey(params.config);
  if (!apiKey || !params.summary.trim()) return;

  const client = new Anthropic({ apiKey });
  const model = params.config.model.replace("anthropic/", "");

  const response = await client.messages.create({
    model,
    max_tokens: 256,
    messages: [
      {
        role: "user",
        content: `${PROMPT}\n\n---\n\nSession summary:\n${params.summary}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const text = textBlock && "text" in textBlock ? textBlock.text.trim() : "";
  const lines = text.split("\n").map((l) => l.replace(/^\s*-\s*/, "").trim()).filter(Boolean);
  const suggestion = lines.length ? lines.join("\n") : "(no suggestions)";

  const dir = path.join(params.workspaceDir, ".rzeclaw");
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, FILENAME);
  const header = `\n## ${new Date().toISOString()} (session ${params.sessionId})\n\n${suggestion}\n`;
  await appendFile(filePath, header, "utf-8");
}
