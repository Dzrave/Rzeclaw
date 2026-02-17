# Phase 9：任务体系与 Heartbeat 增强工单

基于《自主性、Skill/MCP 与主动模式设计》与《蜂群智能团队愿景与整体设计方案》中任务与 Heartbeat 的增强描述进行工单拆解。**不新增独立设计文档，沿用现有设计中的增强点。**

---

## 一、工单列表

| 工单 ID | 名称 | 依赖 | 范围 | 验收标准 |
|---------|------|------|------|----------|
| **WO-901** | 任务来源扩展：从 Canvas 目标同步到任务列表 | Phase 6 任务/Canvas | 当 Canvas 有 goal 或 steps 时，可将「当前目标」或「未完成步骤」同步为 tasks.json 中的任务项；或从 tasks 反向更新 Canvas 目标描述。 | 任务与画布目标可联动。 |
| **WO-902** | HEARTBEAT.md 解析增强（多级列表与优先级） | WO-621 等价 | 解析清单时支持多级列表（- 或 1. 下的子项）、可选优先级标记（如 [高]）；输出结构化待办列表供 Check 使用。 | 复杂清单可解析为多条目。 |
| **WO-903** | Heartbeat Check：可选 LLM 判断是否执行 | WO-618 | 配置 heartbeat.checkUseLLM 为 true 时，将清单摘要与最近上下文送 LLM，返回「是否建议执行、建议执行哪一条」；否则沿用当前规则（取首条）。 | 可选「智能判断」是否执行。 |
| **WO-904** | Heartbeat 执行前确认（可配置） | WO-619 | 配置 heartbeat.requireConfirmation 为 true 时，Act 前不自动执行，仅将「待执行项」写回 Canvas 或 heartbeat_pending.json，由用户或终端确认后再执行。 | 支持「半托管」不自动执行。 |
| **WO-905** | 任务状态与画布步骤状态同步 | WO-604, WO-621 | 当 Agent 写回 Canvas 步骤完成时，同步更新 tasks.json 中对应任务状态；或任务完成时更新 Canvas 当前步骤。 | 任务状态与画布一致。 |
| **WO-906** | proactive.suggest 输入增强：任务+画布+记忆 | WO-622 | runProactiveInference 除任务与画布外，显式注入近期记忆摘要（如 L1 最近 N 条）；提议生成可考虑「未完成任务+画布进度+记忆」综合推断。 | 提议更贴合当前上下文。 |
| **WO-907** | 配置与文档：Heartbeat 与任务增强项 | 无 | CONFIG_REFERENCE 补充 heartbeat.checkUseLLM、heartbeat.requireConfirmation；文档说明任务与画布联动。 | 配置与行为可查。 |

---

## 二、建议实现顺序

WO-901 → WO-902 → WO-903 → WO-904 → WO-905 → WO-906 → WO-907

---

## 三、依赖关系

- WO-901 依赖 Phase 6 Canvas 与任务体系。  
- WO-902 依赖现有 Check 逻辑。  
- WO-903 依赖 WO-618（Check）。  
- WO-904 依赖 WO-619（Act）。  
- WO-905 依赖 Canvas 写回与 tasks 读写。  
- WO-906 依赖 runProactiveInference 与记忆检索。

---

*Phase 9 实现前请确认愿景文档与 Phase 6 设计中的任务/Heartbeat 描述。*
