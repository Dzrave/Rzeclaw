# Phase 12：自我诊断与进化设计

本文档为 **Phase 12** 的简要设计：在现有「Prompt 建议、Bootstrap、记忆与审计」基础上，增加**自我诊断报告**与**改进建议**的产出与可选采纳流程，使「可进化」闭环可见、可操作。**仅设计不实现。**

---

## 一、目标

- **诊断报告**：系统可定期（或按需）产出一份「行为报告」，包含近期会话数、工具调用统计、记忆写入与检索统计、错误与失败率等汇总，便于你了解运行状况。
- **改进建议**：在报告基础上，可选由 LLM 或规则产出「改进建议」（如「增加某类记忆的检索 limit」「某工具失败率高，建议检查参数」）；与现有 prompt_suggestions 可合并或并列。
- **采纳流程**：建议以文件或 API 形式输出；用户或半自动流程（如「确认后写入 config」）采纳，不自动修改配置。

---

## 二、报告内容（建议）

- 时间范围（如最近 7 天）。  
- 会话数、消息数、工具调用次数与失败率。  
- 记忆：L1 写入条数、检索次数、cited 分布；冷归档条数（若启用）。  
- Heartbeat：执行次数、成功/跳过/失败。  
- 错误摘要：常见 error code 或 message 归类。  
- 可选：Canvas 更新频率、提议展示次数。

---

## 三、改进建议来源

- **规则**：如「工具失败率 > 某阈值 → 建议检查该工具参数或权限」。  
- **LLM**：将报告摘要送 LLM，生成 1～3 条自然语言建议（可写入 prompt_suggestions.md 或单独 self_improvement_suggestions.md）。  
- **不自动执行**：仅输出建议，采纳由用户或显式流程完成。

---

## 四、触发方式

- **按需**：Gateway method diagnostic.report(workspace?, days?) 或 CLI diagnostic-report。  
- **定时**：可选配置 diagnostic.intervalDays，Heartbeat 或独立定时器周期调用报告生成并写文件。  
- **存储**：报告写 workspace/.rzeclaw/diagnostics/report_<date>.json 或 .md；建议写 self_improvement_suggestions.md。

---

## 五、与愿景文档的对应

- 《蜂群智能团队愿景与整体设计方案》六、可进化与自我迭代：Bootstrap、Prompt 建议、Skill/MCP、记忆与审计；未来「自我诊断与改进建议」接口。

---

*本文档为 Phase 12 实施的设计依据；工单见 PHASE12_WORK_ORDERS.md。*
