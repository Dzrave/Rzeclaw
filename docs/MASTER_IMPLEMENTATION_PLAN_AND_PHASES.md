# 蜂群智能团队：总实施计划与阶段划分

基于《蜂群智能团队：愿景与整体设计方案》(SWARM_VISION_AND_OVERALL_DESIGN.md) 的定位与能力支柱，本文档规定**实施计划**与**阶段划分**，以及**每个模块实现前的必经流程**。后续各 Phase 的工单拆解与实现均以此为准。

---

## 一、实施原则

### 1.1 设计优先、工单随后、再实现

- **每个模块（或 Phase）在编码实现之前**，必须满足以下之一：  
  - 已有**详细设计方案**（独立设计文档或设计文档中的明确章节）；  
  - 若无，则**先编写该模块的详细设计方案**，经确认后再进行**实施计划与工单拆解**，最后按工单顺序实现。
- **工单拆解**应尽量详细，覆盖该阶段所有功能点与验收标准，避免遗漏；工单间依赖关系与建议实现顺序需明确写出。
- **实现顺序**：按 Phase 顺序推进；同一 Phase 内按工单依赖顺序执行；单工单完成后需满足验收标准再进入下一工单。

### 1.2 文档与阶段对应关系

| 阶段 | 设计文档（必须先有或先写） | 工单文档 | 说明 |
|------|----------------------------|----------|------|
| **Phase 7** | 《终端 Channel 设计》TERMINAL_CHANNEL_DESIGN.md ✅ | PHASE7_WORK_ORDERS.md | 自制终端（Windows exe），会话/画布/提议等 |
| **Phase 8** | PHASE8_GATEWAY_SECURITY_AND_LAN_DESIGN.md（新建） | PHASE8_WORK_ORDERS.md | Gateway 监听地址、认证、可选发现 |
| **Phase 9** | 沿用 Phase 6 + 愿景文档中任务/Heartbeat 增强描述 | PHASE9_WORK_ORDERS.md | 任务体系与 Heartbeat 策略增强 |
| **Phase 10** | SWARM_ROLES_AND_CONTEXTS_DESIGN.md（新建） | PHASE10_WORK_ORDERS.md | 角色/会话类型、多上下文协同 |
| **Phase 11** | KNOWLEDGE_PIPELINE_DESIGN.md（新建） | PHASE11_WORK_ORDERS.md | 知识库流水线、批量摄取、咨询入口 |
| **Phase 12** | PHASE12_SELF_IMPROVEMENT_DESIGN.md（新建） | PHASE12_WORK_ORDERS.md | 自我诊断报告与改进建议 |

---

## 二、阶段总览与依赖

| Phase | 名称 | 目标 | 依赖 | 产出物 |
|-------|------|------|------|--------|
| **7** | 终端（Channel） | Windows 桌面终端 exe，连接 Gateway，会话/对话/画布/提议/设置 | Phase 0～6 已完成 | 可运行 exe + 配置与协议对接 |
| **8** | Gateway 安全与局域网 | 监听 0.0.0.0、API Key 认证、可选 mDNS 发现 | Phase 7 可并行，但终端联调依赖 8 | 配置项、认证流程、发现协议 |
| **9** | 任务与 Heartbeat 增强 | 任务解析增强、Heartbeat 可选 LLM 判断、任务状态与画布联动 | Phase 6 | 更强主动性与任务可见性 |
| **10** | 蜂群角色与多上下文 | 会话类型/角色（开发/知识库/PM）、多 workspace 与画布协同 | Phase 7、8、9 | 角色化行为与上下文隔离 |
| **11** | 知识库流水线与咨询 | 批量摄取、索引与检索增强、咨询专用入口 | Phase 0～6 记忆层 | 知识库构建与咨询闭环 |
| **12** | 自我诊断与进化 | 行为报告、改进建议接口、可选半自动采纳 | Phase 6 进化相关 | 可进化闭环可见化 |

- **Phase 7 与 8**：可并行开发；终端联调与「多机/认证」体验依赖 Phase 8 完成。  
- **Phase 9**：依赖 Phase 6（Heartbeat、任务、提议已存在）。  
- **Phase 10**：依赖 7（终端展示角色/workspace）、8（多机与认证）、9（任务与画布增强）。  
- **Phase 11**：依赖现有记忆与检索，可与 10 并行规划，实现顺序可放在 10 之后。  
- **Phase 12**：依赖 6 的进化能力，可最后实施。

---

## 三、各阶段设计文档与工单文档索引

- **Phase 7**  
  - 设计：《Rzeclaw 自制终端（Channel）设计方案》`docs/TERMINAL_CHANNEL_DESIGN.md`  
  - 工单：`docs/PHASE7_WORK_ORDERS.md`（WO-7xx）

- **Phase 8**  
  - 设计：`docs/PHASE8_GATEWAY_SECURITY_AND_LAN_DESIGN.md`（新建）  
  - 工单：`docs/PHASE8_WORK_ORDERS.md`（WO-8xx）

- **Phase 9**  
  - 设计：沿用 `docs/AUTONOMY_SKILL_MCP_AND_ACTIVE_MODE_DESIGN.md` 与 `docs/SWARM_VISION_AND_OVERALL_DESIGN.md` 中任务/Heartbeat 相关描述  
  - 工单：`docs/PHASE9_WORK_ORDERS.md`（WO-9xx）

- **Phase 10**  
  - 设计：`docs/SWARM_ROLES_AND_CONTEXTS_DESIGN.md`（新建）  
  - 工单：`docs/PHASE10_WORK_ORDERS.md`（WO-10xx）

- **Phase 11**  
  - 设计：`docs/KNOWLEDGE_PIPELINE_DESIGN.md`（新建）  
  - 工单：`docs/PHASE11_WORK_ORDERS.md`（WO-11xx）

- **Phase 12**  
  - 设计：`docs/PHASE12_SELF_IMPROVEMENT_DESIGN.md`（新建，可简短）  
  - 工单：`docs/PHASE12_WORK_ORDERS.md`（WO-12xx）

---

## 四、执行流程（每个 Phase 通用）

1. **设计确认**：检查该 Phase 对应的设计文档是否完整；不完整则先补设计并确认。  
2. **工单拆解**：根据设计编写或更新该 Phase 的工单文档，做到「功能无遗漏、依赖与顺序明确、验收标准可检验」。  
3. **按工单实现**：按工单依赖顺序编码；每工单完成后自测满足验收标准，再进入下一工单。  
4. **阶段验收**：该 Phase 全部工单完成后，做一次阶段验收（如端到端场景测试），再进入下一 Phase。

---

*本文档为蜂群智能团队实施的总纲；具体实现细节以各 Phase 设计文档与工单文档为准。*
