/**
 * DeepSeek 云端大模型：OpenAI 兼容 API
 * @see https://api-docs.deepseek.com/api/create-chat-completion
 */

import type {
  ILLMClient,
  CreateMessageParams,
  LLMResponse,
  LLMMessage,
  LLMTool,
  LLMContentBlock,
  LLMToolResultBlock,
} from "./types.js";

const DEFAULT_BASE = "https://api.deepseek.com";

type OpenAIMsg =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> }
  | { role: "tool"; tool_call_id: string; content: string };

function toOpenAIMessages(system: string | undefined, messages: LLMMessage[]): OpenAIMsg[] {
  const out: OpenAIMsg[] = [];
  if (system) out.push({ role: "system", content: system });
  for (const m of messages) {
    if (m.role === "system") {
      const c = typeof m.content === "string" ? m.content : "";
      if (!out.length || out[out.length - 1].role !== "system") out.push({ role: "system", content: c });
      else (out[out.length - 1] as { content: string }).content += "\n\n" + c;
      continue;
    }
    const content = m.content;
    if (typeof content === "string") {
      out.push({ role: m.role as "user", content });
      continue;
    }
    const blocks = content as (LLMContentBlock | LLMToolResultBlock)[];
    const toolUse = blocks.filter((b): b is LLMContentBlock & { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } => b.type === "tool_use");
    const toolResult = blocks.filter((b): b is LLMToolResultBlock => b.type === "tool_result");
    if (m.role === "assistant" && toolUse.length) {
      const textBlock = blocks.find((b) => b.type === "text");
      out.push({
        role: "assistant",
        content: textBlock && "text" in textBlock ? textBlock.text : null,
        tool_calls: toolUse.map((t) => ({
          id: t.id,
          type: "function" as const,
          function: { name: t.name, arguments: JSON.stringify(t.input) },
        })),
      });
    } else if (m.role === "user" && toolResult.length) {
      for (const tr of toolResult) {
        out.push({ role: "tool", tool_call_id: tr.tool_use_id, content: tr.content });
      }
    } else {
      const text = blocks.find((b) => b.type === "text");
      out.push({ role: m.role as "user", content: text && "text" in text ? text.text : "" });
    }
  }
  return out;
}

function toOpenAITools(tools: LLMTool[]) {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: "object" as const,
        properties: t.inputSchema.properties ?? {},
        required: t.inputSchema.required ?? [],
      },
    },
  }));
}

export function createDeepSeekClient(apiKey: string, model: string, baseURL?: string): ILLMClient {
  const base = (baseURL ?? DEFAULT_BASE).replace(/\/$/, "");
  return {
    async createMessage(params: CreateMessageParams): Promise<LLMResponse> {
      const body: Record<string, unknown> = {
        model,
        max_tokens: params.max_tokens ?? 8192,
        messages: toOpenAIMessages(params.system, params.messages),
      };
      if (params.tools?.length) body.tools = toOpenAITools(params.tools);
      const res = await fetch(`${base}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.text()) || res.statusText;
        throw new Error(`DeepSeek API error ${res.status}: ${err}`);
      }
      const data = (await res.json()) as {
        choices?: Array<{
          message?: {
            content?: string | null;
            tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
          };
        }>;
      };
      const msg = data.choices?.[0]?.message;
      const content: LLMResponse["content"] = [];
      if (msg?.tool_calls?.length) {
        for (const tc of msg.tool_calls) {
          let input: Record<string, unknown> = {};
          try {
            input = tc.function.arguments ? (JSON.parse(tc.function.arguments) as Record<string, unknown>) : {};
          } catch {
            // ignore
          }
          content.push({ type: "tool_use", id: tc.id, name: tc.function.name, input });
        }
      }
      if (msg?.content != null && String(msg.content).trim()) {
        content.push({ type: "text", text: String(msg.content) });
      }
      return { content, stop_reason: "end_turn" };
    },
  };
}
