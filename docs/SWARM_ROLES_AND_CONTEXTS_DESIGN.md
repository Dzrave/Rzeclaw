# 蜂群角色与多上下文设计

本文档为 **Phase 10** 的详细设计：在单 Agent 前提下，通过**会话类型/角色**（如开发、知识库、PM）与**多 workspace/多上下文**协同，呈现「蜂群」分工感；为后续多 Agent 编排预留扩展点。**仅设计不实现。**

---

## 一、目标

- **角色化行为**：同一 Agent 在不同「会话类型」或「任务类型」下，通过不同的 system 提示或配置，呈现不同职责（如「你负责前端开发」「你负责知识库答疑」「你负责项目管理与进度汇总」）。
- **多上下文隔离**：按 workspace（及可选 projectId）隔离会话、画布、任务与记忆，避免串台；终端可切换「当前 workspace」或「当前会话类型」。
- **共享底座**：记忆（L1/L2）、任务体系、画布仍可跨 workspace 或按配置共享/隔离，便于「全局 PM」与「单项目开发」并存。

---

## 二、会话类型 / 角色

- **概念**：会话（session）除 sessionId、workspace 外，增加可选 **sessionType** 或 **role** 字段，取值如 `dev` | `knowledge` | `pm` | `swarm_manager` | `general`。
- **来源**：  
  - 用户创建会话时在终端选择「会话类型」；  
  - 或 Gateway 在 session.getOrCreate 时接受 params.sessionType，写入会话元数据。
- **影响**：  
  - **System 注入**：runAgentLoop 根据 sessionType 注入不同角色描述（如「你是本工作区的开发助手，侧重写码与调试」vs「你是知识库顾问，侧重依据记忆作答」）。  
  - **工具与能力**：可配置某角色禁用部分工具（如 PM 仅只读工具）；当前阶段可统一工具集，仅通过 prompt 区分行为。  
- **存储**：Session 对象增加 sessionType；快照与 session.list 返回该字段，终端可展示与筛选。

---

## 三、多 workspace 与 projectId

- **现状**：Gateway 与 Agent 已支持 params.workspace，记忆与画布按 workspace 隔离。
- **增强**：  
  - **会话列表按 workspace 分组**：session.list 支持按 workspace 过滤或返回分组；终端可展示「工作区 A」「工作区 B」下的会话。  
  - **可选 projectId**：在 workspace 下再细分子项目（如 projectId: "frontend"）；画布或任务可带 projectId，便于多项目同 workspace。当前阶段可为可选字段，不强制实现。  
- **「全局」workspace**：配置或约定某 workspaceId（如 `_global`）表示全局 PM 或跨项目视图；该 workspace 下任务/画布可汇总多项目（实现可后置）。

---

## 四、角色与 system 的映射

- **配置**：在 config 或单独配置文件中定义角色与 system 片段，例如：  
  - `roles.dev`: "你是本工作区的开发助手。侧重代码编写、修改、调试与运行。优先使用 bash、read、write、edit 等工具。"  
  - `roles.knowledge`: "你是知识库顾问。侧重依据已有记忆与文档作答，并帮助整理与更新知识。避免执行写盘等敏感操作，除非用户明确同意。"  
  - `roles.pm`: "你是项目管理助手。侧重目标拆解、任务跟踪、进度汇总与画布更新。可读画布与任务，执行前优先给出提议。"  
  - `roles.swarm_manager`: "你是蜂群协调助手。负责汇总多工作区/多角色的任务与进度，给出跨区建议与优先级。优先只读汇总与提议，执行前请确认。"  
  - `roles.general`: 默认，不额外注入或使用通用描述。
- **注入时机**：runAgentLoop 在构建 systemPrompt 时，若传入或从会话解析出 sessionType，则追加对应 roles[sessionType] 片段。

---

## 四（补）、蜂群管理角色与多层级蜂群配置

### 蜂群管理角色（swarm_manager）

- **定位**：在单 Agent 前提下，提供「跨工作区/跨角色」的协调视角；不替代 dev/knowledge/pm，而是与之并列的一种会话类型，用于汇总与建议。
- **sessionType**：`swarm_manager`。终端创建会话时可选择「蜂群管理」；Gateway session.getOrCreate 接受 sessionType，持久化到 Session 与快照。
- **行为**：通过 system 注入 `roles.swarm_manager` 描述；可选注入「当前协调团队」或「可协调工作区列表」（见下），使模型知晓协调范围。工具集与其余角色一致；通过 prompt 约束「优先汇总与提议，执行前确认」。

### 多层级蜂群配置（config.swarm）

- **层级含义**：  
  - **Level 1**：单工作区 + 多会话类型（dev / knowledge / pm / general / swarm_manager）。  
  - **Level 2**：多工作区 + 会话列表按 workspace 过滤/分组（session.list 已支持 workspace 参数）。  
  - **Level 3**：命名团队（teams）：将多个 workspace 归为一组，供蜂群管理会话限定「协调范围」或终端按团队筛选。
- **配置结构**（可选）：  
  - **config.swarm.teams**：`Array<{ id: string; name: string; workspaces?: string[] }>`。id 唯一；name 展示用；workspaces 为该团队关联的工作区路径列表（可为空，表示「全局」或由用户指定）。  
  - **config.swarm.defaultTeamId**： string | undefined。终端或 Gateway 可据此默认选中某一团队（如默认「当前项目」）。  
- **使用方式**：  
  - 创建 swarm_manager 会话时，可传 **params.teamId**（对应 teams[].id）；runAgentLoop 若收到 sessionType=swarm_manager 且 teamId，则在 system 中注入「当前协调团队：{name}，工作区：{workspaces}」。  
  - 若未配置 teams 或未传 teamId，蜂群管理角色仍生效，仅不注入团队范围，由模型按「多工作区协调」理解。  
- **扩展**：后续可增加「按团队拉取多 workspace 画布/任务汇总」的只读接口；本 Phase 仅完成配置与 prompt 注入，不实现跨 workspace 聚合 API。

---

## 五、终端侧

- **创建/恢复会话时选择类型**：新会话可选择「开发 / 知识库 / PM / 蜂群管理 / 通用」；恢复会话时展示类型标签。  
- **蜂群管理 + 团队**：若配置了 swarm.teams，选择「蜂群管理」时可可选选择「当前协调团队」；调用 session.getOrCreate 时传入 sessionType=swarm_manager、可选 teamId。  
- **连接配置与默认 workspace**：多连接配置下可设「默认 workspace」；切换连接或 workspace 时刷新会话列表与画布。

---

## 六、扩展预留（多 Agent）

- **当前**：单 Agent + 多会话类型，通过 prompt 区分角色。  
- **预留**：若未来引入多 Agent 进程（如 dev-agent、knowledge-agent、pm-agent），可复用同一套 sessionType/role 与 workspace 概念，由 Gateway 或协调层将请求路由到对应 Agent；本 Phase 不实现多 Agent，仅保证「会话类型与 workspace」在协议与存储上一致，便于后续扩展。

---

## 七、与愿景文档的对应

- 《蜂群智能团队愿景与整体设计方案》3.2 协作维度：任务维度、上下文维度（workspace/项目）、角色维度（可选扩展）。  
- 4.1～4.3 能力支柱：开发、知识库、项目管理分别对应 dev、knowledge、pm 角色倾向。

---

*本文档为 Phase 10 实施的设计依据；工单见 PHASE10_WORK_ORDERS.md。*
