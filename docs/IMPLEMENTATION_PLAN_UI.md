# Rzeclaw UI 全面实施计划 / Full UI Implementation Plan

> **状态**: 规划阶段（不执行实现）
> **日期**: 2026-03-23
> **Stitch 项目**: Office & Task Canvas (ID: 5201558385094956907)
> **目标屏幕数**: 16 (14 UI + 1 Design System + 1 设计文档)

---

## 一、现状分析 / Current State Analysis

### 1.1 现有前端架构

| 组件 | 技术栈 | 位置 | 状态 |
|------|--------|------|------|
| **frontend-office** | Phaser 3 (游戏引擎) + 原生 HTML/CSS/JS | `frontend-office/` | 基础功能可用 |
| **terminal** | Electron + 原生 HTML/CSS/JS | `terminal/` | 基础功能可用 |

**当前 i18n**: 仅 `frontend-office/i18n.js`，覆盖 zh/en/ja 三语，约 20 个翻译键。Terminal 无 i18n。

**当前主题**: 硬编码深色主题，CSS 字面量（无 CSS 变量/设计令牌）。

### 1.2 Stitch 设计分析 — 关键发现

**设计系统特征**:
- Material Design 3 色彩令牌系统
- 配色: Primary `#a3a6ff`, Secondary `#53ddfc`, Tertiary `#ffa5d9`, Error `#ff6e84`
- 表面色: `#0e0e0e` → `#1a1a1a` → `#262626` (深色梯度)
- 字体: Manrope (标题), Inter (正文), JetBrains Mono (代码/数据)
- Tailwind CSS + 自定义插件
- 统一侧边栏 (w-64) + 顶栏 (h-16) 布局骨架

**框架不统一问题**:

| 屏幕 | 侧边栏品牌 | 导航结构 | 风格差异 |
|------|-----------|---------|---------|
| 01 Chat | "Rzeclaw" | Chat/Office/Library/Memory | 标准 4 项导航 |
| 02 Office Canvas | "Rzeclaw / Intelligent Monolith" | 同上 | 带副标题 |
| 03 Settings | "Rzeclaw OS v4.2.0" | General/Gateway/LLM/Memory/Security/Appearance | 设置专用导航 |
| 05 Agent Swarm | "RZECLAW" (大写) | Agents/Teams 选项卡 | 顶部选项卡式 |
| 13 Diagnostics | "RZECLAW" (大写) | Diagnostics/Discovery | 不同分组 |
| 16 Simulation | "RZECLAW / MONOLITH_OS v4.x" | Workspace/Agent Logs/Neural Map/Archives/System | 完全不同的导航 |

**结论**: 16 个屏幕存在 **至少 4 种不同的导航结构和品牌风格**，需要统一。

---

## 二、架构决策 / Architecture Decisions

### AD-01: 前端框架统一

**决策**: 构建统一的 **Web SPA** (单页应用)，替代当前 Phaser + Electron 双客户端架构。

**理由**:
1. Stitch 设计全部基于标准 Web 布局（Sidebar + TopNav + Content），非游戏引擎场景
2. Phaser 仅用于渲染像素办公室（Screen 16），可作为嵌入式 Canvas 组件保留
3. Electron 可继续作为 Desktop 壳（加载 SPA），但 UI 逻辑统一
4. 减少维护两套独立 UI 的成本

**技术选型**:
- **框架**: 原生 Web Components + Lit 或 轻量级框架（保持与现有 Node.js 后端的一致性）
- **备选**: 如团队偏好，可选 React/Vue，但需新增构建链
- **样式**: Tailwind CSS（与 Stitch 设计保持一致）
- **构建**: Vite（快速 HMR，支持 TypeScript）

### AD-02: 统一导航与品牌

**决策**: 统一为单一侧边栏导航结构。

**统一导航方案**:
```
Rzeclaw                          ← 品牌名（统一）
INTELLIGENT MONOLITH             ← 副标题（统一）
v4.x                             ← 版本号

─────────────────────────
🔲 WORKSPACE                     ← 分组: 工作区
   ├─ Chat (01)                  ← Main Terminal & Chat
   ├─ Office Canvas (02)         ← Office & Task Canvas
   └─ Agent Office (16)          ← Agent Office & Swarm Simulation

🔲 AGENTS & FLOWS                ← 分组: 智能体与流程
   ├─ Agent Swarm (05)           ← Agent & Swarm Workspace
   ├─ Flow Editor (04)           ← Flow Editor & Visualizer
   ├─ Flow Monitor (15)          ← Flow Execution Monitor
   └─ Flows Library (11)         ← Flows & Skills Library

🔲 KNOWLEDGE & MEMORY            ← 分组: 知识与记忆
   ├─ RAG Nexus (12)             ← RAG & Knowledge Nexus
   └─ Memory (14)                ← Memory & Retrospective

🔲 ANALYTICS & LOGS              ← 分组: 分析与日志
   ├─ Exploration (06)           ← Exploration & Strategy Critic
   ├─ Evolution Log (07)         ← Outcome & Evolution Log
   └─ Diagnostics (13)           ← Session Diagnostics & Health

🔲 SYSTEM                        ← 分组: 系统
   ├─ Security (08)              ← Security & Permission Audit
   └─ Settings (03)              ← System Settings & Appearance

─────────────────────────
⚙ Status Bar                     ← 底部: 连接状态/延迟/内存
```

### AD-03: i18n 架构

**决策**: 采用结构化 JSON 翻译文件 + 命名空间方案。

**支持语言**: `zh-CN` (简体中文), `en` (英文), `ja` (日文)

**文件结构**:
```
src/ui/i18n/
├── index.ts              ← i18n 引擎 (语言切换, t() 函数, 复数处理)
├── locales/
│   ├── zh-CN/
│   │   ├── common.json   ← 通用 (导航, 按钮, 状态)
│   │   ├── chat.json     ← Screen 01
│   │   ├── office.json   ← Screen 02, 16
│   │   ├── settings.json ← Screen 03
│   │   ├── flows.json    ← Screen 04, 07, 11, 15
│   │   ├── agents.json   ← Screen 05
│   │   ├── explore.json  ← Screen 06
│   │   ├── security.json ← Screen 08
│   │   ├── rag.json      ← Screen 12
│   │   ├── diagnostics.json ← Screen 13
│   │   └── memory.json   ← Screen 14
│   ├── en/
│   │   └── ... (同结构)
│   └── ja/
│       └── ... (同结构)
└── types.ts              ← TypeScript 类型定义 (确保键类型安全)
```

---

## 三、屏幕-功能映射 / Screen-to-Feature Mapping

### 功能映射矩阵

| # | 屏幕名称 | 后端 RPC 方法 | 后端模块 | 实现状态 | 前端状态 |
|---|---------|-------------|---------|---------|---------|
| 01 | Main Terminal & Chat | `chat`, `session.*` | agent/loop, gateway/chat-executor | ✅ 完整 | ⚠️ 基础 (terminal) |
| 02 | Office & Task Canvas | `canvas.*`, `office.status`, `agents.list` | canvas/, agents/ | ✅ 完整 | ⚠️ 基础 (terminal+office) |
| 03 | System Settings | (本地配置) | config.ts | ✅ 完整 | ⚠️ 仅连接设置 |
| 04 | Flow Editor & Visualizer | `flows.*` | flows/crud, flows/engine-bt | ✅ 完整 | ❌ 无前端 |
| 05 | Agent & Swarm Workspace | `agents.*`, `swarm.*` | agents/, event-bus/ | ✅ 完整 | ⚠️ 仅列表 |
| 06 | Exploration & Strategy | `exploration.*` (待定) | exploration/ | ✅ 完整 | ❌ 无前端 |
| 07 | Outcome & Evolution Log | `flows.history` (待定) | flows/evolution-insert-tree | ✅ 完整 | ❌ 无前端 |
| 08 | Security & Permission | `security.*` (待定) | security/ | ✅ 完整 | ❌ 无前端 |
| 09 | Design System | — | — | — | 资产/令牌参考 |
| 10 | OVERALL_IMPLEMENTED_DESIGN | — | — | — | 文档参考 |
| 11 | Flows & Skills Library | `flows.list`, `tools.list` | flows/crud, tools/ | ✅ 完整 | ⚠️ 仅工具列表 |
| 12 | RAG & Knowledge Nexus | `rag.*` (待定) | rag/ | ✅ 完整 | ❌ 无前端 |
| 13 | Session Diagnostics | `health`, `diagnostic.*` | diagnostic/ | ✅ 完整 | ⚠️ 仅心跳 |
| 14 | Memory & Retrospective | `memory.*` | memory/, retrospective/ | ✅ 完整 | ⚠️ 仅昨日摘要 |
| 15 | Flow Execution Monitor | `flows.execute` (待定) | flows/engine-bt, flows/engine-fsm | ✅ 完整 | ❌ 无前端 |
| 16 | Agent Office Simulation | `office.status`, `agents.list` | agents/, gateway/ | ✅ 完整 | ⚠️ Phaser 基础 |

**统计**:
- 后端完整: 14/14 屏幕
- 前端完整: 0/14 屏幕
- 前端基础: 7/14 屏幕（有部分功能）
- 前端缺失: 7/14 屏幕（无任何前端）

### 需新增的 Gateway RPC 方法

以下 RPC 方法在后端模块中有对应功能，但尚未暴露为 Gateway RPC:

| RPC 方法 | 对应屏幕 | 后端模块 | 说明 |
|---------|---------|---------|------|
| `config.get` | 03 Settings | config.ts | 读取当前配置 |
| `config.update` | 03 Settings | config.ts | 更新配置项 |
| `flows.list` | 04, 11 | flows/crud | 列出所有流程 |
| `flows.get` | 04 | flows/crud | 获取单个流程详情 |
| `flows.create` | 04 | flows/crud | 创建新流程 |
| `flows.update` | 04 | flows/crud | 更新流程 |
| `flows.delete` | 04 | flows/crud | 删除流程 |
| `flows.execute` | 15 | flows/engine-bt | 执行流程 |
| `flows.history` | 07 | flows/ | 获取执行历史 |
| `flows.evolution` | 07 | flows/evolution-insert-tree | 获取演化树 |
| `agents.blueprints.list` | 05 | agents/blueprints | 列出蓝图 (已有) |
| `agents.instances` | 05 | agents/instances | 实例管理 |
| `agents.spawn` | 05, 16 | agents/instances | 创建实例 |
| `agents.retire` | 05 | agents/instances | 退休实例 |
| `exploration.status` | 06 | exploration/gatekeeper | 探索状态 |
| `exploration.history` | 06 | exploration/experience | 探索历史 |
| `exploration.evaluate` | 06 | exploration/critic | 评估策略 |
| `security.scopes` | 08 | security/permission-scopes | 权限范围 |
| `security.dangerousPolicy` | 08 | security/dangerous-commands | 危险命令策略 |
| `security.auditLog` | 08 | observability/op-log | 审计日志 |
| `rag.search` | 12 | rag/ | 向量搜索 |
| `rag.collections` | 12 | rag/ | 集合列表 |
| `rag.ingest` | 12 | rag/ | 知识摄入 |
| `diagnostic.report` | 13 | diagnostic/report | 诊断报告 |
| `diagnostic.selfCheck` | 13 | diagnostic/ | 自检 |
| `diagnostic.repair` | 13 | diagnostic/ | 修复 |
| `memory.layers` | 14 | memory/ | 内存层状态 |
| `memory.ledger` | 14 | memory/rolling-ledger | 滚动账本 |
| `memory.retrospective` | 14 | retrospective/ | 回顾报告 |
| `metrics.export` | 13 | observability/metrics | 指标导出 |

---

## 四、实施阶段 / Implementation Phases

### Phase 0: 基础设施搭建 (Foundation)
> **预估工单数**: 6 | **依赖**: 无

| 工单 ID | 标题 | 描述 | 优先级 |
|---------|------|------|-------|
| **P0-01** | 初始化 SPA 项目结构 | 在 `src/ui/` 下创建 Vite + TypeScript 项目，配置 Tailwind CSS，设置构建输出到 `dist/ui/` | P0 |
| **P0-02** | 建立设计令牌系统 | 从 Stitch Screen 09 (Design System) 提取所有色彩/字体/间距/圆角令牌，配置为 Tailwind 主题扩展 (`tailwind.config.ts`) | P0 |
| **P0-03** | 实现 i18n 引擎 | 构建 i18n 核心: `t()` 函数、语言切换、localStorage 持久化、命名空间加载、TypeScript 键类型安全 | P0 |
| **P0-04** | 提取公共翻译键 (common) | 为 `common.json` 编写 zh-CN/en/ja 三语翻译: 导航项、通用按钮、状态文本、错误提示 | P0 |
| **P0-05** | 构建 Gateway RPC 客户端 | 基于现有 `gateway.js` 重构为 TypeScript 模块: WebSocket 管理、JSON-RPC 协议、流式响应、重连逻辑、类型定义 | P0 |
| **P0-06** | Gateway 静态文件服务 | 在 Gateway 服务器中添加静态文件服务能力，从 `dist/ui/` 提供 SPA 文件，支持 SPA fallback 路由 | P0 |

---

### Phase 1: 统一 Shell 骨架 (Unified Shell)
> **预估工单数**: 5 | **依赖**: Phase 0

| 工单 ID | 标题 | 描述 | 优先级 |
|---------|------|------|-------|
| **P1-01** | 构建 AppShell 布局组件 | 实现统一的 Sidebar (w-64) + TopNav (h-16) + Content 三栏布局骨架，响应式折叠 | P0 |
| **P1-02** | 实现统一侧边栏导航 | 按 AD-02 方案实现 5 组导航（Workspace / Agents & Flows / Knowledge & Memory / Analytics & Logs / System），活跃态高亮，i18n 支持 | P0 |
| **P1-03** | 实现顶栏组件 | 搜索栏 + 面包屑 + 操作按钮（语言切换、连接状态指示器）| P0 |
| **P1-04** | 实现底部状态栏 | 连接状态、Gateway 延迟、内存使用率、TPS 指标 | P1 |
| **P1-05** | 实现 SPA 路由系统 | 基于 hash 或 history 路由: 14 个页面路由映射、懒加载、路由守卫（连接检查）| P0 |

---

### Phase 2: 核心工作区屏幕 (Core Workspace Screens)
> **预估工单数**: 10 | **依赖**: Phase 1

#### Screen 01: Main Terminal & Chat

| 工单 ID | 标题 | 描述 | 优先级 |
|---------|------|------|-------|
| **P2-01** | Chat 页面布局与消息展示 | 实现聊天消息列表（用户/AI 气泡样式）、流式打字效果、代码块渲染、Markdown 支持 | P0 |
| **P2-02** | Chat 输入与会话管理 | 消息输入框、发送按钮、会话列表侧栏、会话类型选择（general/dev/knowledge/pm/swarm）、新建/恢复会话 | P0 |
| **P2-03** | Chat i18n 翻译文件 | 编写 `chat.json` 三语翻译: 所有聊天界面文本 | P0 |

#### Screen 02: Office & Task Canvas

| 工单 ID | 标题 | 描述 | 优先级 |
|---------|------|------|-------|
| **P2-04** | Canvas 任务节点可视化 | 空间画布背景 (monolith-grid)，浮动任务节点卡片（目标/步骤），SVG 连接线，进度条/状态徽章 | P1 |
| **P2-05** | Canvas 右侧面板 (Active Agents) | 活跃智能体列表、进程流终端、全局 TPS 火花线图 | P1 |
| **P2-06** | Canvas 画布交互 | 拖拽节点、缩放平移、节点编辑弹窗、Goal/Steps CRUD 操作 (对接 `canvas.*` RPC) | P1 |

#### Screen 03: System Settings & Appearance

| 工单 ID | 标题 | 描述 | 优先级 |
|---------|------|------|-------|
| **P2-07** | Settings 页面布局与表单 | 分段式设置页: General / Appearance / Gateway / LLM / Memory / Security，各表单控件（开关/下拉/滑块/颜色选择器）| P1 |
| **P2-08** | Settings 语言切换功能 | 设置页内的语言选择器，实时切换全局语言，联动所有页面 | P0 |
| **P2-09** | Settings 配置持久化 | 对接 `config.get` / `config.update` RPC（需新增），表单验证，保存/重置操作 | P1 |
| **P2-10** | Settings i18n 翻译文件 | 编写 `settings.json` 三语翻译 | P0 |

---

### Phase 3: 智能体与流程屏幕 (Agents & Flows Screens)
> **预估工单数**: 12 | **依赖**: Phase 1, 部分依赖 Phase 2

#### Screen 05: Agent & Swarm Workspace

| 工单 ID | 标题 | 描述 | 优先级 |
|---------|------|------|-------|
| **P3-01** | Agent Swarm 仪表盘 | Bento 网格布局，Swarm 可视化（SVG 中心事件总线 + 智能体节点环绕），团队管理卡片 | P1 |
| **P3-02** | Agent 蓝图网格 | 蓝图卡片（Analyst/Researcher/Critic/Architect），色彩编码，加载/指标展示 | P1 |
| **P3-03** | Agent 实例配置面板 | 实例创建/退休操作，状态管理（Active/Idle/Standby），对接 `agents.spawn` / `agents.retire` RPC | P1 |
| **P3-04** | Agents i18n 翻译文件 | 编写 `agents.json` 三语翻译 | P0 |

#### Screen 04: Flow Editor & Visualizer

| 工单 ID | 标题 | 描述 | 优先级 |
|---------|------|------|-------|
| **P3-05** | Flow 画布编辑器 | 点阵网格背景，行为树节点可视化（Sequence/Condition/Action/Failure），SVG 连接线，拖拽编辑 | P2 |
| **P3-06** | Flow 节点库 (左面板) | 可拖拽节点类型列表，分组展示，搜索过滤 | P2 |
| **P3-07** | Flow 属性面板 (右面板) | 节点属性编辑、参数 JSON 编辑器、LLM Prompt 编辑器、输入插槽配置 | P2 |
| **P3-08** | Flow 底部控制台 | 执行日志终端，带时间戳和着色，对接流程执行事件流 | P2 |

#### Screen 15: Flow Execution Monitor

| 工单 ID | 标题 | 描述 | 优先级 |
|---------|------|------|-------|
| **P3-09** | 实时 BT 图可视化 | 行为树执行状态实时渲染，节点高亮（运行中/成功/失败），缩放控件 | P2 |
| **P3-10** | Blackboard 变量面板 | 黑板键值对实时显示，更新动画指示器 | P2 |
| **P3-11** | 执行日志面板 | 彩色日志条目（TOOL_CALL/LLM_RESPONSE/BT_STATE），时间戳，自动滚动 | P2 |

#### Screen 11: Flows & Skills Library

| 工单 ID | 标题 | 描述 | 优先级 |
|---------|------|------|-------|
| **P3-12** | 流程/技能库页面 | 活跃行为列表（标签/成功率/进度条），MCP 服务器协议展示，核心技能 2x2 网格，系统认知负载仪表 | P2 |

---

### Phase 4: 知识与记忆屏幕 (Knowledge & Memory Screens)
> **预估工单数**: 7 | **依赖**: Phase 1

#### Screen 12: RAG & Knowledge Nexus

| 工单 ID | 标题 | 描述 | 优先级 |
|---------|------|------|-------|
| **P4-01** | RAG 搜索界面 | 全局搜索框（磨砂玻璃效果），搜索结果展示，Provider 状态小部件 | P1 |
| **P4-02** | 向量集合管理 | 集合卡片网格（记录数/类型），Motivation 触发映射表，知识摄入拖放区，管道进度条 | P1 |
| **P4-03** | RAG i18n 翻译文件 | 编写 `rag.json` 三语翻译 | P0 |

#### Screen 14: Memory & Retrospective

| 工单 ID | 标题 | 描述 | 优先级 |
|---------|------|------|-------|
| **P4-04** | 内存架构状态可视化 | L0/L1/L2 层级柱状图，容量/使用率指示，滚动账本时间轴 | P1 |
| **P4-05** | 晨间综合报告 | 报告卡片展示（评分/摘要），自我改进协议文档视图 | P1 |
| **P4-06** | 回顾时间线 | 回顾卡片列表（日期/状态/指标），左侧边框强调色 | P1 |
| **P4-07** | Memory i18n 翻译文件 | 编写 `memory.json` 三语翻译 | P0 |

---

### Phase 5: 分析与日志屏幕 (Analytics & Logs Screens)
> **预估工单数**: 8 | **依赖**: Phase 1

#### Screen 06: Exploration & Strategy Critic

| 工单 ID | 标题 | 描述 | 优先级 |
|---------|------|------|-------|
| **P5-01** | Gatekeeper 监控面板 | 触发检测器状态，阈值配置，触发历史 | P2 |
| **P5-02** | Planner/Critic 工作流可视化 | 3 节点流程图 + 代码编辑器，策略输出 JSON 展示 | P2 |
| **P5-03** | 经验仓库面板 | 历史结果卡片（成功/失败着色），经验检索 | P2 |

#### Screen 07: Outcome & Evolution Log

| 工单 ID | 标题 | 描述 | 优先级 |
|---------|------|------|-------|
| **P5-04** | 流程执行历史时间线 | 运行记录列表（状态徽章），详情展开视图 | P2 |
| **P5-05** | 演化树可视化 | SVG 分支树形图，当前路径 vs 演化路径标注，统计指标网格 | P2 |

#### Screen 13: Session Diagnostics & Health Monitor

| 工单 ID | 标题 | 描述 | 优先级 |
|---------|------|------|-------|
| **P5-06** | 健康仪表盘 | LLM 延迟/Gateway 心跳/内存读写 仪表卡片，状态指示灯 | P1 |
| **P5-07** | 自检/修复终端 | 终端样式日志输出（彩色状态标签），CLI Routine 按钮，进度条 | P1 |
| **P5-08** | mDNS 发现监控 | 活跃节点列表，状态指示器，自动发现状态 | P2 |

---

### Phase 6: 系统与安全屏幕 (System & Security Screens)
> **预估工单数**: 4 | **依赖**: Phase 1

#### Screen 08: Security & Permission Audit

| 工单 ID | 标题 | 描述 | 优先级 |
|---------|------|------|-------|
| **P6-01** | 安全仪表盘 | 危险命令策略卡片（bash/write/process），保护 PID 表格，风险等级色彩编码 | P2 |
| **P6-02** | 权限范围管理 | 权限范围列表/编辑，保护操作审核管道日志（左边框着色卡片），风险评分 | P2 |
| **P6-03** | Security i18n 翻译文件 | 编写 `security.json` 三语翻译 | P0 |

---

### Phase 7: 像素办公室 (Pixel Office)
> **预估工单数**: 4 | **依赖**: Phase 1

#### Screen 16: Agent Office & Swarm Simulation

| 工单 ID | 标题 | 描述 | 优先级 |
|---------|------|------|-------|
| **P7-01** | 像素办公室嵌入 | 将现有 Phaser 场景作为嵌入式 Canvas 组件集成到 SPA 中，或用 CSS Grid + 等距变换替代 | P2 |
| **P7-02** | 办公室区域渲染 | Strategy Room / Dev Hub / Memory Vault 3D 盒子，像素网格背景 | P2 |
| **P7-03** | 像素智能体可视化 | 像素风格智能体精灵（Analyst/Researcher/Critic），状态玻璃面板 | P2 |
| **P7-04** | 工作区上下文面板 | 右侧面板: 工作区上下文、活跃智能体列表、Swarm 健康指标 | P2 |

---

### Phase 8: 后端 RPC 扩展 (Backend RPC Extension)
> **预估工单数**: 8 | **依赖**: 与 Phase 2-7 并行

| 工单 ID | 标题 | 描述 | 优先级 |
|---------|------|------|-------|
| **P8-01** | config RPC 方法 | 新增 `config.get` / `config.update` 方法到 Gateway | P1 |
| **P8-02** | flows CRUD RPC 方法 | 新增 `flows.list` / `flows.get` / `flows.create` / `flows.update` / `flows.delete` 到 Gateway | P1 |
| **P8-03** | flows 执行与历史 RPC | 新增 `flows.execute` / `flows.history` / `flows.evolution` 到 Gateway | P2 |
| **P8-04** | exploration RPC 方法 | 新增 `exploration.status` / `exploration.history` / `exploration.evaluate` 到 Gateway | P2 |
| **P8-05** | security RPC 方法 | 新增 `security.scopes` / `security.dangerousPolicy` / `security.auditLog` 到 Gateway | P2 |
| **P8-06** | rag RPC 方法 | 新增 `rag.search` / `rag.collections` / `rag.ingest` 到 Gateway | P1 |
| **P8-07** | diagnostic 完整 RPC | 补全 `diagnostic.report` / `diagnostic.selfCheck` / `diagnostic.repair` 到 Gateway | P1 |
| **P8-08** | memory 扩展 RPC | 新增 `memory.layers` / `memory.ledger` / `memory.retrospective` 到 Gateway | P1 |

---

## 五、i18n 翻译键估算 / i18n Key Estimation

| 命名空间 | 预估键数 | 覆盖屏幕 |
|---------|---------|---------|
| `common` | ~80 | 全局 (导航/按钮/状态/错误/确认) |
| `chat` | ~35 | Screen 01 |
| `office` | ~30 | Screen 02, 16 |
| `settings` | ~60 | Screen 03 |
| `flows` | ~50 | Screen 04, 07, 11, 15 |
| `agents` | ~40 | Screen 05 |
| `explore` | ~25 | Screen 06 |
| `security` | ~30 | Screen 08 |
| `rag` | ~25 | Screen 12 |
| `diagnostics` | ~30 | Screen 13 |
| `memory` | ~30 | Screen 14 |
| **合计** | **~435 键 × 3 语言 = ~1305 翻译条目** | |

---

## 六、优先级排序 / Priority Matrix

```
P0 (必须先行 / Must-Have First):
┌────────────────────────────────────────────────┐
│ Phase 0: 基础设施 (i18n引擎 + 设计令牌 + RPC客户端) │
│ Phase 1: 统一Shell骨架 (侧边栏 + 路由 + 顶栏)    │
│ 所有 i18n 翻译文件                                │
└────────────────────────────────────────────────┘
          ↓
P1 (核心功能 / Core):
┌────────────────────────────────────────────────┐
│ Screen 01: Chat (最高频使用)                      │
│ Screen 03: Settings (语言切换入口)                 │
│ Screen 13: Diagnostics (运维必需)                 │
│ Screen 14: Memory (核心差异化功能)                 │
│ Screen 12: RAG (核心差异化功能)                    │
│ Screen 02: Office Canvas (任务管理)               │
│ Phase 8: 后端 RPC 扩展 (P1 部分)                  │
└────────────────────────────────────────────────┘
          ↓
P2 (完整体验 / Complete):
┌────────────────────────────────────────────────┐
│ Screen 04: Flow Editor                          │
│ Screen 05: Agent Swarm                          │
│ Screen 06: Exploration                          │
│ Screen 07: Evolution Log                        │
│ Screen 08: Security                             │
│ Screen 11: Skills Library                       │
│ Screen 15: Flow Monitor                         │
│ Screen 16: Pixel Office                         │
│ Phase 8: 后端 RPC 扩展 (P2 部分)                  │
└────────────────────────────────────────────────┘
```

---

## 七、工单总览 / Ticket Summary

| Phase | 主题 | 工单数 | 优先级 |
|-------|------|-------|-------|
| Phase 0 | 基础设施搭建 | 6 | P0 |
| Phase 1 | 统一 Shell 骨架 | 5 | P0 |
| Phase 2 | 核心工作区屏幕 | 10 | P0-P1 |
| Phase 3 | 智能体与流程屏幕 | 12 | P1-P2 |
| Phase 4 | 知识与记忆屏幕 | 7 | P1 |
| Phase 5 | 分析与日志屏幕 | 8 | P1-P2 |
| Phase 6 | 系统与安全屏幕 | 4 | P2 |
| Phase 7 | 像素办公室 | 4 | P2 |
| Phase 8 | 后端 RPC 扩展 | 8 | P1-P2 |
| **合计** | | **64 工单** | |

---

## 八、风险与注意事项 / Risks & Considerations

### 技术风险
1. **Phaser 集成**: 将 Phaser 游戏场景嵌入 SPA 框架需要处理生命周期和内存泄漏
2. **WebSocket 重连**: SPA 切页时保持 WebSocket 连接稳定
3. **大量翻译工作**: 1305 翻译条目需确保一致性和准确性
4. **SVG 可视化性能**: Flow Editor 和 Swarm 的复杂 SVG 渲染在大量节点时可能出现性能问题

### 设计风险
1. **Stitch 屏幕不一致**: 需在实现前统一导航/品牌（AD-02 决策），而非照搬每个屏幕
2. **响应式适配**: Stitch 设计为 2560px 桌面端，需考虑小屏幕适配策略
3. **设计令牌提取**: 需从 14 个 HTML 文件中归纳一致的令牌，处理设计间的微小差异

### 兼容性风险
1. **现有 Electron 终端**: 需决定是迁移到 SPA 还是保持双客户端
2. **现有 frontend-office**: Phaser 游戏逻辑需保留，但集成方式需重新设计
3. **现有 Gateway RPC**: 新增 RPC 方法需保持向后兼容

---

## 九、建议执行顺序 / Recommended Execution Order

```
Week 1-2:  Phase 0 (全部) + Phase 1 (全部)
           → 产出: 可运行的空壳 SPA + 统一导航 + i18n 框架 + 设计令牌

Week 3-4:  Phase 2 (Screen 01 Chat + Screen 03 Settings)
           + Phase 8 (P8-01 config RPC)
           → 产出: 核心聊天功能 + 系统设置 + 语言切换完整可用

Week 5-6:  Phase 2 (Screen 02 Canvas) + Phase 4 (全部)
           + Phase 8 (P8-06, P8-08)
           → 产出: 任务画布 + 记忆/RAG 页面

Week 7-8:  Phase 5 (Screen 13 Diagnostics) + Phase 3 (Screen 05 Agent)
           + Phase 8 (P8-07)
           → 产出: 诊断监控 + 智能体管理

Week 9-12: Phase 3 (剩余) + Phase 5 (剩余) + Phase 6 + Phase 7
           + Phase 8 (剩余)
           → 产出: 所有剩余屏幕完整实现
```

---

## 附录 A: 设计参考文件

所有 Stitch 屏幕截图和 HTML 源码已保存在:
```
docs/stitch-screens/
├── 01-Main-Terminal-Chat.{png,html}
├── 02-Office-Task-Canvas.{png,html}
├── 03-System-Settings-Appearance.{png,html}
├── 04-Flow-Editor-Visualizer.{png,html}
├── 05-Agent-Swarm-Workspace.{png,html}
├── 06-Exploration-Strategy-Critic.{png,html}
├── 07-Outcome-Evolution-Log.{png,html}
├── 08-Security-Permission-Audit.{png,html}
├── 11-Flows-Skills-Library.{png,html}
├── 12-RAG-Knowledge-Nexus.{png,html}
├── 13-Session-Diagnostics-Health.{png,html}
├── 14-Memory-Retrospective.{png,html}
├── 15-Flow-Execution-Monitor.{png,html}
└── 16-Agent-Office-Swarm-Simulation.{png,html}
```

## 附录 B: 统一设计令牌 (从 Stitch 提取)

```css
/* Colors - Material Design 3 Dark Theme */
--md-sys-color-primary: #a3a6ff;
--md-sys-color-primary-dim: #7c7fff;
--md-sys-color-secondary: #53ddfc;
--md-sys-color-tertiary: #ffa5d9;
--md-sys-color-error: #ff6e84;
--md-sys-color-surface: #131316;
--md-sys-color-surface-container: #1d1d21;
--md-sys-color-surface-container-high: #272729;
--md-sys-color-surface-container-highest: #323234;
--md-sys-color-surface-bright: #3b3b3f;
--md-sys-color-on-surface: #e5e5e5;
--md-sys-color-on-surface-variant: #a0a0a0;
--md-sys-color-outline: #444444;
--md-sys-color-outline-variant: #333333;

/* Typography */
--font-headline: 'Manrope', sans-serif;
--font-body: 'Inter', sans-serif;
--font-mono: 'JetBrains Mono', monospace;

/* Border Radius */
--radius-sm: 0.125rem;
--radius-md: 0.25rem;
--radius-lg: 0.5rem;
--radius-xl: 0.75rem;
--radius-full: 9999px;

/* Spacing (4px base) */
--space-1: 0.25rem;  /* 4px */
--space-2: 0.5rem;   /* 8px */
--space-3: 0.75rem;  /* 12px */
--space-4: 1rem;     /* 16px */
--space-6: 1.5rem;   /* 24px */
--space-8: 2rem;     /* 32px */
```

---

## 附录 C: 功能-界面交叉审计 / Feature-UI Cross Audit

> **审计日期**: 2026-03-23
> **方法**: 逐一比对后端 32 个 RPC 方法 + 13 个工具 + 所有内部模块 ↔ 14 个 Stitch UI 屏幕的每个元素

---

### C.1 后端功能存在，但 UI 设计中缺失 (Backend exists, UI missing)

以下功能在后端已完整实现，但在 16 个 Stitch 屏幕中**没有对应的 UI 入口或展示**:

| # | 后端功能 | RPC/模块 | 说明 | 建议 |
|---|---------|----------|------|------|
| **GAP-B01** | 隐私会话模式 | `chat` RPC 的 `privacy` 参数, `WO-SEC-006` | 后端支持完整的隐私会话（无 L1 写入、无快照持久化、隔离存储、ops.log 脱敏），但无任何 UI 屏幕展示隐私开关或隐私会话标识 | Screen 01 Chat 增加隐私模式开关 + 隐私指示徽章 |
| **GAP-B02** | 会话快照手动保存 | `session.saveSnapshot` RPC | RPC 存在但 UI 中仅有自动保存逻辑，无"保存快照"按钮 | Screen 01 Chat 会话管理增加手动保存按钮 |
| **GAP-B03** | 作用域授权管理 | `scope.grantSession` RPC | 后端支持对会话授权特定权限范围，Screen 08 仅展示已授权列表但无从聊天上下文中主动授权的 UI | Screen 01/08 增加授权确认弹窗 |
| **GAP-B04** | 配置热重载 | `config.reload` RPC | 后端支持运行时热重载配置，但 Settings 页面无"重载"按钮 | Screen 03 Settings 增加"重载配置"操作 |
| **GAP-B05** | 长时任务管理 | `task.getResult`, `task.listBySession` RPC | 后端有完整的异步任务队列（correlationId 追踪、状态轮询、过期清理），但无任何 UI 展示任务队列 | 新增 Screen 或在 Screen 13 增加"任务队列"面板 |
| **GAP-B06** | 操作撤销 | `undo_last` 工具 | 后端支持撤销上一个文件操作（基于 op-log），但无 UI 触发入口 | Screen 01 Chat 增加撤销按钮 |
| **GAP-B07** | 操作回放 | `replay_ops` 工具 | 后端支持从 op-log 回放历史操作，但无 UI | 可作为 Screen 07 Evolution Log 的扩展 |
| **GAP-B08** | 文件压缩工具 | `compress` 工具 | 后端有 zip 压缩工具，无 UI | 低优先级，可不做 UI |
| **GAP-B09** | IDE/UI 自动化 | `ide_ui`, `keymouse` 工具 | 后端支持 IDE 窗口自动化（describe/act/focus）和键鼠模拟（L3），无配置或监控 UI | Screen 03 Settings 增加 IDE 自动化配置区域 |
| **GAP-B10** | 主动建议系统 | `proactive.suggest` RPC | 后端有完整的主动推断引擎（timer/event/on_open/explicit 触发），Terminal 有简单按钮但 Stitch 设计无对应 UI | Screen 01 Chat 增加主动建议浮窗/面板 |
| **GAP-B11** | 心跳系统 | `heartbeat.tick` RPC + 配置 | 后端有完整心跳循环（check-orient-act-record），Screen 13 显示心跳状态但无配置入口（checklist 路径、间隔、LLM 检查开关） | Screen 03 Settings 增加心跳配置区 |
| **GAP-B12** | Swarm 团队 CRUD | `swarm.getTeams` RPC + 配置 | 后端有团队配置但仅支持读取，Screen 05 展示团队但无创建/编辑/删除操作 | Screen 05 增加团队管理 CRUD |
| **GAP-B13** | 智能体路由规则配置 | `config.agents.routes` | 后端支持 hint→agentId 路由映射，但无 UI 管理界面 | Screen 05 增加路由规则编辑面板 |
| **GAP-B14** | 流程路由规则配置 | `config.flows.routes` | 后端支持 intent→flowId 路由映射（含 slotRules），但无 UI | Screen 11 增加路由配置面板 |
| **GAP-B15** | Motivation 条目管理 | `rag.addMotivationEntry` | 后端支持添加内在动机条目用于 RAG 驱动的流程路由，但 Screen 12 仅展示触发映射表无增删改 | Screen 12 增加 Motivation CRUD |
| **GAP-B16** | 冷归档管理 | `archive-cold` CLI | 后端支持将过期 L1 条目归档至冷存储，但仅有 CLI 命令，无 UI 触发 | Screen 14 Memory 增加"执行冷归档"按钮 |
| **GAP-B17** | 审计日志导出 | `audit-export` CLI | 后端支持审计日志导出（JSON/CSV、按会话/日期过滤），但仅 CLI，无 UI | Screen 08 Security 增加审计导出面板 |
| **GAP-B18** | 指标导出 | `metrics-export` CLI | 后端支持会话指标 JSON 导出，但仅 CLI | Screen 13 增加指标导出按钮 |
| **GAP-B19** | 事件总线监控 | `event-bus/` 模块 | 后端有完整的发布/订阅事件总线（8+ 主题），但无任何 UI 展示事件流 | 新增"Event Bus Monitor"面板（可嵌入 Screen 05） |
| **GAP-B20** | 委派/协作可视化 | `collaboration/` 模块 | 后端支持 Agent 间委派（delegate.request/result）和 Pipeline 阶段传递，但无 UI 展示委派链 | Screen 05 增加委派链路追踪视图 |
| **GAP-B21** | 黑板变量管理 | `blackboard` (WO-BT-022) | Screen 15 显示黑板只读视图，但后端支持通过 slot_write 工具写入黑板，无 UI 编辑入口 | Screen 15 增加黑板编辑功能 |
| **GAP-B22** | 技能目录管理 | `skills/` 模块 | 后端可加载本地技能目录，Screen 11 仅展示核心技能但无自定义技能的增删改查 | Screen 11 增加自定义技能管理 |
| **GAP-B23** | MCP 服务器管理 | `mcp/` 模块 | 后端支持 MCP 服务器生命周期管理，Screen 11 仅展示 MCP 列表但无添加/删除/配置操作 | Screen 11 增加 MCP 服务器 CRUD |
| **GAP-B24** | Flow LLM 生成 | `runLLMGenerateFlow` | 后端支持通过 LLM 自动生成新流程，但 Screen 04/11 无"AI 生成流程"按钮 | Screen 04/11 增加"AI 生成"操作 |
| **GAP-B25** | 会话类型选择 | `sessionType` 参数 | 后端支持 5 种会话类型 (general/dev/knowledge/pm/swarm_manager)，Terminal 有下拉框但 Stitch UI 无此选择器 | Screen 01 Chat 增加会话类型选择器 |
| **GAP-B26** | 环境摘要工具 | `env_summary` 工具 | 后端可获取操作系统/PATH/Shell 等环境信息，无 UI 展示 | Screen 13 Diagnostics 增加环境信息面板 |

---

### C.2 UI 设计中展示，但后端功能不存在 (UI exists, Backend missing)

以下 UI 元素在 Stitch 设计中明确展示，但后端**没有对应的实现**:

| # | UI 元素 | 所在屏幕 | 说明 | 需新增后端实现 |
|---|--------|---------|------|-------------|
| **GAP-U01** | 文件附件按钮 (Attach File) | Screen 01 Chat | 聊天输入框旁有附件按钮，后端 `chat` RPC 不支持文件上传 | 需实现: 文件上传 → 临时存储 → 注入上下文 |
| **GAP-U02** | 数据集按钮 (Dataset) | Screen 01 Chat | 聊天工具栏有"Dataset"图标，后端无数据集管理概念 | 需评估: 可能映射到 RAG 集合或知识摄入 |
| **GAP-U03** | 主题引擎 (Light/Dark/Follow System) | Screen 03 Settings | UI 展示深色/浅色/跟随系统三种主题模式，后端无主题配置存储 | 需实现: 前端主题切换 + 偏好持久化（可前端本地存储） |
| **GAP-U04** | 字体缩放滑块 (Font Scaling) | Screen 03 Settings | Compact ↔ Default ↔ Large 三档字体缩放，后端无此配置 | 需实现: 前端本地设置（无需后端） |
| **GAP-U05** | 系统启动项 (Launch at System Start) | Screen 03 Settings | "开机自启"复选框，后端无系统服务注册逻辑 | 需实现: Electron/系统注册表集成 |
| **GAP-U06** | API 密钥加密存储 (AES-256) | Screen 03 Settings | UI 显示"Stored in AES-256 encrypted enclave"，后端 API 密钥仅通过环境变量读取，无加密存储 | 需评估: 可实现加密配置文件存储或保持环境变量方案 |
| **GAP-U07** | 动态端口修改 | Screen 03 Settings | Gateway 端口输入框暗示运行时端口切换，后端端口通过 CLI/配置文件设定无法运行时修改 | 需评估: 可作为"下次启动端口"配置 |
| **GAP-U08** | Swarm 配置导出 (Export Config) | Screen 05 Agent | "Export Config"按钮，后端无 Swarm 配置序列化导出 RPC | 需实现: `swarm.exportConfig` RPC |
| **GAP-U09** | Swarm 状态同步 (Sync Swarm State) | Screen 05 Agent | "Sync Swarm State"按钮，后端无显式同步 RPC | 需实现: `swarm.sync` RPC 或利用现有事件总线 |
| **GAP-U10** | 部署历史 (View Deployment History) | Screen 05 Agent | 部署历史链接，后端无 Agent 部署历史记录 | 需实现: Agent 实例生命周期日志持久化 |
| **GAP-U11** | 实例运行时间 (Uptime) | Screen 05 Agent | 显示 "42h 12m 04s" 运行时间，后端 Agent 实例有 `createdAt` 但无格式化 uptime 计算 | 需实现: 前端计算 (now - createdAt)，无需后端 |
| **GAP-U12** | 实例 Token 消耗追踪 | Screen 05 Agent | 显示 "1.2M / 5M" Token 用量，后端无按实例的 Token 使用量统计 | 需实现: 在 Agent 实例上累加 Token 消耗计数器 |
| **GAP-U13** | Browser/SQL-Sync/Root 工具 | Screen 05 Agent | 工具权限面板显示 "Browser", "SQL-Sync", "Root" 等工具，后端不存在这些工具 | UI 应动态反映后端实际工具列表，无需新增后端 |
| **GAP-U14** | 手动触发探索 (INITIATE PROTOCOL) | Screen 06 Exploration | 大按钮"INITIATE PROTOCOL"，后端探索层由 Gatekeeper 自动触发，无手动触发 RPC | 需实现: `exploration.trigger` RPC 手动入口 |
| **GAP-U15** | 基础设施部署 (Apply to Main Infrastructure) | Screen 07 Evolution | "Apply to Main Infrastructure"按钮，后端 `evolution.confirm` 仅修改流程库，无"基础设施部署"概念 | 需评估: 可映射到 `evolution.confirm` 或新增部署步骤 |
| **GAP-U16** | 内核完整性监控 (Kernel Integrity) | Screen 08 Security | 显示 "NOMINAL [99.9%]"，后端无内核完整性检查 | 需实现: 文件哈希校验或自检扩展 |
| **GAP-U17** | 加密模式管理 (AES-256-GCM) | Screen 08 Security | 加密模式显示/切换，后端无加密模块 | 需评估: 可作为展示信息（静态）或实现配置加密 |
| **GAP-U18** | 审计日志大小追踪 | Screen 08 Security | 显示 "1.2 GB / 5.0 GB"，后端审计日志无大小统计 | 需实现: 日志文件大小计算 RPC |
| **GAP-U19** | 权限范围过期倒计时 | Screen 08 Security | 每个授权范围显示 "Expires: 02:14:00" 倒计时，后端 `scheduledGrants` 支持时间窗口但无实时倒计时 | 需实现: 前端倒计时 + 后端返回 expiresAt 时间戳 |
| **GAP-U20** | 新建权限范围请求 (Request New Scope) | Screen 08 Security | "+ Request New Scope" 虚线边框按钮，后端 `scope.grantSession` 从服务端授权，无客户端请求流程 | 需实现: `scope.request` RPC + 审批流程 |
| **GAP-U21** | 连接向量数据库 (Connect Vector DB) | Screen 12 RAG | "Connect Vector DB"按钮，后端 RAG 通过配置文件连接，无动态连接 RPC | 需评估: 可映射到配置更新或实现动态连接 |
| **GAP-U22** | 新建向量集合 (New Collection) | Screen 12 RAG | "New Collection"按钮，后端集合为预定义（flows/skills/motivation），不支持动态创建 | 需实现: `rag.createCollection` RPC |
| **GAP-U23** | 知识图谱构建 | Screen 12 RAG | Motivation Trigger Map 暗示图谱关系，后端无图谱构建 | 需评估: 现有 Motivation 映射表可视化可能已足够 |
| **GAP-U24** | 摄入管道进度追踪 | Screen 12 RAG | "Chunking & Embedding: 74%" 进度条 + "Updating 1,204 shards"，后端 `knowledge.ingest` 为同步操作无进度报告 | 需实现: 异步摄入 + 进度事件流 |
| **GAP-U25** | 日志导出按钮 (Export Logs) | Screen 13 Diagnostics | "Export Logs"按钮，后端 `audit-export` 仅 CLI 无 RPC | 需实现: `diagnostic.exportLogs` RPC |
| **GAP-U26** | 内存缓存清除 (Purge Memory Cache) | Screen 13 Diagnostics | "Purge Memory Cache"按钮，后端无内存缓存清除功能 | 需实现: `memory.purgeCache` RPC |
| **GAP-U27** | 内存读写吞吐量 (GB/s) | Screen 13 Diagnostics | 显示 "1.2 GB/s" R/W 吞吐量，后端无此指标收集 | 需实现: 内存操作计时与吞吐量统计 |
| **GAP-U28** | 缓冲区利用率 (Buffer Utilization) | Screen 13 Diagnostics | 显示 "14.2%"，后端无缓冲区利用率概念 | 需实现: L0 缓冲区容量占比计算 |
| **GAP-U29** | 账本导出 (Export Ledger) | Screen 14 Memory | "Export Ledger"按钮，后端无滚动账本导出 RPC | 需实现: `memory.exportLedger` RPC |
| **GAP-U30** | 完整归档浏览 (Full Archive) | Screen 14 Memory | "Full Archive"按钮，后端无冷归档浏览 RPC | 需实现: `memory.browseArchive` RPC |
| **GAP-U31** | 影响模拟 (Simulate Impact) | Screen 14 Memory | "Simulate Impact"按钮，后端无自我改进影响预测功能 | 需实现: LLM 驱动的影响预测（或标记为"计划中"） |
| **GAP-U32** | 内存层容量百分比 | Screen 14 Memory | L1: 82%, L2: 41% 容量条，后端无内存层容量/使用率统计 | 需实现: `memory.stats` RPC 返回各层容量信息 |
| **GAP-U33** | 效率评级 (A+ Rating) | Screen 14 Memory | 晨间报告效率评级，后端 `retrospective.report` 返回摘要但无评级计算 | 需实现: 评级算法（基于 drift%、一致性等） |
| **GAP-U34** | 运营漂移百分比 (Operational Drift) | Screen 14 Memory | 显示 "+0.02% drift"，后端无漂移追踪 | 需实现: 跨会话行为一致性比较 |
| **GAP-U35** | 流程暂停 (Pause Execution) | Screen 15 Flow Monitor | "Pause Execution"按钮，后端 BT/FSM 引擎为同步执行无暂停机制 | 需实现: 异步执行引擎 + 暂停/恢复机制 |
| **GAP-U36** | 流程中止 (Abort Flow) | Screen 15 Flow Monitor | "Abort Flow"按钮，后端无流程中止 RPC | 需实现: `flows.abort` RPC + 执行取消令牌 |
| **GAP-U37** | BT 注入命令 (Injection Command) | Screen 15 Flow Monitor | 终端式输入框用于 BT 操纵，后端无运行时 BT 节点注入 | 需实现: `flows.inject` RPC（调试功能） |
| **GAP-U38** | BT 实时状态推送 | Screen 15 Flow Monitor | 实时 BT 节点状态更新，后端 BT 执行为同步无状态推送 | 需实现: BT 执行事件流 + WebSocket 推送 |
| **GAP-U39** | 工作区重组 (Reorganize Workspace) | Screen 16 Office | "Reorganize Workspace"按钮，后端无空间布局管理 | 需实现: 前端本地布局管理（无需后端） |
| **GAP-U40** | 神经映射 (Neural Map) | Screen 16 Office | 导航项"Neural Map"，后端无神经映射/关系图功能 | 需实现: 知识关系图可视化（基于 RAG 向量相似度） |
| **GAP-U41** | 归档浏览 (Archives) | Screen 16 Office | 导航项"Archives"，后端无统一归档浏览 | 需评估: 可映射到冷归档 + 会话历史 |
| **GAP-U42** | 模拟刻度 (SIM_TICK) | Screen 16 Office | 显示 "SIM_TICK: 14,029"，后端无模拟引擎刻度概念 | 需实现: 前端模拟帧计数（无需后端） |
| **GAP-U43** | TPS 实时图表 | Screen 02 Office | "42.8/s" + 火花线图，后端无 TPS（每秒事务数）指标收集 | 需实现: Gateway 请求计数器 + 秒级统计 |
| **GAP-U44** | 节点级别执行监控 | Screen 02 Office | 显示 #4402-A, #991 等节点的独立进度，后端无按节点的执行进度追踪 | 需实现: 执行上下文中的步骤级别进度事件 |
| **GAP-U45** | Exploration 分类标签 | Screen 06 Exploration | "CLASSIFICATION: Strategic_Deep"，后端 Gatekeeper 判断是否触发探索但无分类标签输出 | 需实现: Gatekeeper 返回分类结果 |

---

### C.3 后端与 UI 存在但不匹配的功能 (Mismatch)

| # | 问题 | 后端现状 | UI 设计 | 修正方案 |
|---|------|---------|---------|---------|
| **MIS-01** | Agent 蓝图详情 | 后端蓝图有丰富字段: systemPrompt, boundFlowIds, localMemory, llm, toolsFilter | Screen 05 仅展示 name + 简短描述 + 版本号 | UI 增加蓝图详情展开面板 |
| **MIS-02** | Flow 路由信息 | 后端支持 3 种路由源: rule/motivation_rag/intent_classifier | Screen 11 仅展示流程列表无路由源标注 | UI 增加路由源标签 |
| **MIS-03** | 安全策略粒度 | 后端支持自定义正则规则 (`config.security.dangerousCommands.customPatterns`) | Screen 08 仅展示 bash/write/process 三类固定策略 | UI 增加自定义规则编辑 |
| **MIS-04** | 内存折叠操作 | 后端 `memory.fold` 支持指定日期折叠 | Screen 14 无折叠操作入口 | UI 增加"执行折叠"按钮 + 日期选择 |
| **MIS-05** | RAG 重索引 | 后端 `rag.reindex` 支持按集合重建索引 | Screen 12 无重索引操作 | UI 增加"重建索引"按钮 |
| **MIS-06** | 回顾系统完整链路 | 后端有完整链路: `retrospective.run` → `retrospective.report` → `retrospective.list` → `retrospective.apply` | Screen 14 仅展示报告和时间线，缺少"运行回顾"和"应用补丁"操作 | UI 增加"运行回顾分析"和"应用待定补丁"按钮 |
| **MIS-07** | 流程失败扫描 | 后端 `flows.scanFailureReplacement` 批量扫描所有流程的失败模式 | Screen 07/11 无批量扫描入口 | UI 增加"扫描失败模式"按钮 |
| **MIS-08** | 演化确认/应用 | 后端有 `evolution.confirm` 和 `evolution.apply` 两个独立 RPC | Screen 07 仅有"Confirm Evolution"和"Discard"按钮，缺少 `evolution.apply` 的上下文输入 UI | UI 区分"确认演化"和"应用演化上下文" |

---

### C.4 影响评估与补充工单

#### 新增后端工单 (补充至 Phase 8)

| 工单 ID | 标题 | 来源 GAP | 优先级 | 工作量 |
|---------|------|---------|-------|-------|
| **P8-09** | 文件上传 RPC | GAP-U01 | P1 | 中 |
| **P8-10** | memory.stats RPC (容量/使用率) | GAP-U32, GAP-U28 | P1 | 小 |
| **P8-11** | memory.exportLedger RPC | GAP-U29 | P2 | 小 |
| **P8-12** | memory.browseArchive RPC | GAP-U30 | P2 | 小 |
| **P8-13** | memory.purgeCache RPC | GAP-U26 | P2 | 小 |
| **P8-14** | exploration.trigger RPC (手动触发) | GAP-U14 | P2 | 小 |
| **P8-15** | exploration 分类结果返回 | GAP-U45 | P2 | 小 |
| **P8-16** | Agent 实例 Token 消耗计数器 | GAP-U12 | P1 | 中 |
| **P8-17** | BT 执行事件流 (实时状态推送) | GAP-U38 | P2 | 大 |
| **P8-18** | flows.abort RPC (流程中止) | GAP-U36 | P2 | 中 |
| **P8-19** | rag.createCollection RPC | GAP-U22 | P2 | 中 |
| **P8-20** | 知识摄入异步化 + 进度事件 | GAP-U24 | P2 | 大 |
| **P8-21** | diagnostic.exportLogs RPC | GAP-U25 | P1 | 小 |
| **P8-22** | 审计日志大小统计 | GAP-U18 | P2 | 小 |
| **P8-23** | Gateway TPS 计数器 | GAP-U43 | P2 | 小 |
| **P8-24** | scope.request RPC (客户端请求权限) | GAP-U20 | P2 | 中 |
| **P8-25** | 效率评级算法 | GAP-U33, GAP-U34 | P2 | 中 |

#### 新增前端工单 (补充至对应 Phase)

| 工单 ID | 标题 | 来源 GAP | 所属 Phase | 优先级 |
|---------|------|---------|-----------|-------|
| **P2-11** | Chat 隐私模式开关 | GAP-B01 | Phase 2 | P1 |
| **P2-12** | Chat 会话快照保存按钮 | GAP-B02 | Phase 2 | P1 |
| **P2-13** | Chat 会话类型选择器 | GAP-B25 | Phase 2 | P0 |
| **P2-14** | Chat 主动建议面板 | GAP-B10 | Phase 2 | P1 |
| **P2-15** | Chat 文件附件上传 | GAP-U01 | Phase 2 | P1 |
| **P2-16** | Chat 操作撤销按钮 | GAP-B06 | Phase 2 | P2 |
| **P2-17** | Settings 主题引擎 (前端本地) | GAP-U03 | Phase 2 | P1 |
| **P2-18** | Settings 字体缩放 (前端本地) | GAP-U04 | Phase 2 | P2 |
| **P2-19** | Settings 配置热重载按钮 | GAP-B04 | Phase 2 | P1 |
| **P2-20** | Settings IDE 自动化配置区域 | GAP-B09 | Phase 2 | P2 |
| **P2-21** | Settings 心跳系统配置区域 | GAP-B11 | Phase 2 | P2 |
| **P3-13** | Agent 蓝图详情展开面板 | MIS-01 | Phase 3 | P1 |
| **P3-14** | Agent 团队 CRUD 管理 | GAP-B12 | Phase 3 | P2 |
| **P3-15** | Agent 路由规则编辑 | GAP-B13 | Phase 3 | P2 |
| **P3-16** | Agent 委派链路追踪视图 | GAP-B20 | Phase 3 | P2 |
| **P3-17** | Agent 事件总线监控面板 | GAP-B19 | Phase 3 | P2 |
| **P3-18** | Flow AI 生成按钮 | GAP-B24 | Phase 3 | P1 |
| **P3-19** | Flow 路由规则配置面板 | GAP-B14 | Phase 3 | P2 |
| **P3-20** | Flow Monitor 暂停/中止控件 | GAP-U35, GAP-U36 | Phase 3 | P2 |
| **P3-21** | Skills Library 自定义技能管理 | GAP-B22 | Phase 3 | P2 |
| **P3-22** | Skills Library MCP 服务器 CRUD | GAP-B23 | Phase 3 | P2 |
| **P3-23** | Flow 失败扫描按钮 | MIS-07 | Phase 3 | P2 |
| **P4-08** | Memory 冷归档触发按钮 | GAP-B16 | Phase 4 | P2 |
| **P4-09** | Memory 折叠操作入口 | MIS-04 | Phase 4 | P1 |
| **P4-10** | Memory 回顾完整操作链 | MIS-06 | Phase 4 | P1 |
| **P4-11** | RAG Motivation CRUD | GAP-B15 | Phase 4 | P1 |
| **P4-12** | RAG 新建集合功能 | GAP-U22 | Phase 4 | P2 |
| **P4-13** | RAG 重索引按钮 | MIS-05 | Phase 4 | P1 |
| **P4-14** | RAG 摄入进度条 | GAP-U24 | Phase 4 | P2 |
| **P5-09** | Diagnostics 任务队列面板 | GAP-B05 | Phase 5 | P1 |
| **P5-10** | Diagnostics 环境信息面板 | GAP-B26 | Phase 5 | P2 |
| **P5-11** | Diagnostics 日志/指标导出 | GAP-U25, GAP-B18 | Phase 5 | P1 |
| **P6-04** | Security 审计日志导出面板 | GAP-B17 | Phase 6 | P1 |
| **P6-05** | Security 自定义规则编辑 | MIS-03 | Phase 6 | P2 |
| **P6-06** | Security 权限请求流程 | GAP-U20 | Phase 6 | P2 |
| **P6-07** | Security 权限过期倒计时 | GAP-U19 | Phase 6 | P2 |

---

### C.5 更新后工单总览

| Phase | 主题 | 原工单数 | 新增工单数 | 总计 |
|-------|------|---------|-----------|------|
| Phase 0 | 基础设施搭建 | 6 | 0 | **6** |
| Phase 1 | 统一 Shell 骨架 | 5 | 0 | **5** |
| Phase 2 | 核心工作区屏幕 | 10 | +11 | **21** |
| Phase 3 | 智能体与流程屏幕 | 12 | +11 | **23** |
| Phase 4 | 知识与记忆屏幕 | 7 | +7 | **14** |
| Phase 5 | 分析与日志屏幕 | 8 | +3 | **11** |
| Phase 6 | 系统与安全屏幕 | 4 | +4 | **8** |
| Phase 7 | 像素办公室 | 4 | 0 | **4** |
| Phase 8 | 后端 RPC 扩展 | 8 | +17 | **25** |
| **合计** | | **64** | **+53** | **117 工单** |

---

### C.6 GAP 优先级分类

#### 必须修复 (P0/P1 — 影响核心体验)

| GAP ID | 简述 | 原因 |
|--------|------|------|
| GAP-B01 | 隐私模式 UI | 已实现的安全功能无 UI 入口，用户无法使用 |
| GAP-B10 | 主动建议面板 | 核心 AI 差异化功能无展示 |
| GAP-B25 | 会话类型选择 | 5 种会话类型后端完整但 UI 缺失 |
| GAP-U01 | 文件附件 | Chat 核心交互缺失 |
| GAP-U03 | 主题引擎 | Settings 页面核心功能 |
| MIS-06 | 回顾完整链路 | 4 个 RPC 仅 1 个在 UI 暴露 |
| GAP-U32 | 内存容量统计 | Memory 页面核心数据展示 |
| GAP-B05 | 任务队列 | 异步任务完全无可见性 |

#### 推荐修复 (P2 — 完善体验)

| GAP ID | 简述 | 原因 |
|--------|------|------|
| GAP-U38 | BT 实时推送 | Flow Monitor 的核心价值 |
| GAP-U24 | 摄入进度 | RAG 批量操作无反馈 |
| GAP-B19 | 事件总线监控 | 多 Agent 调试必需 |
| GAP-B20 | 委派链路追踪 | 多 Agent 协作可视化 |
| GAP-U36 | 流程中止 | 长时流程无中断能力 |
| GAP-B24 | AI 生成流程 | 已实现的高价值功能无 UI |

#### 可延后 (P3 — 锦上添花)

| GAP ID | 简述 |
|--------|------|
| GAP-U05 | 系统启动项 |
| GAP-U06 | API 密钥加密存储 |
| GAP-U16 | 内核完整性 |
| GAP-U40 | 神经映射 |
| GAP-U42 | 模拟刻度 |
| GAP-B07 | 操作回放 UI |
| GAP-B08 | 文件压缩 UI |

---

## 附录 D: 详细设计文档索引 / Design Document Index

> **总计**: 10 份详细设计文档，覆盖所有 GAP 项的功能设计、RPC 接口、UI 线框图、i18n 键定义

### D.1 设计文档列表

| 编号 | 文档名称 | 文件路径 | 覆盖 GAP | 影响屏幕 | 新增 RPC |
|------|---------|---------|---------|---------|---------|
| **DD-01** | 隐私与会话增强 | `docs/design/GAP-DD-01-privacy-session-enhancement.md` | B01, B02, B03, B25, U01 | Screen 01 | `file.upload` |
| **DD-02** | 主动建议与任务队列 | `docs/design/GAP-DD-02-proactive-task-queue.md` | B05, B06, B10 | Screen 01, 17 | `task.cancel` |
| **DD-03** | 智能体增强操作 | `docs/design/GAP-DD-03-agent-enhanced-ops.md` | B12, B13, B19, B20, U12 | Screen 05, 18 | `swarm.createTeam/updateTeam/deleteTeam`, `agents.routes.list/update`, `eventbus.subscribe`, `delegation.list` |
| **DD-04** | 流程执行控制 | `docs/design/GAP-DD-04-flow-execution-control.md` | U35, U36, U37, U38, B24 | Screen 11, 15 | `flows.control`, `flows.editOps`, `flows.getTree`, `flows.subscribe` |
| **DD-05** | 记忆增强操作 | `docs/design/GAP-DD-05-memory-enhanced-ops.md` | U26-U34, B16 | Screen 14 | `memory.stats`, `memory.promote`, `memory.archiveCold`, `memory.export`, `memory.purge`, `memory.rollingLedger`, `memory.driftReport` |
| **DD-06** | RAG 增强操作 | `docs/design/GAP-DD-06-rag-enhanced-ops.md` | U21-U24, B15 | Screen 12 | `rag.collections.list/create/delete`, `rag.ingest`, `rag.motivation.list/create/update/delete` |
| **DD-07** | 安全增强操作 | `docs/design/GAP-DD-07-security-enhanced-ops.md` | U16-U20, B17 | Screen 08 | `security.rules.list/update`, `security.scheduledGrants.list/update`, `security.audit.query/export`, `security.integrity.check` |
| **DD-08** | 技能与 MCP 管理 | `docs/design/GAP-DD-08-skills-mcp-management.md` | B22, B23, B14, B24 | Screen 11 | `skills.list/create/update/delete/test`, `mcp.servers.list/add/remove/reconnect`, `flows.routes.list/update` |
| **DD-09** | 诊断与可观测性 | `docs/design/GAP-DD-09-diagnostics-observability.md` | B05, B26, U25, U27, U28, B18 | Screen 08, 17 | `diagnostic.environment`, `diagnostic.export` |
| **DD-10** | 配置与主题系统 | `docs/design/GAP-DD-10-configuration-theme.md` | U03-U07, B04, B09, B11 | Screen 03, 13 | `config.get`, `config.update` |

### D.2 工单 → 设计文档映射

#### Phase 2 工单映射

| 工单 ID | 标题 | 设计文档 | 章节 |
|---------|------|---------|------|
| P2-11 | Chat 隐私模式开关 | DD-01 | §2 |
| P2-12 | Chat 会话快照保存按钮 | DD-01 | §3 |
| P2-13 | Chat 会话类型选择器 | DD-01 | §5 |
| P2-14 | Chat 主动建议面板 | DD-02 | §2 |
| P2-15 | Chat 文件附件上传 | DD-01 | §6 |
| P2-16 | Chat 操作撤销按钮 | DD-02 | §4 |
| P2-17 | Settings 主题引擎 | DD-10 | §2 |
| P2-18 | Settings 字体缩放 | DD-10 | §3 |
| P2-19 | Settings 配置热重载按钮 | DD-10 | §5 |
| P2-20 | Settings IDE 自动化配置 | DD-10 | §6 |
| P2-21 | Settings 心跳系统配置 | DD-10 | §7 |

#### Phase 3 工单映射

| 工单 ID | 标题 | 设计文档 | 章节 |
|---------|------|---------|------|
| P3-13 | Agent 蓝图详情展开面板 | DD-03 | §2 |
| P3-14 | Agent 团队 CRUD 管理 | DD-03 | §2 |
| P3-15 | Agent 路由规则编辑 | DD-03 | §3 |
| P3-16 | Agent 委派链路追踪视图 | DD-03 | §5 |
| P3-17 | Agent 事件总线监控面板 | DD-03 | §4 |
| P3-18 | Flow AI 生成按钮 | DD-04 | §5 |
| P3-19 | Flow 路由规则配置面板 | DD-08 | §4 |
| P3-20 | Flow Monitor 暂停/中止控件 | DD-04 | §2 |
| P3-21 | Skills Library 自定义技能管理 | DD-08 | §2 |
| P3-22 | Skills Library MCP 服务器 CRUD | DD-08 | §3 |
| P3-23 | Flow 失败扫描按钮 | DD-04 | §6 |

#### Phase 4 工单映射

| 工单 ID | 标题 | 设计文档 | 章节 |
|---------|------|---------|------|
| P4-08 | Memory 冷归档触发按钮 | DD-05 | §4 |
| P4-09 | Memory 折叠操作入口 | DD-05 | §3 |
| P4-10 | Memory 回顾完整操作链 | DD-05 | §7 |
| P4-11 | RAG Motivation CRUD | DD-06 | §4 |
| P4-12 | RAG 新建集合功能 | DD-06 | §2 |
| P4-13 | RAG 重索引按钮 | DD-06 | §5 |
| P4-14 | RAG 摄入进度条 | DD-06 | §3 |

#### Phase 5 工单映射

| 工单 ID | 标题 | 设计文档 | 章节 |
|---------|------|---------|------|
| P5-09 | Diagnostics 任务队列面板 | DD-02 | §3 |
| P5-10 | Diagnostics 环境信息面板 | DD-09 | §2 |
| P5-11 | Diagnostics 日志/指标导出 | DD-09 | §4 |

#### Phase 6 工单映射

| 工单 ID | 标题 | 设计文档 | 章节 |
|---------|------|---------|------|
| P6-04 | Security 审计日志导出面板 | DD-07 | §5 |
| P6-05 | Security 自定义规则编辑 | DD-07 | §2 |
| P6-06 | Security 权限请求流程 | DD-07 | §3 |
| P6-07 | Security 权限过期倒计时 | DD-07 | §4 |

#### Phase 8 后端工单映射

| 工单 ID | 标题 | 设计文档 | 章节 |
|---------|------|---------|------|
| P8-09 | 文件上传 RPC | DD-01 | §6 |
| P8-10 | memory.stats RPC | DD-05 | §2 |
| P8-11 | memory.exportLedger RPC | DD-05 | §5 |
| P8-12 | memory.browseArchive RPC | DD-05 | §4 |
| P8-13 | memory.purgeCache RPC | DD-05 | §6 |
| P8-16 | Agent Token 消耗计数器 | DD-03 | §6 |
| P8-17 | BT 执行事件流 | DD-04 | §4 |
| P8-18 | flows.abort RPC | DD-04 | §2 |
| P8-19 | rag.createCollection RPC | DD-06 | §2 |
| P8-20 | 知识摄入异步化 + 进度 | DD-06 | §3 |
| P8-21 | diagnostic.exportLogs RPC | DD-09 | §4 |

### D.3 新增 RPC 方法汇总 (从设计文档)

| RPC 方法 | 设计文档 | 说明 |
|---------|---------|------|
| `file.upload` | DD-01 | Base64 文件上传到会话临时存储 |
| `task.cancel` | DD-02 | 取消运行中的异步任务 |
| `swarm.createTeam` | DD-03 | 创建智能体团队 |
| `swarm.updateTeam` | DD-03 | 更新团队配置 |
| `swarm.deleteTeam` | DD-03 | 删除团队 |
| `agents.routes.list` | DD-03 | 列出 Agent 路由规则 |
| `agents.routes.update` | DD-03 | 更新 Agent 路由规则 |
| `eventbus.subscribe` | DD-03 | WebSocket 订阅事件流 |
| `delegation.list` | DD-03 | 列出委派记录 |
| `flows.control` | DD-04 | 暂停/恢复/中止流程 |
| `flows.editOps` | DD-04 | BT 结构编辑操作 |
| `flows.getTree` | DD-04 | 获取流程树结构 |
| `flows.subscribe` | DD-04 | 订阅流程执行进度 |
| `memory.stats` | DD-05 | 记忆容量统计 |
| `memory.promote` | DD-05 | L1→L2 手动提升 |
| `memory.archiveCold` | DD-05 | 手动冷归档 |
| `memory.export` | DD-05 | 记忆条目导出 |
| `memory.purge` | DD-05 | 永久清除记忆 |
| `memory.rollingLedger` | DD-05 | 获取滚动窗口数据 |
| `memory.driftReport` | DD-05 | 漂移分析报告 |
| `rag.collections.list` | DD-06 | 列出 RAG 集合 |
| `rag.collections.create` | DD-06 | 创建集合 |
| `rag.collections.delete` | DD-06 | 删除集合 |
| `rag.ingest` | DD-06 | 文档摄入 |
| `rag.motivation.list` | DD-06 | 列出 Motivation 条目 |
| `rag.motivation.create` | DD-06 | 创建 Motivation 条目 |
| `rag.motivation.update` | DD-06 | 更新 Motivation 条目 |
| `rag.motivation.delete` | DD-06 | 删除 Motivation 条目 |
| `security.rules.list` | DD-07 | 列出安全规则 |
| `security.rules.update` | DD-07 | 更新安全规则 |
| `security.scheduledGrants.list` | DD-07 | 列出计划授权 |
| `security.scheduledGrants.update` | DD-07 | 更新计划授权 |
| `security.audit.query` | DD-07 | 查询审计日志 |
| `security.audit.export` | DD-07 | 导出审计日志 |
| `security.integrity.check` | DD-07 | 内核完整性检查 |
| `skills.list` | DD-08 | 列出技能 |
| `skills.create` | DD-08 | 创建技能 |
| `skills.update` | DD-08 | 更新技能 |
| `skills.delete` | DD-08 | 删除技能 |
| `skills.test` | DD-08 | 测试技能 |
| `mcp.servers.list` | DD-08 | 列出 MCP 服务器 |
| `mcp.servers.add` | DD-08 | 添加 MCP 服务器 |
| `mcp.servers.remove` | DD-08 | 移除 MCP 服务器 |
| `mcp.servers.reconnect` | DD-08 | 重连 MCP 服务器 |
| `flows.routes.list` | DD-08 | 列出流程路由 |
| `flows.routes.update` | DD-08 | 更新流程路由 |
| `diagnostic.environment` | DD-09 | 获取环境信息 |
| `diagnostic.export` | DD-09 | 导出诊断数据 |
| `config.get` | DD-10 | 获取当前配置 |
| `config.update` | DD-10 | 更新配置 |

**统计**: 设计文档共定义 **49 个新增 RPC 方法**，加上原有 32 个 Gateway RPC，总计将达 **81 个 RPC 方法**。
