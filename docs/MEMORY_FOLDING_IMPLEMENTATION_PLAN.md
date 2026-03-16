# 记忆折叠（5 天滑动情景记忆）— 实施计划

本文档为基于 **`docs/MEMORY_FOLDING_ASSESSMENT.md`** 与 **`docs/记忆折叠构建讨论`** 的**实施计划**：阶段划分、依赖关系、建议执行顺序与工单文档索引。

---

## 一、阶段总览

| 阶段 | 名称 | 工单范围 | 设计/评估文档 | 工单文档 |
|------|------|----------|----------------|----------|
| **Phase 17A** | 账本存储与读写、配置 | WO-1701～1703 | MEMORY_FOLDING_ASSESSMENT.md、记忆折叠构建讨论 | MEMORY_FOLDING_WORK_ORDERS.md |
| **Phase 17B** | 请求侧注入 | WO-1710～1712 | 同上 | 同上 |
| **Phase 17C** | 当日数据来源与缓冲 | WO-1720～1722 | 同上 | 同上 |
| **Phase 17D** | 折叠任务 | WO-1730～1733 | 同上 | 同上 |
| **Phase 17E** | 淘汰→RAG、文档与验收 | WO-1740～1741、WO-1750～1752 | 同上 | 同上 |

---

## 二、依赖关系

```
现有记忆层（session-summary-file、write-pipeline、agent/loop sessionSummary）
        ↓
Phase 17A：账本 schema、存储路径与读写 API、配置 schema
        ↓
Phase 17B：请求侧注入（读取账本 → 格式化为自然语言 → 拼接到 system prompt）
        ↓
Phase 17C：今日缓冲（flushToL1/会话结束时写入「今日」缓冲；读取 API 供折叠消费）
        ↓
Phase 17D：折叠任务（读今日缓冲 → LLM 日级摘要 + pending_tasks → 更新账本 FIFO）
        ↓
Phase 17E：Day -5 淘汰时可选入 RAG；CONFIG_REFERENCE、MASTER 索引、测试
```

- **17A 无依赖**：可立即实施。
- **17B 依赖 17A**：注入需能读取账本并格式化。
- **17C 依赖现有 memory/gateway**：与 flushToL1、会话保存协同；可与 17B 并行开发，但 17D 依赖 17C。
- **17D 依赖 17A、17C**：折叠需写账本、读今日缓冲。
- **17E 依赖 17D**：淘汰逻辑在折叠内；文档与测试收尾。

---

## 三、建议执行顺序（高层）

1. **17A**：WO-1701（类型与 schema）→ WO-1702（存储读写）→ WO-1703（配置）。
2. **17B**：WO-1710（格式化）→ WO-1711（注入点）→ WO-1712（隐私）。
3. **17C**：WO-1720（缓冲 schema/路径）→ WO-1721（写入点）→ WO-1722（读取 API）。
4. **17D**：WO-1730（折叠 LLM + 更新账本）→ WO-1731（FIFO 与写入）→ WO-1732（触发：cron 或复盘内）→ WO-1733（调用淘汰钩子）。
5. **17E**：WO-1740（淘汰→RAG 或 GC）→ WO-1741（可选）、WO-1750～1752（文档与测试）。

---

## 四、验收原则（Phase 17）

- **单工单**：每工单完成后需满足该工单文档中的**验收标准**再进入下一工单。
- **17A 验收**：账本可读可写、schema 与设计一致；配置 load 后生效。
- **17B 验收**：启用时 Agent 收到 5 天账本格式化的前文；隐私模式下不注入或为空。
- **17C 验收**：今日缓冲在约定写入点有数据；折叠可读取「今日」内容。
- **17D 验收**：触发折叠后账本新增昨日条目、FIFO 正确；pending_tasks 可进入早报或待审（若对接）。
- **17E 验收**：淘汰日可配置入 RAG 或 GC；CONFIG_REFERENCE 与 MASTER 可查；至少 1 条集成/单元测试通过。

---

## 五、工单文档索引

| 阶段 | 工单文档 | 设计/评估文档 |
|------|----------|----------------|
| Phase 17 | [MEMORY_FOLDING_WORK_ORDERS.md](MEMORY_FOLDING_WORK_ORDERS.md) | MEMORY_FOLDING_ASSESSMENT.md、记忆折叠构建讨论 |

---

*实施时以 MEMORY_FOLDING_ASSESSMENT.md 与 MEMORY_FOLDING_WORK_ORDERS.md 为准；本计划为总纲与排期参考。*
