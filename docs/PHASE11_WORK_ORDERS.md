# Phase 11：知识库流水线与咨询工单

基于《知识库流水线与咨询设计》进行工单拆解。**实现前需确认该设计文档。**

---

## 一、工单列表

| 工单 ID | 名称 | 依赖 | 范围 | 验收标准 |
|---------|------|------|------|----------|
| **WO-1101** | knowledge 配置项与加载 | 无 | config.knowledge.ingestPaths、ingestOnStart、retrieveLimit；加载与默认值。 | 配置可读可用。 |
| **WO-1102** | 单文件摄取：读文件→分块→写 L1 | 现有 store/ flushToL1 | 单文件内容读入、按长度/段落分块；每块生成摘要或保留原文；以 MemoryEntry 形式 append（layer L1，content_type document/summary），带 workspace_id、provenance.source_path。 | 单文件可摄入并可从 retrieve 查到。 |
| **WO-1103** | 批量摄取：目录扫描与过滤 | WO-1102 | 扫描 ingestPaths 中的目录与文件；按扩展名过滤（.md/.txt 等）；逐个调用单文件摄取；去重（path+hash 可选）。 | 多文件/目录可批量摄入。 |
| **WO-1104** | Gateway/CLI 摄取入口 | WO-1103 | Gateway method knowledge.ingest(workspace?, paths?) 或 CLI 命令；触发批量摄取并返回统计（成功/跳过/失败数）。 | 可通过协议或 CLI 触发摄取。 |
| **WO-1105** | 检索增强：limit 与 L1/L2 策略 | 现有 retrieve | retrieve 支持参数「仅 L2」或「L1+L2」、咨询用默认 limit；排序与片段策略可选。 | 咨询场景可拿到更多相关记忆。 |
| **WO-1106** | 咨询模式与 knowledge 角色 | Phase 10 | 当 sessionType 为 knowledge 时，system 注入「仅依据记忆作答、不执行写盘」等约束；或单独 knowledge.ask 实现（可选）。 | 咨询会话行为符合设计。 |
| **WO-1107** | 终端：知识库会话与咨询标注 | Phase 7, Phase 10 | 选择「知识库」会话类型时，UI 标注为咨询模式；可选展示「依据记忆」提示。 | 用户明确当前为咨询模式。 |
| **WO-1108** | 文档：知识库摄取与咨询使用说明 | WO-1101～1106 | CONFIG_REFERENCE 补充 knowledge.*；说明摄取流程、咨询入口与引用展示。 | 配置与用法可查。 |

---

## 二、建议实现顺序

WO-1101 → WO-1102 → WO-1103 → WO-1104 → WO-1105 → WO-1106 → WO-1107 → WO-1108

---

## 三、依赖关系

- WO-1101 独立；WO-1102 依赖 store、L1 写入；WO-1103 依赖 1102；WO-1104 依赖 1103。  
- WO-1105 依赖现有 retrieve；WO-1106 依赖 Phase 10 角色；WO-1107 依赖 Phase 7 与 10。

---

*实现时以 KNOWLEDGE_PIPELINE_DESIGN.md 与本文档为准。*
