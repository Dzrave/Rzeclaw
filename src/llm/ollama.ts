/**
 * Ollama 本地模型
 * @see https://docs.ollama.com/api/chat
 * 无 API Key；baseURL 默认 http://localhost:11434；支持 tools（部分模型支持）。
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

const DEFAULT_BASE = "http://localhost:11434";

type OllamaMsg =
  | { role: string; content: string }
  | { role: "assistant"; content?: string; tool_calls?: Array<{ type: "function"; function: { name: string; arguments: Record<string, unknown> } }> }
  | { role: "tool"; tool_name: string; content: string };

function toOllamaMessages(system: string | undefined, messages: LLMMessage[]): OllamaMsg[] {
  const out: OllamaMsg[] = [];
  const idToName: Record<string, string> = {};
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
      out.push({ role: m.role, content });
      continue;
    }
    const blocks = content as (LLMContentBlock | LLMToolResultBlock)[];
    const toolUseBlocks = blocks.filter((b): b is LLMContentBlock & { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } => b.type === "tool_use");
    const toolResult = blocks.filter((b): b is LLMToolResultBlock => b.type === "tool_result");
    if (m.role === "assistant" && toolUseBlocks.length) {
      for (const t of toolUseBlocks) idToName[t.id] = t.name;
      const textBlock = blocks.find((b) => b.type === "text");
      out.push({
        role: "assistant",
        content: textBlock && "text" in textBlock ? textBlock.text : undefined,
        tool_calls: toolUseBlocks.map((t) => ({ type: "function" as const, function: { name: t.name, arguments: t.input } })),
      });
    } else if (m.role === "user" && toolResult.length) {
      for (const tr of toolResult) {
        out.push({ role: "tool", tool_name: idToName[tr.tool_use_id] ?? "unknown", content: tr.content });
      }
    } else {
      const text = blocks.find((b) => b.type === "text");
      out.push({ role: m.role, content: text && "text" in text ? text.text : "" });
    }
  }
  return out;
}

function toOllamaTools(tools: LLMTool[]) {
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

export function createOllamaClient(model: string, baseURL?: string): ILLMClient {
  const base = (baseURL ?? DEFAULT_BASE).replace(/\/$/, "");
  return {
    async createMessage(params: CreateMessageParams): Promise<LLMResponse> {
      const body: Record<string, unknown> = {
        model: model || "llama3.2",
        messages: toOllamaMessages(params.system, params.messages),
        stream: false,
        options: { num_predict: params.max_tokens ?? 8192 },
      };
      if (params.tools?.length) body.tools = toOllamaTools(params.tools);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000);
      let res: Response;
      try {
        res = await fetch(`${base}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (e) {
        clearTimeout(timeout);
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("abort") || msg.includes("fetch")) {
          throw new Error(
            "Ollama 请求超时或不可达。请确认 Ollama 已启动（如运行 ollama serve），或配置 llm.fallbackProvider 在本地不可用时回退到云端。"
          );
        }
        throw e;
      }
      clearTimeout(timeout);
      if (!res.ok) {
        const err = (await res.text()) || res.statusText;
        throw new Error(`Ollama API error ${res.status}: ${err}`);
      }
      const data = (await res.json()) as {
        message?: {
          content?: string;
          tool_calls?: Array<{ function?: { name?: string; arguments?: Record<string, unknown> } }>;
        };
        done_reason?: string;
      };
      const msg = data.message;
      const content: LLMResponse["content"] = [];
      const toolCalls = msg?.tool_calls ?? [];
      for (let i = 0; i < toolCalls.length; i++) {
        const tc = toolCalls[i];
        const fn = tc.function;
        const name = fn?.name ?? `tool_${i}`;
        const input = (fn?.arguments as Record<string, unknown>) ?? {};
        content.push({ type: "tool_use", id: `ollama-${i}`, name, input });
      }
      if (msg?.content != null && String(msg.content).trim()) {
        content.push({ type: "text", text: String(msg.content) });
      }
      return {
        content,
        stop_reason: data.done_reason ?? "stop",
      };
    },
  };
}
