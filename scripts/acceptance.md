# 回归验收检查项

按《实现计划与工单》验收与回归要求，完成 Phase 5 后建议执行以下检查（可人工或配合 `scripts/acceptance-check.mjs` 使用）。

---

## 1. 构建与配置

- [ ] `npm run build` 通过。
- [ ] `rzeclaw health`（或 `node scripts/acceptance-check.mjs config`）能加载配置且 workspace 可写、API key 已配置时返回正常。

---

## 2. 单轮与多轮 Agent（无记忆）

- [ ] `rzeclaw agent "列出当前目录"` 能返回内容且无报错。
- [ ] Gateway：`chat` 单条消息有回复；再发第二条，会话上下文包含首条（或按 contextWindowRounds 裁剪）。

---

## 3. 记忆路径（memory.enabled: true）

- [ ] 配置中 `memory.enabled: true`，执行两轮以上对话后，`workspace/.rzeclaw/memory/*.jsonl` 有新增条目。
- [ ] `workspace/.rzeclaw/session_summaries/<session_id>.md` 存在且内容为会话摘要。
- [ ] `workspace/.rzeclaw/audit.jsonl` 有对应写入记录。
- [ ] 新会话中提问与上一会话相关时，回复能引用或体现「记忆」内容（可观察 system 注入的 Memory# 块）。

---

## 4. 无记忆与有记忆兼容

- [ ] `memory.enabled: false` 时，不写入 L1、不写 session_summaries、不写 audit；Agent 行为与「无记忆」一致。
- [ ] 同一代码路径下通过配置切换，无报错。

---

## 5. 会话快照与恢复

- [ ] Gateway：多轮 chat 后调用 `session.saveSnapshot`（若未自动保存则手动），再 `session.restore` 同 sessionId，下一轮 chat 上下文与恢复前一致。
- [ ] CLI：`rzeclaw agent --restore <sessionId> "继续"` 能基于该 sessionId 的快照继续对话。

---

## 6. 健康与冷归档

- [ ] Gateway 方法 `health` 返回 `{ ok, configLoaded, workspaceWritable, apiKeySet }` 等。
- [ ] 配置 `memory.coldAfterDays > 0` 且执行 `archive-cold` 或会话结束触发后，热文件仅剩近期条目，冷文件存在旧条目；检索默认仅热，可选 includeCold 合并冷数据。

---

## 7. 审计与指标导出

- [ ] `rzeclaw audit-export` 能按时间/会话过滤并导出 JSON 或 CSV。
- [ ] `rzeclaw metrics-export`（若已实现）能导出会话指标 JSON。

---

执行完以上检查项即可认为关键路径回归通过；单测由 `npm test` 覆盖。
