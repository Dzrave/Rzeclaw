# 多工作区与请求级 workspace 约定（WO-514）

本文档说明如何按「工作区」隔离记忆、快照与审计，以及 Gateway 请求级 workspace 覆盖的约定。

---

## 1. 隔离维度

- **config.workspace**：默认工作区根目录；文件操作、bash cwd、`.rzeclaw` 下所有子目录均基于此路径。
- **memory.workspaceId**：记忆与审计的隔离键；同一 workspace 下可设不同 `workspaceId` 以区分「项目」或「租户」，对应 `memory/<workspaceId>.jsonl` 与 `memory/<workspaceId>_cold.jsonl`。  
- **请求级 workspace**：Gateway 的 `chat`、`session.*` 等方法支持在单次请求中传入 `params.workspace`，用于**覆盖**本次请求使用的 workspace 根路径（记忆、快照、审计、会话摘要等均基于该路径）。未传时使用 `config.workspace`。

---

## 2. Gateway 请求参数

| 方法 | 可选参数 | 说明 |
|------|----------|------|
| `chat` | `params.workspace` | 本次对话使用的工作区根路径（绝对或相对当前进程 cwd）；决定 L1 写入、快照、审计、冷归档的目录。 |
| `session.getOrCreate` / `session.restore` / `session.saveSnapshot` / `session.list` | （使用 config.workspace） | 当前实现下会话列表与快照基于**默认** config.workspace；若需多工作区，请在 `chat` 时传 `params.workspace`，并将会话与 workspace 的对应关系由上层维护。 |

约定：**同一 `sessionId` 在不同 `params.workspace` 下对应不同快照文件**（因快照路径为 `params.workspace/.rzeclaw/snapshots/<sessionId>.json`）。因此若前端支持多工作区，应保证「工作区 A 的 session1」与「工作区 B 的 session1」互不覆盖；推荐用 `workspaceId + sessionId` 或「每工作区独立 sessionId 命名空间」区分。

---

## 3. 多租户 / 多项目用法建议

- **单进程多工作区**：每个请求带 `params.workspace`，指向不同目录；记忆与快照按目录隔离。  
- **多进程**：每个进程使用不同 `config.workspace`（或通过环境变量/启动参数覆盖），无需改代码即可多实例隔离。  
- **memory.workspaceId**：在同一 `config.workspace` 下再按逻辑项目隔离记忆时使用；可与 `params.workspace` 组合（例如请求级 workspace 指向项目根，workspaceId 指向子模块）。

---

## 4. 与实现总结的对应

- 记忆读写、审计、冷归档、会话摘要、快照、指标均依赖「当前请求的 workspace 根」或 `memory.workspaceId`；  
- Gateway 在 `chat` 中已支持 `params.workspace` 覆盖；  
- CLI 当前使用 `config.workspace`，多工作区时可通过不同配置文件或环境变量指定 workspace。
