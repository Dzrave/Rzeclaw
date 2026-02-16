# 快照与审计的访问控制建议（WO-511）

本文档说明快照与审计文件的存储位置、权限建议及可选的会话归属校验，便于在多用户或敏感场景下加固。

---

## 1. 文件位置

| 内容 | 路径（相对 workspace） |
|------|------------------------|
| 会话快照 | `.rzeclaw/snapshots/<sessionId>.json` |
| 审计日志 | `.rzeclaw/audit.jsonl` |
| 会话指标 | `.rzeclaw/sessions.jsonl` |
| 记忆热/冷 | `.rzeclaw/memory/*.jsonl` |

所有路径均在 `config.workspace` 下；不同 workspace 之间天然隔离。

---

## 2. 权限建议

- **单机单用户**：保持目录默认权限即可；确保仅当前用户可读写 `workspace/.rzeclaw`。
- **多用户同机**：  
  - 为每个用户或项目使用**不同 workspace**（或不同 `memory.workspaceId`），避免共享同一 `.rzeclaw` 目录。  
  - 若必须共享目录，则依赖操作系统对 `.rzeclaw` 的 ACL，使仅授权用户可访问。
- **快照与审计**：快照中含有会话消息与目标，审计中含有 entry_id、session_id、时间；二者均应视为**仅限授权主体**可读。不要在公开可写目录下使用默认 workspace。

---

## 3. Gateway 可选校验

当前 Gateway 按 `params.sessionId` 区分会话，**不校验请求方身份**。若需「仅允许某 identity 访问某 session」：

- 在调用 `session.restore`、`session.saveSnapshot`、`chat` 时，由上层传入 `identity`（如 user_id），Gateway 可将 `identity` 与 `sessionId` 的绑定关系持久化（例如内存 Map 或外部存储），并在后续请求中校验：仅当当前请求的 identity 与创建该 session 的 identity 一致时允许恢复/写入。  
- 本仓库暂不实现具体 identity 存储与校验逻辑，仅在此约定：**若需访问控制，应在 Gateway 层或反向代理层实现**，并确保 `sessionId` 与身份绑定后再调用现有 Rzeclaw 方法。

---

## 4. 审计日志的敏感信息

审计日志中仅包含：`when`、`who`（session_id）、`from_where`、`entry_id`、`workspace_id`，**不包含记忆内容**。若 L1 写入时已做敏感信息过滤（WO-510），则审计记录本身不放大敏感数据；导出审计时注意导出文件的权限与存放位置。
