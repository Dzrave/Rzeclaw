# 知识库流水线与咨询设计

本文档为 **Phase 11** 的详细设计：在现有 L0/L1/L2 记忆与检索基础上，增加**批量摄取**、**索引与检索增强**，以及**咨询专用入口**，形成「知识库构建 + 咨询」闭环。**仅设计不实现。**

---

## 一、目标

- **知识库构建**：除对话中自然产生的记忆外，支持「批量摄取」指定文件或目录，经解析与摘要写入 L1（及推进到 L2），便于后续检索。
- **检索增强**：检索时可结合关键词、task_hint、时间与 workspace；可选「摘要优先」或「原文片段」策略；保证 citedMemoryIds 可解释。
- **咨询入口**：提供专用「咨询」会话类型或 method（如 knowledge.ask），在 system 中强调「仅依据记忆与检索作答、不执行写盘」等约束，便于纯问答场景。

---

## 二、批量摄取

- **触发方式**：  
  - **配置驱动**：config.knowledge.ingestPaths 为文件或目录列表（相对 workspace）；Gateway 或 CLI 提供「执行摄取」入口（如 knowledge.ingest），扫描路径，对每个文件（按扩展名过滤，如 .md/.txt/.json）调用读取与摘要逻辑。  
  - **任务驱动**：用户通过对话或任务清单下达「将某目录纳入知识库」，Agent 使用 read 等工具读取并调用「写入记忆」的接口（需新增或复用 flushToL1 的批量入口）。
- **处理流程**：  
  - 读文件内容 → 分块（按长度或段落）→ 每块生成简短摘要或原文 → 以 MemoryEntry 形式 append 到 store（layer L1，content_type 可为 document 或 summary），带 workspace_id、task_hint（可从路径或文件名推导）。  
  - 去重：同一 path+hash 可跳过或更新；具体策略可配置。
- **存储**：复用现有 store；可选在 provenance 中记录 source_path、ingest_batch_id，便于审计与更新。

---

## 三、检索增强

- **现状**：retrieve 已支持 workspace_id、task_hint、limit、content_type 等；结果带 id，可 formatAsCitedBlocks。  
- **增强**：  
  - **混合策略**：支持「先按 task_hint 与关键词检索，再按时间或相关度排序」；可选「仅 L2」或「L1+L2」以控制时效与长期知识平衡。  
  - **摘要与片段**：返回条目可包含 summary 与可选 content 片段，便于 prompt 长度控制；citedMemoryIds 不变。  
  - **咨询专用 limit**：咨询入口可默认更大 limit（如 10）与「summary 优先」，以提升回答覆盖面。

---

## 四、咨询入口

- **协议**：  
  - **方式 A**：复用 chat，但会话的 sessionType 为 knowledge，system 中注入「你仅依据记忆与检索作答，不执行写盘等操作；若无法从记忆中回答则明确说明」。  
  - **方式 B**：新增 Gateway method knowledge.ask(question, workspace?)，内部调用 retrieve + 单轮或短轮 LLM，仅返回回答与 citedMemoryIds，不写 L1（或可选写入「咨询历史」）。  
- **建议**：先采用方式 A（会话类型 knowledge），与 Phase 10 角色一致；方式 B 可作为后续「轻量咨询 API」扩展。  
- **终端**：用户选择「知识库」会话类型后，行为即咨询模式；可选在 UI 上标注「仅依据知识库回答」。

---

## 五、与愿景文档的对应

- 《蜂群智能团队愿景与整体设计方案》4.2 知识库构建与咨询：记忆底座、检索与注入、知识库构建（对话与摄取）、冷归档与审计。  
- 与 Phase 10 的 knowledge 角色结合：咨询入口即 knowledge 角色 + 检索增强 + 可选批量摄取结果。

---

## 六、配置建议

- **knowledge.ingestPaths**：string[]，相对 workspace 的路径。  
- **knowledge.ingestOnStart**：boolean，是否在 Gateway 启动时自动执行一次摄取（可选，默认 false）。  
- **knowledge.retrieveLimit**：咨询时默认检索条数。  
- **knowledge.roles**：与 Phase 10 roles.knowledge 共用或单独覆盖。

---

*本文档为 Phase 11 实施的设计依据；工单见 PHASE11_WORK_ORDERS.md。*
