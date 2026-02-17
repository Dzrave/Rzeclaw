import Anthropic from "@anthropic-ai/sdk";
import type { ILLMClient, CreateMessageParams, LLMResponse, LLMTool } from "./types.js";

function toAnthropicTools(tools: LLMTool[]): Anthropic.Tool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: {
      type: "object" as const,
      properties: t.inputSchema.properties ?? {},
      required: t.inputSchema.required ?? [],
    },
  }));
}

function toAnthropicContent(
  content: CreateMessageParams["messages"][0]["content"]
): Anthropic.MessageParam["content"] {
  if (typeof content === "string") return content;
  return content as Anthropic.MessageParam["content"];
}

export function createAnthropicClient(apiKey: string, model: string): ILLMClient {
  const client = new Anthropic({ apiKey });
  return {
    async createMessage(params: CreateMessageParams): Promise<LLMResponse> {
      const messages: Anthropic.MessageParam[] = params.messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role as "user" | "assistant", content: toAnthropicContent(m.content) }));
      const response = await client.messages.create({
        model,
        max_tokens: params.max_tokens ?? 8192,
        system: params.system,
        messages,
        tools: params.tools?.length ? toAnthropicTools(params.tools) : undefined,
      });
      const content = response.content.map((block) => {
        if (block.type === "text") return { type: "text" as const, text: block.text };
        return {
          type: "tool_use" as const,
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        };
      });
      return { content, stop_reason: response.stop_reason ?? undefined };
    },
  };
}
