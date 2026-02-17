/**
 * WO-403: 轻量规划。对复杂请求先让模型输出步骤列表（不执行），再在上下文中按步执行。
 */

import type { RzeclawConfig } from "../config.js";
import { getLLMClient } from "../llm/index.js";

const PLAN_PROMPT = `你仅需输出「步骤列表」，每行一步，格式为：1. 第一步 2. 第二步 … 不要执行任何工具，不要解释其他内容。`;

const COMPLEX_PATTERN = /先|再|然后|步骤|第一步|分步|依次|首先|接着|最后|多个|几个文件|多个命令/i;

/**
 * 判断是否为「复杂请求」（需先规划再执行）。
 */
export function isComplexRequest(
  userMessage: string,
  config: RzeclawConfig
): boolean {
  if (!config.planning?.enabled) return false;
  const threshold = config.planning.complexThresholdChars ?? 80;
  if ((userMessage ?? "").trim().length >= threshold) return true;
  return COMPLEX_PATTERN.test(userMessage ?? "");
}

/**
 * 调用模型获取步骤列表（仅文本，不调用工具）。返回格式化后的步骤文本，失败或空则返回空串。
 */
export async function fetchPlanSteps(
  config: RzeclawConfig,
  userMessage: string
): Promise<string> {
  let text = "";
  try {
    const client = getLLMClient(config);
    const response = await client.createMessage({
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `${PLAN_PROMPT}\n\n用户请求：\n${userMessage}`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    text = textBlock && "text" in textBlock ? textBlock.text.trim() : "";
    if (!text) return "";
  } catch {
    return "";
  }

  const maxSteps = config.planning?.maxSteps ?? 10;
  const lines = text
    .split("\n")
    .map((l) => l.replace(/^\s*[\d\-\.、]+\.?\s*/, "").trim())
    .filter(Boolean)
    .slice(0, maxSteps);

  if (lines.length === 0) return "";
  return lines.map((s, i) => `${i + 1}. ${s}`).join("\n");
}
