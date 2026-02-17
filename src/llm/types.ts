/**
 * 统一 LLM 调用接口：与具体厂商解耦，供 Agent 循环、规划、记忆、Heartbeat、进化等使用。
 */

export type LLMMessageRole = "user" | "assistant" | "system";

export type LLMToolResultBlock = { type: "tool_result"; tool_use_id: string; content: string };

/** 单条消息的 content：字符串或内容块（含 tool_result 供多轮工具调用） */
export type LLMMessageContent = string | (LLMContentBlock | LLMToolResultBlock)[];

export type LLMMessage = {
  role: LLMMessageRole;
  content: LLMMessageContent;
};

/** 工具定义（与 Anthropic input_schema 对齐，各适配器内部转为厂商格式） */
export type LLMTool = {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
  };
};

export type LLMContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };

export type LLMResponse = {
  content: LLMContentBlock[];
  stop_reason?: string;
};

export type CreateMessageParams = {
  system?: string;
  messages: LLMMessage[];
  tools?: LLMTool[];
  max_tokens?: number;
};

/**
 * 统一 LLM 客户端：各提供商（Anthropic、DeepSeek、MiniMax、Ollama）实现此接口。
 */
export type ILLMClient = {
  createMessage(params: CreateMessageParams): Promise<LLMResponse>;
};
