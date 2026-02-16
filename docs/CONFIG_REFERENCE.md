# Rzeclaw 配置说明

以下为 `rzeclaw.json`（或 `.rzeclaw.json`、`~/.rzeclaw/config.json`）的完整示例与各字段说明。配置为可选；未提供时使用默认值。

---

## 完整示例

```json
{
  "model": "anthropic/claude-sonnet-4-20250514",
  "workspace": "C:\\Users\\me\\projects\\myapp",
  "port": 18789,
  "apiKeyEnv": "ANTHROPIC_API_KEY",
  "contextWindowRounds": 5,
  "reflectionToolCallInterval": 3,
  "summaryEveryRounds": 4,
  "memory": {
    "enabled": true,
    "storagePath": null,
    "workspaceId": "myapp",
    "coldAfterDays": 30
  },
  "evolution": {
    "bootstrapDocPath": "WORKSPACE_BEST_PRACTICES.md"
  },
  "planning": {
    "enabled": true,
    "maxSteps": 10,
    "complexThresholdChars": 80
  }
}
```

---

## 顶层字段

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `model` | string | `anthropic/claude-sonnet-4-20250514` | LLM 模型 ID，前缀 `anthropic/` 会在调用时去掉。 |
| `workspace` | string | `~/.rzeclaw/workspace` | 工作区根目录：文件操作、bash 的 cwd、记忆与快照的存储根。 |
| `port` | number | 18789 | Gateway WebSocket 服务端口。 |
| `apiKeyEnv` | string | `ANTHROPIC_API_KEY` | 环境变量名，用于读取 API Key。 |
| `contextWindowRounds` | number | 5 | 传入模型的最近对话轮数（每轮 = 1 user + 1 assistant）。 |
| `reflectionToolCallInterval` | number | 3 | 每 K 次工具调用后插入一次「执行后反思」提示。 |
| `summaryEveryRounds` | number | 0 | L0 每 M 轮生成会话内摘要（0=关闭）；下一轮上下文 = 摘要 + 最近 1～2 轮。 |

---

## memory

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `enabled` | boolean | false | 是否启用长期记忆（L1 写入、检索、L2 推进）。 |
| `storagePath` | string | (未用) | 预留；当前存储路径由 workspace + `.rzeclaw/memory` 派生。 |
| `workspaceId` | string | (由 workspace 派生) | 隔离键：记忆与审计按此区分；不同 workspaceId 互不可见。 |
| `coldAfterDays` | number | 0 | 创建时间早于 N 天的 L1 条目移入冷存储（0=不归档）；会话结束可自动触发归档。 |

---

## evolution

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `bootstrapDocPath` | string | `WORKSPACE_BEST_PRACTICES.md` | 相对 workspace 或绝对路径；会话中只读注入到 system。 |

---

## planning

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `enabled` | boolean | false | 是否启用轻量规划（复杂请求先出步骤再执行）。 |
| `maxSteps` | number | 10 | 步骤列表最多保留条数。 |
| `complexThresholdChars` | number | 80 | 消息长度超过此值即视为复杂请求；也可由关键词触发。 |

---

## 配置文件查找顺序

1. 当前目录 `rzeclaw.json`  
2. 当前目录 `.rzeclaw.json`  
3. 用户目录 `~/.rzeclaw/config.json`（Windows 为 `%USERPROFILE%\.rzeclaw\config.json`）  

CLI 可通过参数指定配置文件路径（若支持）；Gateway 启动时使用上述顺序加载。
