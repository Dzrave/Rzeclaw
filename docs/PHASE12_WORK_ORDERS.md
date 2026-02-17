# Phase 12：自我诊断与进化工单

基于《Phase 12：自我诊断与进化设计》进行工单拆解。**实现前需确认该设计文档。**

---

## 一、工单列表

| 工单 ID | 名称 | 依赖 | 范围 | 验收标准 |
|---------|------|------|------|----------|
| **WO-1201** | diagnostic 配置项 | 无 | config.diagnostic.intervalDays、outputPath（可选）；加载与默认。 | 配置可读。 |
| **WO-1202** | 报告数据汇总：会话与工具统计 | 现有 metrics/logger | 从现有 metrics 或日志汇总指定时间范围内的会话数、工具调用数、失败数；输出结构化数据。 | 可生成基础统计。 |
| **WO-1203** | 报告数据汇总：记忆与检索 | 现有 store/retrieve/audit | L1 写入条数、检索次数（若可统计）、冷归档条数；可选从 audit 汇总。 | 报告含记忆侧数据。 |
| **WO-1204** | 报告数据汇总：Heartbeat 与错误 | WO-620, 现有日志 | Heartbeat 执行次数与结果；错误归类（按 code 或 message）；写入报告结构。 | 报告含 Heartbeat 与错误摘要。 |
| **WO-1205** | 诊断报告生成与持久化 | WO-1202～1204 | 组装完整报告（JSON 或 MD）；写入 workspace/.rzeclaw/diagnostics/report_<date>.json 或 .md。 | 可产出并保存报告文件。 |
| **WO-1206** | Gateway/CLI 报告入口 | WO-1205 | Gateway method diagnostic.report(workspace?, days?)；CLI diagnostic-report；返回报告内容或路径。 | 可按需触发报告。 |
| **WO-1207** | 改进建议生成（规则或 LLM） | WO-1205 | 基于报告生成 1～3 条改进建议（规则：如失败率阈值；或 LLM）；写入 self_improvement_suggestions.md 或合并到 prompt_suggestions。 | 有建议输出且不自动执行。 |
| **WO-1208** | 可选：定时触发报告 | WO-1206, WO-1201 | 若 diagnostic.intervalDays > 0，定时（如 Heartbeat 侧）调用报告生成并写文件。 | 可配置周期报告。 |
| **WO-1209** | 文档：诊断与改进说明 | WO-1201～1207 | CONFIG_REFERENCE 与使用说明：如何查看报告、如何采纳建议。 | 用户可理解并使用。 |

---

## 二、建议实现顺序

WO-1201 → WO-1202 → WO-1203 → WO-1204 → WO-1205 → WO-1206 → WO-1207 → WO-1208 → WO-1209

---

## 三、依赖关系

- WO-1201 独立；WO-1202～1204 依赖现有观测与存储；WO-1205 依赖 1202～1204；WO-1206 依赖 1205；WO-1207 依赖 1205；WO-1208 依赖 1206、1201。

---

*实现时以 PHASE12_SELF_IMPROVEMENT_DESIGN.md 与本文档为准。*
