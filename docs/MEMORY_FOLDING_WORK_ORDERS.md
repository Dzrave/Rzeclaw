# 记忆折叠（5 天滑动情景记忆）— 工单

基于 `docs/MEMORY_FOLDING_ASSESSMENT.md` 与 `docs/记忆折叠构建讨论` 进行工单拆解。**实现前需确认该评估与讨论文档。**

---

## 一、工单列表

### 17A：账本存储与读写、配置

| 工单 ID | 名称 | 依赖 | 范围 | 验收标准 |
|---------|------|------|------|----------|
| **WO-1701** | 滚动账本类型与 schema | 无 | 定义 `RollingLedger`（memory_window、current_focus、rolling_ledger: DayEntry[]）、`DayEntry`（day、date、summary、pending_tasks?）；与讨论中 JSON 一致；导出类型 | 类型可被 memory 与 gateway 引用；DayEntry 含 date YYYY-MM-DD、summary、可选 pending_tasks |
| **WO-1702** | 账本存储路径与读写 API | 1701 | 存储路径：`workspace/.rzeclaw/memory/rolling_ledger.json`；实现 `readRollingLedger(workspaceDir)`、`writeRollingLedger(workspaceDir, ledger)`；无文件时返回空账本结构（rolling_ledger=[]） | 读空路径得到合法空账本；写入后读出一致；目录不存在时 mkdir recursive |
| **WO-1703** | 记忆折叠配置 schema | 无 | 在 config 中增加 `memory.rollingLedger`：enabled、windowDays（默认 5）、可选 timezone（默认本地）；类型定义与默认值 | 配置可被 loadConfig 解析；与 MEMORY_FOLDING_ASSESSMENT §4.2 一致 |

### 17B：请求侧注入

| 工单 ID | 名称 | 依赖 | 范围 | 验收标准 |
|---------|------|------|------|----------|
| **WO-1710** | 账本格式化为自然语言 | 1701 | 实现 `formatRollingLedgerForPrompt(ledger, options?)`：将 rolling_ledger + current_focus 转为一段精简自然语言（如「今天是 X。近期进展：昨天 …；前天 …；…」），控制长度约 300–500 token 量级 | 输出为单段字符串；含今日日期与各日摘要；可选含 pending_tasks |
| **WO-1711** | 构造 system prompt 时注入账本 | 1702, 1710 | 在 Gateway/chat-executor 构建传给 Agent 的上下文时：若 `memory.rollingLedger.enabled`，则读取账本、formatRollingLedgerForPrompt，将结果拼接到 system prompt（与现有 sessionSummary 协同：建议「账本梗概」在前，「当前会话摘要」在后） | 启用时 Agent 收到 [Rolling context] 段；与 sessionSummary 不冲突 |
| **WO-1712** | 隐私模式不注入账本 | 1711 | 若会话 `sessionFlags.privacy === true`，则不读取账本或注入空字符串；不将当日缓冲写入（见 17C） | 隐私会话无 5 天账本注入、不写今日缓冲 |

### 17C：当日数据来源与缓冲

| 工单 ID | 名称 | 依赖 | 范围 | 验收标准 |
|---------|------|------|------|----------|
| **WO-1720** | 今日缓冲存储形态与 schema | 无 | 定义「今日缓冲」：按本地日历日（YYYY-MM-DD）分片；每 workspace 一个文件如 `workspace/.rzeclaw/memory/today_buffer_YYYY-MM-DD.jsonl` 或单文件内按 date 键聚合；每条：date、ts、sessionId、content（摘要或片段）、可选 source | 可追加、可按 date 读取；与 MEMORY_FOLDING_ASSESSMENT §2.2「当日对话数据来源」一致 |
| **WO-1721** | 写入今日缓冲的时机 | 1720 | 在 flushToL1 成功后、或会话 summary 更新时：将当日 date、sessionId、本次 summary（或片段）追加到今日缓冲；若 privacy 则不写 | 有会话活动且非隐私时，今日缓冲有新增行 |
| **WO-1722** | 读取今日缓冲 API | 1720 | 实现 `readTodayBuffer(workspaceDir, date)`：返回指定 date 的缓冲内容（拼接为文本或结构化数组），供折叠任务消费；date 缺省时为「今天」本地日 | 折叠任务可拉取「今日」全部内容做日级摘要 |

### 17D：折叠任务

| 工单 ID | 名称 | 依赖 | 范围 | 验收标准 |
|---------|------|------|------|----------|
| **WO-1730** | 折叠 LLM：日级摘要 + pending_tasks | 1722 | 实现折叠用 Prompt：输入为今日缓冲内容，要求 LLM 输出「约 100 字核心进展」+「未完成 Pending Tasks 列表」；解析为 { summary, pending_tasks: string[] } | 与讨论「请将今天的对话提炼成 100 字以内…并提取出未完成的 Pending Tasks」一致 |
| **WO-1731** | 更新账本：prepend + FIFO | 1702, 1730 | 将折叠得到的日摘要作为新 Day -1 插入 rolling_ledger；原 Day -1→-2…→-5；超出 windowDays 的尾部移除；被挤出的 Day -5 返回供 1733 使用；写回文件 | 账本条数 ≤ windowDays；顺序为从新到旧 |
| **WO-1732** | 折叠触发时机 | 1731 | 支持：(1) 显式 RPC 如 `memory.fold` 或 `retrospective.run` 内先执行折叠再复盘；(2) 可选 cron `memory.rollingLedger.foldCron`；执行时「今日」指上一日历日（即凌晨跑则折叠「昨天」） | 调用折叠后账本更新；cron 可选 |
| **WO-1733** | 淘汰 Day -5 时调用 RAG/GC 钩子 | 1731 | 折叠时若挤出 Day -5：调用「淘汰判定」接口（WO-1740）；若判定入 RAG 则写入 L1 或内源 RAG；否则不写入（GC） | 与 Phase E 衔接；可先实现为「仅 GC」占位 |

### 17E：淘汰→RAG、文档与验收

| 工单 ID | 名称 | 依赖 | 范围 | 验收标准 |
|---------|------|------|------|----------|
| **WO-1740** | 淘汰判定：入 RAG vs GC | 1733 | 对被挤出的 Day -5 条目：规则判定（如 summary 长度、关键词）或可选轻量 LLM「是否有持久价值」；若保留则调用现有 flushToL1 或等价写入单条事实/摘要到 store；否则不写 | 可配置为「全部 GC」或「满足条件则入 RAG」；与 MEMORY_FOLDING_ASSESSMENT §2.2 一致 |
| **WO-1741** | 折叠 pending_tasks 与早报/待审对接（可选） | 1730 | 折叠产出的 pending_tasks 写入复盘待审区或早报的「昨日未完成任务」字段；与现有 pending 结构兼容 | 用户可在早报中看到「昨日未完成」；可选 |
| **WO-1750** | CONFIG_REFERENCE 记忆折叠配置 | 1703 | 在 CONFIG_REFERENCE 中补充 memory.rollingLedger 各字段说明、foldCron 示例、windowDays、与隐私的衔接 | 配置可查 |
| **WO-1751** | MASTER_IMPLEMENTATION_PLAN 索引 Phase 17 | 无 | 在 MASTER_IMPLEMENTATION_PLAN 的「下一阶段与可选」中增加 Phase 17：记忆折叠；指向本实施计划与工单文档 | 阶段可查 |
| **WO-1752** | 单元/集成测试：账本读写与注入 | 1702, 1710, 1711 | 测试：写账本后读出一致；formatRollingLedgerForPrompt 含日期与摘要；启用时注入段非空；隐私时不注入 | 至少 2 个用例通过 |

---

## 二、依赖关系简图

```
17A: WO-1701 ── WO-1702
     WO-1703（独立）

17B: WO-1702, WO-1710 ── WO-1711 ── WO-1712

17C: WO-1720 ── WO-1721, WO-1722

17D: WO-1722, WO-1702 ── WO-1730 ── WO-1731 ── WO-1732
     WO-1731 ── WO-1733

17E: WO-1733 ── WO-1740
     WO-1730 ── WO-1741（可选）
     WO-1703 ── WO-1750
     WO-1751 无依赖
     WO-1702, WO-1710, WO-1711 ── WO-1752
```

**建议实现顺序**：  
1701 → 1702 → 1703 → 1710 → 1711 → 1712 → 1720 → 1721 → 1722 → 1730 → 1731 → 1732 → 1733 → 1740 → 1750 → 1751 → 1752；1741 按需。

---

## 三、设计文档索引

| 依据 | 文档 |
|------|------|
| 评估与设计 | `docs/MEMORY_FOLDING_ASSESSMENT.md` |
| 讨论来源 | `docs/记忆折叠构建讨论` |
| 实施计划 | `docs/MEMORY_FOLDING_IMPLEMENTATION_PLAN.md` |
| 关联 | `docs/RAG与复盘机制详细设计.md`（复盘、早报）；`src/memory/session-summary-file.ts`、`src/retrospective/architect.ts` |

---

*实现时以 MEMORY_FOLDING_ASSESSMENT.md 与本文档为准。*
