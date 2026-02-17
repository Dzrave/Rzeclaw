/**
 * MiniMax 云端大模型（M2-her 等）
 * @see https://platform.minimax.io/docs/api-reference/text-chat
 * 注意：当前 MiniMax 文本聊天 API 不支持 tool/function calling，请求带 tools 时会抛出明确错误，建议改用 anthropic/deepseek/ollama。
 */

import type { ILLMClient, CreateMessageParams, LLMResponse, LLMMessage, LLMContentBlock, LLMToolResultBlock } from "./types.js";

const DEFAULT_BASE = "https://api.minimax.io";

function toMiniMaxMessages(system: string | undefined, messages: LLMMessage[]): Array<{ role: string; content: string }> {
  const out: Array<{ role: string; content: string }> = [];
  if (system) out.push({ role: "system", content: system });
  for (const m of messages) {
    let c: string;
    if (typeof m.content === "string") c = m.content;
    else {
      const textBlock = (m.content as (LLMContentBlock | LLMToolResultBlock)[]).find((b) => b.type === "text");
      c = textBlock && "text" in textBlock ? textBlock.text : "";
    }
    if (m.role === "system") {
      if (!out.length || out[out.length - 1].role !== "system") out.push({ role: "system", content: c });
      else (out[out.length - 1] as { content: string }).content += "\n\n" + c;
    } else out.push({ role: m.role, content: c });
  }
  return out;
}

export function createMiniMaxClient(apiKey: string, model: string, baseURL?: string): ILLMClient {
  const base = (baseURL ?? DEFAULT_BASE).replace(/\/$/, "");
  return {
    async createMessage(params: CreateMessageParams): Promise<LLMResponse> {
      if (params.tools && params.tools.length > 0) {
        throw new Error(
          "MiniMax 当前不支持工具调用（tool calling）。请将 llm.provider 改为 anthropic、deepseek 或 ollama 以使用对话与工具能力。"
        );
      }
      const res = await fetch(`${base}/v1/text/chatcompletion_v2`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || "M2-her",
          messages: toMiniMaxMessages(params.system, params.messages),
          max_completion_tokens: Math.min(params.max_tokens ?? 2048, 2048),
        }),
      });
      if (!res.ok) {
        const err = (await res.text()) || res.statusText;
        throw new Error(`MiniMax API error ${res.status}: ${err}`);
      }
      const data = (await res.json()) as {
        base_resp?: { status_code?: number; status_msg?: string };
        choices?: Array<{ message?: { content?: string; role?: string } }>;
      };
      const code = data.base_resp?.status_code;
      if (code !== undefined && code !== 0) {
        throw new Error(`MiniMax API 业务错误: ${data.base_resp?.status_msg ?? code}`);
      }
      const text = data.choices?.[0]?.message?.content ?? "";
      return {
        content: text ? [{ type: "text", text }] : [],
        stop_reason: "stop",
      };
    },
  };
}
