# Phase 15：办公室前端与多智能体表现 — 实施计划与工单

本文档为 **Phase 15** 的实施计划与工单拆解，面向「像素办公室 + 内嵌对话窗口」本地前端，并覆盖**多智能体放置表现**与**智能体完整生命周期**在客户端的体现。设计依据：`FRONTEND_OFFICE_UI_ALIGNMENT_DESIGN.md`（含 §八 多智能体与生命周期）、`MULTI_AGENT_ENTITY_DESIGN.md`。

---

## 一、目标与范围

### 1.1 目标

| 目标 | 说明 |
|------|------|
| **办公室前端** | 本地客户端（Electron/Tauri 或单页）内嵌像素办公室画布（Phaser）+ 对话窗口，通过单一 WebSocket 连接 Rzeclaw Gateway。 |
| **数据对接** | 用 Gateway 新方法 `agents.list`、`office.status` 驱动角色与状态，替代 Star-Office-UI 的 Flask HTTP。 |
| **多智能体表现** | 支持「多个」Agent 实例同时在场：可扩展槽位或动态网格、按 state→area 放置、主角色与同事区分（isMain）。 |
| **完整生命周期** | 实例**新出现**（列表差量）→ 入场表现；**消失**（回收）→ 离场表现；**状态变更** → 换区/更新状态点与气泡。 |
| **创建流程在客户端体现** | 无单独「创建」按钮；用户发话 → 路由到某 Agent → 若新建实例，下次 `agents.list` 多一条 → 前端展示新角色入场。 |

### 1.2 范围边界

| 在范围内 | 在范围外 |
|----------|----------|
| Gateway 新增 `agents.list`、`office.status`，可选 `agents.blueprints` | 不改动 Router/chat-executor 的现有路由与执行逻辑 |
| 前端：办公室画布、对话窗口、WS 封装、多 Agent 渲染与生命周期差量 | Star-Office-UI 的 Flask 后端、join/leave 访客协议 |
| 实例列表的只读暴露与回收策略沿用现有（instances 模块） | 用户在 UI 内「创建/删除蓝图」等配置编辑（后续 Phase 可选） |

### 1.3 依赖

- **设计文档**：`FRONTEND_OFFICE_UI_ALIGNMENT_DESIGN.md`、`MULTI_AGENT_ENTITY_DESIGN.md`。
- **现有实现**：Gateway WebSocket 与 JSON-RPC、`agents/instances`（createInstance、getOrCreateInstance、setInstanceState、recycleStaleInstances）、`agents/blueprints`（getAgentBlueprint、hasAgentsEnabled）。
- **参考前端**：Star-Office-UI 的 layout.js、game.js、index.html（场景/区域/精灵/AREA_POSITIONS）。

---

## 二、实施计划（阶段划分）

| 阶段 | 名称 | 产出 | 依赖 |
|------|------|------|------|
| **15A** | Gateway 办公室与 Agent 只读接口 | `agents.list`、`office.status` 可用；可选 `agents.blueprints` | 无 |
| **15B** | 前端骨架与 WebSocket 对接 | 前端工程、Phaser 画布、WS 封装、轮询 agents.list/office.status | 15A |
| **15C** | 对话窗口与 chat 流式 | 消息列表、输入框、chat 请求与 stream 展示 | 15B |
| **15D** | 多智能体放置与生命周期 | 差量入场/离场、可扩展槽位或动态网格、isMain 主角色、状态映射 | 15B、15C |
| **15E** | 可选增强与收尾 | 昨日小记、蓝图图鉴、多语与样式清理、文档与验收 | 15D |

建议实现顺序：**15A → 15B → 15C → 15D → 15E**；15C 与 15D 可部分并行（先完成列表渲染再补生命周期动画）。

---

## 三、工单列表

### 15A：Gateway 办公室与 Agent 只读接口

| 工单 ID | 标题 | 说明 | 验收标准 |
|---------|------|------|----------|
| **WO-OF-001** | agents 模块暴露 listAllInstances | 在 `src/agents/instances.ts` 中新增 `listAllInstances(config): AgentInstance[]`（或返回扁平列表），遍历 instancesByBlueprint 汇总所有实例；不改变现有 create/getOrCreate/setState/recycle 逻辑 | 调用 listAllInstances 返回当前所有实例，含 instanceId、blueprintId、state、sessionId、createdAt、lastActiveAt |
| **WO-OF-002** | Gateway 方法 agents.list | 在 Gateway 消息处理中新增 method `agents.list`；调用 listAllInstances，再根据 blueprintId 查蓝图取 name；返回 `{ agents: Array<{ instanceId, blueprintId, name, state, detail?, sessionId?, lastActiveAt?, createdAt?, isMain? }> }`；isMain 可由「当前会话最近一次响应的 sourceAgentId/instanceId」或配置默认主蓝图决定，暂无可全为 false | 前端调用 agents.list 得到与设计附录一致的 result 结构 |
| **WO-OF-003** | Gateway 方法 office.status | 新增 method `office.status`；返回 `{ state, detail? }`；state 为 idle \| writing \| researching \| executing \| syncing \| error；简单实现：若本连接无进行中 chat 则 idle，有则 executing；detail 可选从当前任务或会话 goal 截断 | 前端轮询 office.status 能拿到 state，发 chat 期间为 executing |
| **WO-OF-004** | （可选）Gateway 方法 agents.blueprints | 新增 method `agents.blueprints`；从 config.agents.blueprints 只读返回 `{ blueprints: Array<{ id, name? }> }` | 前端可展示「已配置的智能体类型」 |

---

### 15B：前端骨架与 WebSocket 对接

| 工单 ID | 标题 | 说明 | 验收标准 |
|---------|------|------|----------|
| **WO-OF-010** | 前端工程初始化 | 新建前端子目录（如 `frontend-office/` 或 `packages/office-ui/`）；引入 Phaser；可选的构建与脚本（Vite/Webpack 或纯静态） | 能本地打开页面并渲染空白 Phaser 画布 |
| **WO-OF-011** | 拷贝并精简 layout.js / game 场景骨架 | 从 Star-Office-UI 拷贝 layout.js（areas、furniture、AREA_POSITIONS 等）；拷贝 game.js 的 preload/create 中与场景、家具、主角色相关的部分；**去掉**对 `fetch('/status')`、`fetch('/agents')` 的调用 | 画布上出现办公室背景、家具、主角色（可先写死 idle） |
| **WO-OF-012** | WebSocket 与 JSON-RPC 封装 | 实现连接 Rzeclaw Gateway（ws 地址可配置）；封装 request(method, params) → Promise<result>，按 id 匹配响应；支持 stream chunk 回调（如 onStream(id, chunk)） | 能调用 health、session.getOrCreate 并得到正确 result |
| **WO-OF-013** | 轮询 office.status 与 agents.list | 在 game update 或 setInterval 中轮询 office.status、agents.list（间隔建议 2–2.5s）；将返回的 state 与 agents 数组存到前端状态；主角色根据 office.status.state 切换区域/动画 | 主角色随 office.status 变化；画布上能根据 agents.list 显示多个角色（可用占位图标） |

---

### 15C：对话窗口与 chat 流式

| 工单 ID | 标题 | 说明 | 验收标准 |
|---------|------|------|----------|
| **WO-OF-020** | 对话区域 DOM 与样式 | 在页面中增加对话面板（消息列表容器 + 输入框 + 发送按钮）；样式与像素风或现有设计一致；可折叠或固定一侧 | 布局上办公室画布与对话区域并排或上下分布 |
| **WO-OF-021** | chat 请求与结果展示 | 输入框回车或点击发送时，通过 WS 发送 chat 方法（message、sessionId 等）；将 result.content 追加到消息列表；错误时展示 error.message | 能发一条消息并看到助手回复（非流式即可） |
| **WO-OF-022** | 流式输出与 session 维护 | 处理响应中的 stream chunk（同一 id）；边收边追加到当前助手消息；chat 完成后可选调用 session.saveSnapshot 或仅依赖已有逻辑 | 长回复以流式逐字/逐段显示 |

---

### 15D：多智能体放置与生命周期

| 工单 ID | 标题 | 说明 | 验收标准 |
|---------|------|------|----------|
| **WO-OF-030** | 实例唯一键与 state→area 映射 | 前端以 instanceId 为唯一键；将 state（idle/executing/waiting/done）映射到办公室 area（breakroom/writing/error）；与设计 §七 映射表一致 | 每个实例根据 state 落在正确区域 |
| **WO-OF-031** | 可扩展槽位或动态网格 | 当某 area 实例数超过当前 AREA_POSITIONS 长度时，扩展槽位（方案 A/B/C 之一）：更多预定义坐标、或 overflow 区、或按行列生成坐标；保证同一 area 内 slotIndex 稳定（如按 blueprintId+instanceId 排序） | 超过 8 个实例时仍能合理排布、不重叠 |
| **WO-OF-032** | 差量检测：入场与离场 | 每次 agents.list 返回后，与上一帧 instanceId 集合比较；新增 → 入场（新建精灵/容器，可选短动画或「新」角标）；消失 → 离场（淡出或移除精灵，可选 toast） | 新实例出现时可见入场；回收后从画布消失 |
| **WO-OF-033** | 状态更新与 isMain 主角色 | 同一 instanceId 的 state 变化时，仅更新目标 area、槽位、状态点与气泡，不重建精灵；若某条 agent 的 isMain 为 true，用主角色精灵或固定醒目位置，其余用统一小人/图标+名字 | 状态切换时角色移动/换区；主角色与同事视觉区分 |
| **WO-OF-034** | 创建流程在客户端的连贯体验 | 用户发话 → chat 请求 → 若后端路由到某 Agent 并新建实例，下一次 agents.list 多一条 → 前端差量判定为新实例 → 入场表现；无需「创建」按钮 | 发一条触发某 Agent 的消息后，画布上出现对应新角色 |

---

### 15E：可选增强与收尾

| 工单 ID | 标题 | 说明 | 验收标准 |
|---------|------|------|----------|
| **WO-OF-040** | （可选）昨日小记 | 若 Gateway 实现 memory.yesterdaySummary，前端请求并填充 memo 面板；否则占位或隐藏该面板 | 有接口则显示昨日小记；无则隐藏或占位 |
| **WO-OF-041** | （可选）蓝图图鉴 | 若实现 agents.blueprints，增加「智能体图鉴」或侧栏列表，展示已配置的 id/name；仅展示不编辑 | 用户能看见当前有哪些智能体类型 |
| **WO-OF-042** | 多语与样式清理 | 保留中英日切换与 ArkPixel 等样式；移除或隐藏 Flask/join/set_state 相关 UI；控制栏仅保留与 Rzeclaw 相关的入口 | 无对外部 HTTP 的依赖；界面简洁一致 |
| **WO-OF-043** | 文档与验收 | 更新 README 或 docs 说明如何启动前端、配置 Gateway 地址与可选 apiKey；完成 Phase 15 端到端验收清单（连接→发话→多 Agent 入场/离场/状态更新） | 文档可复现；验收清单全部通过 |

---

## 四、工单依赖关系（建议实现顺序）

```
WO-OF-001 → WO-OF-002
WO-OF-002、WO-OF-003、WO-OF-004(可选) 完成后进入 15B

WO-OF-010 → WO-OF-011 → WO-OF-012 → WO-OF-013

WO-OF-013 完成后 → WO-OF-020 → WO-OF-021 → WO-OF-022

WO-OF-013、WO-OF-021 完成后 → WO-OF-030 → WO-OF-031 → WO-OF-032 → WO-OF-033 → WO-OF-034

WO-OF-034 完成后 → WO-OF-040～043（可选与收尾）
```

---

## 五、验收清单（Phase 15 完成时）

- [ ] Gateway：`agents.list`、`office.status` 返回格式与设计附录一致；无多 Agent 时 agents 为空数组仍正常。
- [ ] 前端：单一 WebSocket 连接；办公室画布展示场景与主角色；主角色随 office.status 变化。
- [ ] 前端：对话窗口可发消息、收完整回复与流式输出。
- [ ] 前端：agents.list 中多个实例按 state→area 正确放置；超过单区槽位时扩展或网格无重叠。
- [ ] 前端：新实例出现时有入场表现；实例从列表消失时有离场表现；状态变更时角色换区/更新。
- [ ] 前端：用户发话触发某 Agent 后，新实例在下一轮 agents.list 中出现并在画布入场。
- [ ] 可选：昨日小记、蓝图图鉴、多语与样式符合设计；文档可复现。

---

*Phase 15 工单编号前缀：WO-OF（Office Frontend）。与 FRONTEND_OFFICE_UI_ALIGNMENT_DESIGN.md §八、§九 一致。*

---

## 六、实施状态（已完工单）

| 工单 | 状态 | 说明 |
|------|------|------|
| WO-OF-001 | 已完成 | `src/agents/instances.ts` 新增 `listAllInstances(config)` |
| WO-OF-002 | 已完成 | Gateway 新增 `agents.list`，返回 agents 数组（instanceId、blueprintId、name、state 等） |
| WO-OF-003 | 已完成 | Gateway 新增 `office.status`，按本连接 chat 是否进行中返回 state（idle/executing） |
| WO-OF-004 | 已完成 | Gateway 新增 `agents.blueprints`，只读返回蓝图 id/name |
| WO-OF-010 | 已完成 | `frontend-office/` 目录，index.html + Phaser 画布 |
| WO-OF-011 | 已完成 | layout.js（LAYOUT、AREA_POSITIONS、STATE_TO_AREA）+ game.js 场景骨架 |
| WO-OF-012 | 已完成 | gateway.js：connect、request(method, params)、setOnStream(id, chunk) |
| WO-OF-013 | 已完成 | game.js 轮询 office.status、agents.list；主角色随 state 移动；多 Agent 按 area 槽位渲染 |
| WO-OF-020～022 | 已完成 | 对话面板 DOM、发送 chat、流式追加、状态栏；见 index.html 与 gateway.js |
| WO-OF-030 | 已完成 | instanceId 唯一键、STATE_TO_AREA 映射（layout.js + game.js） |
| WO-OF-031 | 已完成 | layout.js 中 getAreaPosition(area, slotIndex)，超出预定义槽位时按网格生成坐标；agents 按 (area, blueprintId, instanceId) 排序保证 slot 稳定 |
| WO-OF-032 | 已完成 | 差量 previousAgentIds/addedIds/removedIds；入场淡入 + toast「xxx 入职」；离场淡出 + toast「xxx 已下班」 |
| WO-OF-033 | 已完成 | isMain 时位置固定 MAIN_POSITION、depth 1300、scale 1.2、金色标签；非 isMain 按槽位；状态变更仅更新位置与标签 |
| WO-OF-034 | 已完成 | 新实例入场时显示「新」角标 3s + toast；发话→新实例出现在 agents.list→差量判定入场 |
| WO-OF-040 | 已完成 | 昨日小记面板占位；请求 memory.yesterdaySummary（未实现则保持「暂无」）；连接成功后 fetchMemo() |
| WO-OF-041 | 已完成 | 「智能体图鉴」按钮，点击请求 agents.blueprints 并展示 id/name 列表 |
| WO-OF-042 | 已完成 | 中/英/日多语（i18n.js + 语言栏 CN/EN/JP）；状态栏/小记/按钮/占位符/toast/画布标题与主状态标签随语言切换；无 Flask/join/set_state 依赖 |
| WO-OF-043 | 已完成 | frontend-office/README.md 更新使用说明与 Phase 15 验收清单；工单文档实施状态已更新 |
