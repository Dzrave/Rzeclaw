# 前端客户端与 Star-Office-UI 对齐设计

本文档分析 [Star-Office-UI](https://github.com/ringhyacinth/Star-Office-UI) 前端项目，对照 Rzeclaw 当前实现，明确**可对齐内容**、**需额外开发内容**、**保留/移除建议**，以及如何作为**本地前端**使用（像素办公室 + 内嵌对话窗口 + OpenClaw 式 WebChannel）。

---

## 一、目标与形态

### 1.1 目标

- **前端形态**：类似 Star-Office-UI 的像素办公室看板，并**在同一个客户端内增加对话窗口**（非独立网页）。
- **通信方式**：结合 OpenClaw 的 WebChannel 方式，即通过 **WebSocket 连接 Rzeclaw Gateway**，使用现有 JSON-RPC 协议（`chat`、`session.*` 等），不依赖 Star-Office-UI 的 Flask HTTP 接口。
- **角色体系**：构建智能体的方式与游戏类似；**角色/角色表现**可完全套用 Star-Office-UI 的布局与精灵，再按 Rzeclaw 的 Agent 蓝图与实例进行丰富。

### 1.2 目标形态示意

```
┌─────────────────────────────────────────────────────────────────┐
│  本地前端（Electron / Tauri 或 单页）                             │
├──────────────────────────────┬──────────────────────────────────┤
│  像素办公室（Phaser 画布）     │  对话窗口                         │
│  - 场景、家具、区域            │  - 消息列表                       │
│  - 主角色 + 多 Agent 角色      │  - 输入框                         │
│  - 状态→区域、气泡、昨日小记   │  - 流式输出                       │
│  - 数据来自 Gateway WS        │  - 协议：Gateway WebSocket        │
└──────────────────────────────┴──────────────────────────────────┘
         ▲                                    ▲
         │  office.status / agents.list       │  chat / session.*
         │  （轮询或推送）                     │  （请求-响应 + stream）
         └────────────────┬───────────────────┘
                          │  WebSocket (单一连接)
                          ▼
                 ┌─────────────────┐
                 │  Rzeclaw Gateway │
                 └─────────────────┘
```

---

## 二、Star-Office-UI 架构摘要

### 2.1 后端（Flask）

- **职责**：提供 HTTP API，读写本地 JSON 状态文件，管理 Join Key 与访客列表。
- **主要端点**：
  - `GET /status`：主 Agent 状态 `{ state, detail }`，状态枚举：`idle` | `writing` | `researching` | `executing` | `syncing` | `error`。
  - `POST /set_state`：设置主 Agent 状态（Body: `{ state, detail }`）。
  - `GET /agents`：多 Agent 列表，每项含 `agentId`、`name`、`state`、`detail`、`area`、`authStatus`、`isMain` 等。
  - `POST /join-agent`、`POST /agent-push`、`POST /leave-agent`：访客加入/推送状态/离开。
  - `GET /yesterday-memo`：从 `memory/*.md` 读取昨日小记并脱敏返回。
- **状态与区域映射**（见 SKILL/README）：
  - `idle` → 休息区（沙发）
  - `writing` / `researching` / `executing` / `syncing` → 工作区（办公桌）
  - `error` → Bug 区

### 2.2 前端（静态 + Phaser）

- **技术栈**：纯 HTML/CSS/JS，游戏引擎 **Phaser**，画布 1280×720；资源以 PNG/WebP 精灵图为主。
- **核心文件**：
  - `layout.js`：统一管理画布尺寸、区域坐标（areas）、家具坐标与 depth、资源扩展名规则、总资源数。
  - `game.js`：Phaser 场景（preload/create/update）、状态机、**轮询** `fetch('/status')` 与 `fetch('/agents')`，根据 state 切换角色位置与动画（沙发/办公桌/错误区/同步动画），气泡与打字机状态文案。
  - `index.html`：内联样式与 DOM结构（#game-container、#control-bar、#memo-panel、#guest-agent-panel、#asset-drawer 等），以及 I18N、控制栏按钮（待命/工作/同步/报警/装修房间）。
- **角色与多 Agent**：
  - 主角色「Star」：根据主 Agent 的 state 在 idle（沙发）/ working（办公桌）/ error（Bug 区）/ syncing（同步动画）间切换显示。
  - 多 Agent：通过 `GET /agents` 拿到列表，按 `area` 在 `AREA_POSITIONS` 中分配槽位，用容器（⭐ + 名字标签 + 状态点）渲染在画布上。
- **其他能力**：昨日小记面板、中英日三语、资产侧边栏（装修、Gemini 生图）、访客列表、移动端适配、桌面宠物版（Electron 壳）。

---

## 三、Rzeclaw 当前实现摘要

### 3.1 Gateway（WebSocket + JSON-RPC）

- **协议**：单一 WebSocket，消息格式 `{ id, method, params }`，响应 `{ id, result }` 或 `{ id, error }`，流式 `{ id, stream: "text", chunk }`。
- **已有方法**（与前端相关）：`health`、`session.getOrCreate`、`session.restore`、`session.saveSnapshot`、`session.list`、`chat`（含流式）、`task.getResult`、`task.listBySession`、`canvas.get`/`canvas.update`、`tools.list`/`tools.call`、`swarm.getTeams`、`knowledge.ingest`、`diagnostic.report`、`evolution.confirm`/`evolution.apply`、`rag.reindex`、`flows.scanFailureReplacement`、`retrospective.*`、`config.reload` 等。
- **无**：HTTP 服务、`GET /status`、`GET /agents`、任何「办公室状态」或「Agent 列表」的只读接口。

### 3.2 Agent 模型（Phase 14B）

- **蓝图**（`AgentBlueprint`）：`id`、`name`（显示名）、`systemPrompt`、`boundFlowIds`、`localMemory`、`llm`、`toolsFilter`。
- **实例**（`AgentInstance`）：`instanceId`、`blueprintId`、`state`（`idle` | `executing` | `waiting` | `done`）、`blackboard`、`sessionId`、`createdAt`、`lastActiveAt`。
- **状态更新**：由 `chat-executor` 在 flow/agent 执行前后调用 `setInstanceState(instance, "executing"|"idle"|"waiting")`；无对外暴露的「当前所有实例列表」接口。

### 3.3 终端/前端规划（Phase 7）

- **TERMINAL_CHANNEL_DESIGN.md**：自制终端通过 WebSocket 连接 Gateway，Tauri/Electron 建议，聊天式 UI；未实现。
- **当前**：无内置前端；无「办公室看板」或「角色场景」实现。

---

## 四、可对齐内容（直接套用或小改）

以下可直接从 Star-Office-UI 套用或在 Rzeclaw 前端中复用/小改即可。

### 4.1 场景与布局

- **layout.js 体系**：画布 1280×720，`areas`（door、writing、researching、error、breakroom）、`furniture`（sofa、desk、flower、starWorking、plants、poster、coffeeMachine、serverroom、errorBug、syncAnim、cat）、`plaque`、depth 与 origin。**可直接拷贝并保留**，作为「单源真相」避免 magic number。
- **区域→状态语义**：idle → breakroom；writing/researching/executing/syncing → 工作区；error → error。Rzeclaw 侧仅需做**状态枚举映射**（见下）。

### 4.2 角色与精灵

- **主角色**：Star 的 idle（沙发）、working（办公桌）、error（Bug 区）、syncing（同步动画）的精灵与动画 key（star_idle、star_working、sofa_busy、error_bug、sync_anim）**可直接沿用**。
- **多角色槽位**：`AREA_POSITIONS`（breakroom/writing/error 的多个坐标）与按 area 分配 `_slotIndex` 的逻辑**可直接沿用**，用于在 Rzeclaw 中展示多 Agent 实例。
- **访客/多 Agent 表现**：Star-Office-UI 用「⭐ + 名字标签 + 状态点」的 Phaser 容器；Rzeclaw 可复用该渲染方式，数据源改为 Gateway 的 `agents.list`（见下）。

### 4.3 状态与动画逻辑

- **STATE → 区域/显示**：  
  - Rzeclaw 实例状态 `idle` → 办公室状态 `idle` → breakroom。  
  - `executing` → `writing` 或 `executing`（均映射到工作区）。  
  - `waiting` → 可映射为 `syncing`（工作区 + 同步动画）。  
  - `done` → `idle`。  
- **服务器/错误 Bug/同步动画**的显示条件（根据当前主状态切换 serverroom 动画、errorBug 可见性、syncAnim）**可直接沿用** game.js 中的 `update()` 与 `fetchStatus()` 分支逻辑，仅把「当前状态」改为来自 Gateway 的 `office.status` 或等价数据。

### 4.4 气泡与文案

- **BUBBLE_TEXTS**、打字机式状态栏（status-text）、定时气泡（showBubble/showCatBubble）可保留；文案可按需改为与 Rzeclaw 场景一致或继续用现有中文/多语。

### 4.5 昨日小记

- **概念与面板**：从「最近一天工作记录」展示为「昨日小记」可保留。数据来源改为：Rzeclaw 的 session 摘要或 memory 流水产出（需 Gateway 提供只读接口，见下）。

### 4.6 多语与 UI 风格

- 中英日切换、ArkPixel 字体、控制栏/面板的像素风样式可保留；控制栏按钮中「手动切状态」在本地前端可改为**调试用**或隐藏（因状态由后端驱动）。

---

## 五、需额外开发/制作的内容

### 5.1 Gateway 侧（必须）

以下为 Gateway 需新增的 WebSocket 方法（与现有 `method` + `params` 格式一致）。

- **agents.list**（或等价名）：  
  - 返回当前所有 Agent 实例的只读列表，供前端渲染多角色。  
  - 建议结构：`{ agents: [ { agentId, blueprintId, name, state, detail?, sessionId?, lastActiveAt? } ] }`。  
  - `name` 来自蓝图 `AgentBlueprint.name`，`state` 为实例的 `idle`|`executing`|`waiting`|`done`，前端再映射到办公室 `area`（见上）。  
  - 实现：在 Gateway 的 WebSocket 消息处理中新增 method（如 `agents.list`），从 `instances` 模块（或等价）读取并返回；若暂无公开 API，需在 `agents/instances.ts` 增加 `listInstances()` 并供 Gateway 调用。

- **office.status**（或等价）：  
  - 返回「主 Agent / 当前会话」的办公室状态，用于驱动主角色位置与动画。  
  - 建议结构：`{ state, detail? }`，`state` 为 Star-Office 六态之一（idle/writing/researching/executing/syncing/error）。  
  - 实现方式二选一或并存：  
    - **简单版**：无长期运行任务时返回 `idle`；当某次 `chat` 进行中（同一连接上存在未完成的 chat）为 `executing`；若上次 chat 返回 error 可置为 `error` 一段时间。  
    - **与 session/task 绑定**：根据当前 session 的「最近一次任务」状态或 `task.listBySession` 中 running 的条目推导 state。  
  - 前端可轮询该 method（替代原 `fetch('/status')`）。

- **memory.yesterdaySummary**（可选）：  
  - 若保留「昨日小记」面板，需数据来源。可从现有 memory 流水（如 L1/L2、session summary 文件）聚合「昨日」摘要并脱敏，通过新 method 返回；若暂不实现，前端可隐藏该面板或显示占位。

### 5.2 前端侧（必须）

- **对话窗口**：  
  - 在同一个客户端内增加对话 UI：消息列表、输入框、发送。  
  - 连接 Rzeclaw Gateway WebSocket，发送 `chat` 请求（含 `message`、`sessionId` 等），处理 `result.content` 与 `stream: "text"` chunk，支持流式展示。  
  - 与现有 Phase 7 终端设计一致，只是此处与像素办公室并排布局。

- **数据绑定**：  
  - 用 Gateway 的 `agents.list` 替代 `fetch('/agents')`，用 `office.status` 替代 `fetch('/status')`；轮询间隔可沿用 2s/2.5s 或略长以减少负载。  
  - 状态映射层：Rzeclaw 实例 state → 办公室 state → area/动画（见上）。

- **客户端形态**：  
  - 推荐：**Electron 或 Tauri** 桌面应用，内嵌「像素办公室画布 + 对话面板」；或单页 Web 打包进同一 HTML，通过配置连接 `ws://127.0.0.1:18789`（或可配置地址）。  
  - 认证：若 Gateway 开启 `gateway.auth`，对话请求需带 `params.apiKey`；前端需支持配置或输入 API Key。

### 5.3 可选增强

- **蓝图与角色外观**：在 `AgentBlueprint` 中增加可选字段（如 `avatarKey`、`spriteSet`），前端根据该字段选择不同精灵集（如沿用 guest_anim_1..6 / guest_role_1..6），实现「不同 Agent 不同立绘」的丰富化。
- **错误状态**：若 runAgentLoop 或 executeFlow 抛错，在响应中带 error 标志，前端可将主状态置为 `error` 并显示 error 区动画，若干秒后自动回 idle（或由 office.status 逻辑统一处理）。

---

## 六、保留与移除建议

### 6.1 保留

- 像素办公室**场景、布局、精灵、动画、区域与状态映射、多角色槽位与渲染、气泡与状态栏、小猫/植物等装饰**：全部保留，作为「办公室 + 角色」的表现层。
- **多语（中/英/日）**、**移动端适配**（若客户端支持响应式）：保留。
- **昨日小记面板**：保留概念与 UI，数据源改为 Gateway（见上）；若暂无接口可先占位或隐藏。
- **控制栏中的「装修房间」入口**：可保留为可选功能；若不做资产/生图，可隐藏或仅保留「打开侧边栏」占位。

### 6.2 移除或替换

- **Star-Office-UI 的 Flask 后端**：不部署；所有数据来自 Rzeclaw Gateway WebSocket，不再请求 `/status`、`/set_state`、`/agents`、`/yesterday-memo` 等 HTTP。
- **POST /set_state 的主动调用**：前端不再通过 HTTP 设置状态；状态由后端（chat 执行、agents 实例状态）驱动。可保留「手动切状态」为**调试模式**（即前端发一条仅用于测试的 Gateway 扩展 method，或临时 mock office.status）。
- **Join Key / 访客加入/离开（join-agent、agent-push、leave-agent）**：  
  - 若本地前端只展示「本机 Rzeclaw 的 Agent 实例」，可**移除**访客加入与 push 脚本逻辑；`agents.list` 只返回本进程的实例。  
  - 若未来要支持「其他机器上的 Agent 作为访客出现在办公室」，再在 Rzeclaw 侧设计「跨机 Agent 注册/心跳」与 `agents.list` 的合并结果。
- **独立 invite/join 页面**：若无访客加入需求，可移除或仅保留为占位链接。

### 6.3 可选保留（降级或延后）

- **资产侧边栏（装修、上传、Gemini 生图）**：与核心「办公室 + 对话」无关，可延后或仅保留「切换预设主题」等简单能力；生图依赖外部 API，本地前端可不做。
- **桌面宠物版**：Star-Office-UI 的 Electron 透明窗口形态可作为后续增强，与「内嵌对话窗口」不冲突。

---

## 七、状态映射（Rzeclaw → Star-Office-UI）

| Rzeclaw 实例 state | 办公室 state | 区域 (area) | 前端表现 |
|--------------------|-------------|-------------|----------|
| idle               | idle        | breakroom   | 沙发、star 隐藏/沙发动画 |
| executing          | writing     | writing     | 办公桌、star_working |
| waiting            | syncing     | writing     | 同步动画、办公桌区 |
| done               | idle        | breakroom   | 同 idle |

- **主角色**：若仅有一个「主」会话或主 Agent，其状态由 `office.status` 提供（可能由 Gateway 根据当前 chat 是否进行中、是否刚报错推导）。  
- **多 Agent**：每个实例的 `state` 按上表映射到 `area`，前端用现有 `AREA_POSITIONS` 与 `renderAgent()` 逻辑放置角色。  
- **error**：仅当 Gateway 能表达「最近一次失败」时（如 `office.status` 返回 `state: "error"`），前端显示 error 区与 errorBug 动画；否则可暂不实现 error 态。

---

## 八、多智能体放置表现与完整生命周期（客户端）

与 Star-Office-UI 的「主角色 + 少量访客」不同，Rzeclaw 侧**同一蓝图可有多实例、且蓝图/实例数量可能较多**，需在客户端体现**完整生命周期**与**可扩展的放置表现**。

### 8.1 生命周期阶段（后端 → 客户端对应）

| 阶段 | 后端机制 | 客户端体现 |
|------|----------|------------|
| **蓝图存在** | `config.agents.blueprints` 配置；无运行时「创建蓝图」 | 可选：通过 `agents.blueprints` 只读列表展示「可用的智能体类型」，用于说明或筛选 |
| **实例创建** | `getOrCreateInstance` 在路由命中时复用 idle/done 或 `createInstance` 新建 | `agents.list` 中**新出现**的 `instanceId` → 视为「新入职」：入场动画、短暂「新」角标或高亮 |
| **状态变更** | `setInstanceState(instance, executing|idle|waiting|done)` | 同一 instanceId 的 `state` 变化 → 角色移动/换区、更新状态点与气泡文案 |
| **实例回收** | `recycleStaleInstances` 移除超时 idle/done（默认 30 分钟） | `agents.list` 中**消失**的 instanceId → 视为「下班/回收」：淡出或移出画布，可选短暂提示 |

客户端**不主动创建或销毁**实例；仅根据 `agents.list` 的**前后快照差**推断「新增」与「离开」，并驱动入场/离场与状态更新动画。

### 8.2 多智能体放置策略（数量可能很多）

- **槽位扩展**：Star-Office-UI 每区约 8 个固定槽位（`AREA_POSITIONS`）。当实例数超过单区槽位时：
  - **方案 A**：按 area 扩展槽位数组（如 breakroom/writing/error 各 16 或 24 个坐标），超出部分循环复用坐标或微调偏移，避免重叠。
  - **方案 B**：引入「次要区域」或「 overflow 区」（如办公室一角、走廊），将多出的实例放到该区，仍按 state 映射到 area，同一 area 内按 slotIndex 取坐标。
  - **方案 C**：同一 area 内使用**网格/行列**生成坐标（如 4×4、5×5），动态计算位置，避免写死槽位数量。
- **主角色与「当前会话接管者」**：若存在「主」或「当前响应的 Agent」，可将其单独标为 `isMain: true`，在画布上使用主角色精灵或固定醒目位置；其余为「同事」用统一的小人/图标 + 名字标签。
- **去重与稳定性**：列表以 `instanceId` 为唯一键；同一 instanceId 仅对应一个角色精灵，避免因轮询顺序导致闪烁。位置分配建议按 `(blueprintId, instanceId)` 或稳定排序（如 createdAt）计算 `_slotIndex`，保证同一实例在同一次轮询内槽位不变。

### 8.3 「智能体创建」在客户端的体现

- Rzeclaw **没有**「用户在 UI 里点击创建智能体」的流程；实例是**路由命中时由后端按需创建或复用**的。
- 客户端可体现的「创建」含义：
  1. **首次出现**：某次 `agents.list` 返回中出现了新的 `instanceId`（相对上一帧或上一轮询），视为该实例「刚被创建/刚入职」，触发入场表现（见上）。
  2. **可选：蓝图列表**：若 Gateway 提供 `agents.blueprints`（只读），可展示「已配置的智能体类型」；用户发出一条消息后，若路由到某蓝图且新建了实例，该实例在列表中首次出现，与 1 一致。
  3. **对话驱动**：用户在当前会话发消息 → 后端路由到某 Agent → 若该 Agent 新建实例，下一次 `agents.list` 即多一条；前端展示新角色入场，形成「发话 → 对应智能体出现并工作」的连贯体验。

因此「创建流程」在客户端 = **轮询 agents.list + 差量检测 + 入场/离场与状态更新**，无需单独「创建」按钮；可选增加「智能体图鉴」（蓝图列表）说明当前有哪些类型。

### 8.4 生命周期事件与前端逻辑小结

- **差量计算**：每次收到 `agents.list` 后，与上一帧的 `Set<instanceId>` 比较：新增 = 入场，消失 = 离场，保留 = 仅更新 state/位置。
- **入场**：新 instanceId 分配 area（由 state 映射）与 slotIndex，播放入场动画或短时「新」标记，然后进入常规状态展示。
- **离场**：消失的 instanceId 对应精灵淡出或移出画布，可选 toast「xxx 已下班」。
- **状态更新**：同一 instanceId 的 state 变化时，仅更新目标 area、槽位内位置、状态点与气泡，无需重新「创建」精灵。

---

## 九、实施顺序建议（概要）

1. **Gateway**  
   - 实现 `agents.list`（从 instances 读列表，返回 blueprint 的 name + 实例 state）。  
   - 实现 `office.status`（简单版：idle / 执行中由当前连接上是否有进行中的 chat 决定；可选带 detail 文案）。

2. **前端骨架**  
   - 新建前端工程（或子目录），引入 Phaser，拷贝并精简 Star-Office-UI 的 `layout.js`、`game.js`（去掉对 `/status`、`/agents` 的 fetch，改为通过 WebSocket 调用 `office.status`、`agents.list`）。  
   - 实现单一 WebSocket 连接与 JSON-RPC 封装（send method + 按 id 匹配 result/error，处理 stream chunk）。

3. **对话窗口**  
   - 在页面中增加对话区域；连接同一 WebSocket，实现 `chat` 调用与流式展示。  
   - 可选：在收到 chat 开始时把主状态设为 executing，结束时设为 idle（或交给 office.status 统一返回）。

4. **角色与状态绑定**  
   - 将 `agents.list` 返回的列表映射到 area，用现有 `renderAgent()` 逻辑渲染；  
   - 将 `office.status` 驱动主角色（Star）的 state/area/动画。

5. **昨日小记**  
   - 若实现 `memory.yesterdaySummary`，前端请求并填充 memo 面板；否则占位或隐藏。

6. **清理与可选**  
   - 移除或隐藏 Flask 相关、join/leave、set_state 的 UI；  
   - 保留多语与样式；按需保留/隐藏装修与生图入口。

7. **多智能体与生命周期**（见 §八）  
   - 差量检测入场/离场；扩展槽位或动态网格；可选 `agents.blueprints` 与「图鉴」；主角色与 isMain 区分。

详细实施计划与工单见 **PHASE15_OFFICE_FRONTEND_WORK_ORDERS.md**。

---

## 十、小结

- **可对齐**：Star-Office-UI 的**场景、布局、角色、区域、动画、多 Agent 槽位与渲染、气泡与多语**可直接套用，仅需将数据源从 Flask HTTP 改为 Gateway WebSocket（`office.status`、`agents.list`）。  
- **需开发**：Gateway 新增 `agents.list` 与 `office.status`；前端新增**对话窗口**与 WebSocket 绑定、Rzeclaw 状态映射、**多智能体放置与完整生命周期**（差量入场/离场、可扩展槽位、可选蓝图列表）。  
- **保留**：像素办公室全部表现层、多语、昨日小记概念与面板、可选装修入口。  
- **移除/替换**：Flask 后端、HTTP 轮询、手动 set_state（或仅作调试）、若不做访客则 join/leave/push。  
- **本地前端形态**：桌面或单页客户端，**像素办公室（Phaser）+ 内嵌对话窗口**，单一 WebSocket 连接 Rzeclaw Gateway；**智能体创建**在客户端体现为「列表中新出现的实例 = 入场」，回收体现为「列表中消失 = 离场」。

以上设计保证逻辑一致、与现有 Phase 7 终端设计兼容，并可直接指导实现与排期。

---

## 附录：Gateway 扩展接口规范（供实现对照）

| method          | params | 返回 (result) | 说明 |
|-----------------|--------|----------------|------|
| `agents.list`   | 无或 `{}` | `{ agents: Array<{ instanceId, agentId, blueprintId, name, state, detail?, sessionId?, lastActiveAt?, createdAt?, isMain? }> }` | 当前所有 Agent 实例；agentId 建议与 instanceId 一致或取 instanceId 供前端唯一键；isMain 表示当前会话接管者 |
| `agents.blueprints` | 无或 `{}` | `{ blueprints: Array<{ id, name? }> }` | 只读蓝图列表，用于前端「图鉴」或说明（可选实现） |
| `office.status` | 无或 `{}` | `{ state: string, detail?: string }` | 主/当前办公室状态：idle \| writing \| researching \| executing \| syncing \| error |
| `memory.yesterdaySummary` | 可选 `{ workspace? }` | `{ success: boolean, date?: string, memo?: string }` | 昨日小记（可选实现） |

- 调用方式与现有方法一致：`{ id, method: "agents.list", params: {} }` → `{ id, result: { agents: [...] } }`。
- 错误时返回 `{ id, error: { message: string } }`。
