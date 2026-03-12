/**
 * WO-LM-002: 本地推理客户端。按 provider 调用 Ollama 或 OpenAI 兼容的 chat/completion，超时与错误处理。
 */

import type { RzeclawConfig } from "../config.js";

const DEFAULT_TIMEOUT_MS = 15_000;

function getLocalModelConfig(config: RzeclawConfig): {
  endpoint: string;
  model: string;
  provider: "ollama" | "openai-compatible";
  timeoutMs: number;
} | null {
  const lm = config.localModel;
  if (!lm?.enabled || !lm.endpoint?.trim() || !lm.model?.trim()) return null;
  const provider = lm.provider === "openai-compatible" ? "openai-compatible" : "ollama";
  return {
    endpoint: lm.endpoint.replace(/\/$/, ""),
    model: lm.model,
    provider,
    timeoutMs:
      typeof lm.timeoutMs === "number" && lm.timeoutMs > 0 ? lm.timeoutMs : DEFAULT_TIMEOUT_MS,
  };
}

/**
 * 调用本地模型单轮补全；返回模型输出文本，失败抛错或超时。
 */
export async function localModelComplete(
  config: RzeclawConfig,
  prompt: string,
  systemPrompt?: string
): Promise<string> {
  const cfg = getLocalModelConfig(config);
  if (!cfg) throw new Error("localModel not configured or disabled");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), cfg.timeoutMs);

  try {
    if (cfg.provider === "ollama") {
      const url = `${cfg.endpoint}/api/generate`;
      const body = systemPrompt
        ? { model: cfg.model, prompt: `${systemPrompt}\n\n${prompt}`, stream: false }
        : { model: cfg.model, prompt, stream: false };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Ollama error ${res.status}: ${t.slice(0, 200)}`);
      }
      const data = (await res.json()) as { response?: string };
      return typeof data.response === "string" ? data.response.trim() : "";
    }
    const url = `${cfg.endpoint}/v1/chat/completions`;
    const messages: Array<{ role: string; content: string }> = [];
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
    messages.push({ role: "user", content: prompt });
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        max_tokens: 1024,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`OpenAI-compatible error ${res.status}: ${t.slice(0, 200)}`);
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    return typeof content === "string" ? content.trim() : "";
  } catch (e) {
    clearTimeout(timeoutId);
    if (e instanceof Error) {
      if (e.name === "AbortError") throw new Error("本地模型请求超时");
      throw e;
    }
    throw new Error(String(e));
  }
}

export { getLocalModelConfig };
