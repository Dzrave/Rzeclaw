/**
 * 多模型统一入口：根据配置返回 LLM 客户端，支持云端/本地切换与 Ollama 不可用时的回退。
 */

import type { RzeclawConfig } from "../config.js";
import { getResolvedLlm } from "../config.js";
import type { ILLMClient, CreateMessageParams, LLMResponse } from "./types.js";
import { createAnthropicClient } from "./anthropic.js";
import { createDeepSeekClient } from "./deepseek.js";
import { createMiniMaxClient } from "./minimax.js";
import { createOllamaClient } from "./ollama.js";

function getApiKeyForProvider(config: RzeclawConfig, provider: "anthropic" | "deepseek" | "minimax"): string | undefined {
  const resolved = getResolvedLlm(config);
  const envName =
    provider === "anthropic"
      ? resolved.apiKeyEnv ?? "ANTHROPIC_API_KEY"
      : provider === "deepseek"
        ? resolved.apiKeyEnv ?? "DEEPSEEK_API_KEY"
        : resolved.apiKeyEnv ?? "MINIMAX_API_KEY";
  return process.env[envName]?.trim() || undefined;
}

/** 当 provider 为 ollama 且请求失败时，若配置了 fallbackProvider 则用云端重试一次 */
function createWithFallback(
  primary: ILLMClient,
  fallback: ILLMClient | null,
  isOllama: boolean
): ILLMClient {
  if (!fallback || !isOllama) return primary;
  return {
    async createMessage(params: CreateMessageParams): Promise<LLMResponse> {
      try {
        return await primary.createMessage(params);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (
          msg.includes("Ollama") ||
          msg.includes("超时") ||
          msg.includes("不可达") ||
          msg.includes("abort") ||
          msg.includes("fetch")
        ) {
          return fallback.createMessage(params);
        }
        throw e;
      }
    },
  };
}

/**
 * 根据 config 返回统一 LLM 客户端。无 llm 配置时等价于 Anthropic。
 * - anthropic / deepseek / minimax：需对应 API Key 环境变量。
 * - ollama：无需 Key；可配置 baseURL、fallbackProvider 在本地不可用时回退到云端。
 */
export function getLLMClient(config: RzeclawConfig): ILLMClient {
  const resolved = getResolvedLlm(config);
  const { provider, model, baseURL, fallbackProvider } = resolved;

  let primary: ILLMClient;
  switch (provider) {
    case "anthropic": {
      const apiKey = getApiKeyForProvider(config, "anthropic");
      if (!apiKey) {
        throw new Error(
          "未配置 Anthropic API Key。请设置环境变量 ANTHROPIC_API_KEY，或在配置中设置 llm.apiKeyEnv。"
        );
      }
      primary = createAnthropicClient(apiKey, model);
      break;
    }
    case "deepseek": {
      const apiKey = getApiKeyForProvider(config, "deepseek");
      if (!apiKey) {
        throw new Error(
          "未配置 DeepSeek API Key。请设置环境变量 DEEPSEEK_API_KEY，或在配置中设置 llm.apiKeyEnv。"
        );
      }
      primary = createDeepSeekClient(apiKey, model);
      break;
    }
    case "minimax": {
      const apiKey = getApiKeyForProvider(config, "minimax");
      if (!apiKey) {
        throw new Error(
          "未配置 MiniMax API Key。请设置环境变量 MINIMAX_API_KEY，或在配置中设置 llm.apiKeyEnv。"
        );
      }
      primary = createMiniMaxClient(apiKey, model);
      break;
    }
    case "ollama": {
      primary = createOllamaClient(model, baseURL ?? "http://localhost:11434");
      break;
    }
    default: {
      const apiKey = getApiKeyForProvider(config, "anthropic");
      if (!apiKey) {
        throw new Error("未配置 API Key。请设置 ANTHROPIC_API_KEY 或配置 llm。");
      }
      primary = createAnthropicClient(apiKey, model);
    }
  }

  let fallback: ILLMClient | null = null;
  if (provider === "ollama" && fallbackProvider) {
    switch (fallbackProvider) {
      case "anthropic": {
        const apiKey = getApiKeyForProvider(config, "anthropic");
        if (apiKey) fallback = createAnthropicClient(apiKey, "claude-sonnet-4-20250514");
        break;
      }
      case "deepseek": {
        const apiKey = getApiKeyForProvider(config, "deepseek");
        if (apiKey) fallback = createDeepSeekClient(apiKey, "deepseek-chat");
        break;
      }
      case "minimax": {
        const apiKey = getApiKeyForProvider(config, "minimax");
        if (apiKey) fallback = createMiniMaxClient(apiKey, "M2-her");
        break;
      }
    }
  }

  return createWithFallback(primary, fallback, provider === "ollama");
}

export type { ILLMClient, CreateMessageParams, LLMResponse, LLMMessage, LLMTool, LLMContentBlock } from "./types.js";
