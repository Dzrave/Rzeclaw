# 多模型与云端/本地切换说明

本文档说明：**当前支持的 LLM 提供商**、**配置方式**，以及**云端与本地模型切换、回退与边际处理**。

---

## 一、当前支持的模型

| 提供商 | 类型 | 说明 |
|--------|------|------|
| **anthropic** | 云端 | Claude 系列，通过 `@anthropic-ai/sdk`。默认 API Key 环境变量：`ANTHROPIC_API_KEY`。 |
| **deepseek** | 云端 | DeepSeek 云端大模型（OpenAI 兼容 API）。默认环境变量：`DEEPSEEK_API_KEY`。 |
| **minimax** | 云端 | MiniMax 云端大模型（如 M2-her）。默认环境变量：`MINIMAX_API_KEY`。**当前不支持工具调用**，仅适用于纯文本场景（规划、记忆、Heartbeat、进化）；若需对话+工具请使用 anthropic / deepseek / ollama。 |
| **ollama** | 本地 | 本地 Ollama 服务，默认 `http://localhost:11434`，无需 API Key。支持工具调用（依赖模型能力）。 |

---

## 二、配置方式

### 2.1 不配置 `llm`（兼容旧版）

仅设置顶层 `model` 与 `apiKeyEnv` 时，等价于使用 **Anthropic**：

```json
{
  "model": "anthropic/claude-sonnet-4-20250514",
  "apiKeyEnv": "ANTHROPIC_API_KEY"
}
```

### 2.2 使用 `llm` 段切换提供商

在 `rzeclaw.json` 中增加 **`llm`** 对象：

```json
{
  "llm": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-20250514",
    "apiKeyEnv": "ANTHROPIC_API_KEY"
  }
}
```

- **provider**：`anthropic` | `deepseek` | `minimax` | `ollama`
- **model**：该提供商的模型 ID（如 `deepseek-chat`、`M2-her`、`llama3.2`）
- **apiKeyEnv**：云端时用于读取 API Key 的环境变量名（ollama 可省略）
- **baseURL**：仅 **ollama** 可填，默认 `http://localhost:11434`
- **fallbackProvider**：仅当 **provider 为 ollama** 时生效；本地不可用时回退的云端提供商：`anthropic` | `deepseek` | `minimax`

### 2.3 示例

**仅用 DeepSeek：**
```json
{
  "llm": {
    "provider": "deepseek",
    "model": "deepseek-chat",
    "apiKeyEnv": "DEEPSEEK_API_KEY"
  }
}
```

**仅用本地 Ollama：**
```json
{
  "llm": {
    "provider": "ollama",
    "model": "llama3.2",
    "baseURL": "http://localhost:11434"
  }
}
```

**Ollama 为主、本地不可用时回退到 DeepSeek：**
```json
{
  "llm": {
    "provider": "ollama",
    "model": "llama3.2",
    "baseURL": "http://localhost:11434",
    "fallbackProvider": "deepseek"
  }
}
```
需同时设置 `DEEPSEEK_API_KEY`，回退时才会生效。

---

## 三、云端与本地切换机制

- **切换方式**：通过修改 **`llm.provider`** 即可在云端（anthropic / deepseek / minimax）与本地（ollama）之间切换，无需改业务代码。
- **就绪判断**：`isLlmReady(config)` 为真表示当前配置可调用 LLM。Ollama 无需 API Key 即视为就绪；云端需已配置对应 API Key。
- **Ollama 回退**：当 `llm.provider === "ollama"` 且配置了 **`fallbackProvider`** 时，若请求 Ollama 失败（超时、不可达等），会自动用该云端提供商重试一次；未配置则不回退，直接抛出错误。

---

## 四、边际与异常处理

| 场景 | 行为 |
|------|------|
| 云端未配置 API Key | 启动或首次调用时 `getLLMClient(config)` 抛出明确错误，提示设置对应环境变量或配置 `llm.apiKeyEnv`。 |
| Ollama 未启动或不可达 | 请求超时（约 120s）后抛出错误，提示确认 Ollama 已启动或配置 `fallbackProvider`。若配置了回退，则自动用云端重试。 |
| MiniMax 下发起带工具的对话 | 抛出明确错误，提示将 `llm.provider` 改为 anthropic、deepseek 或 ollama。 |
| 规划/记忆/Heartbeat/进化 调用失败 | 各模块内部 catch，返回空结果（如空步骤、空摘要、回退到规则判断等），不中断主流程。 |
| 回退时云端也无 Key | 仅当配置了 `fallbackProvider` 且对应环境变量有值时才会创建回退客户端；否则回退客户端为 null，仅用 Ollama，失败即抛错。 |

---

## 五、实现位置（供扩展参考）

- **配置与解析**：`src/config.ts`（`LlmConfig`、`getResolvedLlm`、`isLlmReady`）
- **统一接口**：`src/llm/types.ts`（`ILLMClient`、`CreateMessageParams`、`LLMResponse`）
- **适配器**：`src/llm/anthropic.ts`、`deepseek.ts`、`minimax.ts`、`ollama.ts`
- **工厂与回退**：`src/llm/index.ts`（`getLLMClient`、Ollama 失败时 fallback 重试）
