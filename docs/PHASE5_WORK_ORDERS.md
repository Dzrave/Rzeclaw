# Phase 5：质量、增强与运维工单（拆解）

基于《下一步建议》中除第 5 项（Bootstrap 用户确认后追加）外的内容拆解为工单，按依赖与实现顺序排列。**以下工单均已实现。**

---

## 一、工单列表

| 工单 ID | 名称 | 来源 | 范围 | 验收标准 |
|---------|------|------|------|----------|
| **WO-501** | 回归验收步骤与脚本 | 建议 1 | 编写验收检查项文档；可选可执行验收脚本（检查单轮/多轮、L1 写入、检索、无记忆/有记忆路径）。 | 文档或脚本可被人工/CI 执行，检查项覆盖关键路径。 |
| **WO-502** | 记忆层单元测试 | 建议 2 | store-jsonl、retrieve、write-pipeline 解析、l2 去重逻辑的单测。 | 关键分支有单测，npm test 通过。 |
| **WO-503** | 其他关键模块单测 | 建议 2 | task-hint、snapshot、cold-archive、audit-query 的单测。 | 同上。 |
| **WO-504** | 配置与文档对齐 | 建议 3 | CONFIG_REFERENCE.md 或 README 中完整 rzeclaw.json 示例与各字段说明。 | 配置项有据可查，示例可直接复制使用。 |
| **WO-505** | L0 每 M 轮自动摘要 | 建议 4 | 配置 summaryEveryRounds；多轮会话内每 M 轮触发摘要生成并更新 sessionSummary；下一轮 = 摘要 + 最近 1～2 轮。 | 达到 M 轮时生成摘要；后续轮上下文为摘要+最近轮。 |
| **WO-506** | 规划步骤进度回填 | 建议 6 | 当存在 [Plan] 时，每轮工具执行后向上下文注入「已完成步骤 X，当前步骤 Y」。 | 规划模式下每轮工具后可见进度提示。 |
| **WO-507** | 冷归档会话结束触发 | 建议 7 | Gateway 在会话结束且 memory 写入后，若配置 coldAfterDays 则调用 archiveCold。 | 启用冷归档时会话结束自动归档。 |
| **WO-508** | 审计与指标汇总导出 | 建议 8 | 按时间/会话汇总审计的 CLI 或脚本；metrics 汇总导出（如 JSON）。 | 可导出审计汇总与会话指标。 |
| **WO-509** | 健康检查与诊断 | 建议 9 | Gateway method health/ready；CLI health 子命令；检查配置、workspace 可写、API key 可用。 | 健康接口返回明确状态。 |
| **WO-510** | 敏感信息不入记忆 | 建议 10 | write-pipeline 写入前简单规则过滤：密钥模式、绝对路径等；匹配则跳过或脱敏。 | 明显敏感内容不写入 L1。 |
| **WO-511** | 快照与审计访问控制 | 建议 11 | 文档明确快照/审计文件权限建议；Gateway 可选 sessionId 与 identity 校验。 | 文档完整；可选校验可开启。 |
| **WO-512** | 会话列表与恢复入口 | 建议 12 | Gateway session.list 返回最近会话 id 列表（基于快照目录）；恢复入口已有，补列表。 | 可列出会话并恢复。 |
| **WO-513** | 记忆引用可解释性 | 建议 13 | runAgentLoop 返回本轮引用的 memory ids；Gateway chat 响应带 citedMemoryIds。 | 前端可展示「依据 Memory#id」。 |
| **WO-514** | 多 workspace 约定与文档 | 建议 14 | 文档化「请求带 workspaceId」的约定；Gateway 支持请求级 workspace 覆盖。 | 文档与行为一致，多工作区可区分。 |

---

## 二、建议实现顺序

1. WO-504（配置文档）→ 便于后续功能引用配置项  
2. WO-501（验收步骤/脚本）  
3. WO-502、WO-503（单测）  
4. WO-505（L0 每 M 轮摘要）  
5. WO-506（规划进度回填）  
6. WO-507（冷归档触发）  
7. WO-508（审计/指标导出）  
8. WO-509（健康检查）  
9. WO-510（敏感信息过滤）  
10. WO-511（快照/审计访问控制）  
11. WO-512（会话列表）  
12. WO-513（引用可解释性）  
13. WO-514（多 workspace 文档与约定）  

---

## 三、依赖关系

- WO-505 依赖现有 context/buildContextMessages 与 Gateway 多轮会话状态（sessionSummary）。  
- WO-506 依赖 WO-403 规划注入逻辑。  
- WO-507 依赖现有 archiveCold、config.memory.coldAfterDays。  
- WO-513 依赖 retrieve 返回的 entries（ids）在 loop 中传出。  
- WO-512 依赖快照目录与 readSnapshot；WO-514 与 memory/快照的 workspaceId 已有逻辑可复用。  

其余工单无交叉依赖，可按上表顺序实现。
