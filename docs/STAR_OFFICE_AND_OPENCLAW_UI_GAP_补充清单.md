# 达到 Star Office UI + OpenClaw 交互体验 — 补充清单

当前界面（Rzeclaw Terminal / 办公室前端）已具备：连接状态、会话选择、消息区、输入框、右侧画布/目标/步骤/主动提议/Heartbeat/工具列表。**尚未接入大模型、无像素办公室美术资源**。本文档列出要达到 **Star Office UI** 与 **OpenClaw** 目标体验所需补充项，按优先级与依赖排序。

---

## 一、目标参照简述

| 参照 | 含义 |
|------|------|
| **Star Office UI** | [Star-Office-UI](https://github.com/ringhyacinth/Star-Office-UI) 的「像素办公室」：Phaser 画布 + 场景/家具/主角色与多 Agent 精灵、状态→区域/动画、气泡与昨日小记。数据源为 Gateway WebSocket（`office.status`、`agents.list`），非 Flask HTTP。 |
| **OpenClaw** | OpenClaw Control UI / ClawUI：聊天式主界面（会话列表 + 消息流 + 输入）、流式回复、会话管理、画布/工具/提议等侧栏；Gateway 为唯一通道。 |

设计依据：`docs/FRONTEND_OFFICE_UI_ALIGNMENT_DESIGN.md`、`docs/PHASE15_OFFICE_FRONTEND_WORK_ORDERS.md`、`docs/TERMINAL_CHANNEL_DESIGN.md`。

---

## 二、Star Office UI 体验 — 需补充项

### 2.1 美术资源（当前缺失）

当前 `frontend-office/game.js` 仅使用占位：1×1 像素图、矩形、圆形，**没有**办公室背景、家具与角色精灵。

| 类型 | 内容 | 来源建议 | 说明 |
|------|------|----------|------|
| **场景背景** | 办公室底图（1280×720 或可平铺） | 从 Star-Office-UI 拷贝或自绘 | 画布底层 |
| **家具** | sofa、desk、flower、plants、poster、coffeeMachine、serverroom、errorBug、syncAnim、cat 等 | Star-Office-UI 的 `assets/` 或同结构 PNG/WebP | 与 `layout.js` 中 `furniture` 坐标对应 |
| **主角色** | star_idle（沙发）、star_working（办公桌）、error 区、syncing 动画 | Star-Office-UI 精灵/精灵表 | 随 `office.status.state` 切换位置与动画 |
| **多 Agent** | 访客/同事：⭐ + 名字标签 + 状态点，或 guest_anim_1..6 / guest_role_1..6 | Star-Office-UI 或统一占位图 | 由 `agents.list` 驱动，按 AREA_POSITIONS 放置 |

**操作建议**：

1. 克隆或下载 [Star-Office-UI](https://github.com/ringhyacinth/Star-Office-UI)，将其 `assets`（或等价图片目录）拷贝到 `frontend-office/assets/`。
2. 在 `game.js` 的 `preload()` 中按 Star-Office-UI 的 `game.js` 方式加载这些资源（背景、家具、角色精灵/帧动画）。
3. 在 `create()` 中按 `layout.js` 的 `LAYOUT.furniture`、`LAYOUT.areas` 放置精灵并设置 depth；主角色根据 `officeState` 切换显示位置与动画 key（idle→breakroom，executing→writing，error→error 区）。

### 2.2 Phaser 场景与状态绑定（部分已有，需接资源）

| 项 | 当前状态 | 待做 |
|----|----------|------|
| 画布尺寸与区域 | `layout.js` 已定义 LAYOUT、AREA_POSITIONS、STATE_TO_AREA | 无 |
| 主角色位置随 office.status | `game.js` 已轮询 `office.status` 并移动 mainStar | 将 mainStar 从「圆形」改为精灵/动画，并按 state 切换区域与动画 |
| 多 Agent 渲染 | 已轮询 `agents.list`，差量入场/离场，按 area 槽位放置 | 将占位图形改为精灵/图标+名字标签；可选状态点、气泡 |
| 家具与背景 | 未加载、未放置 | 在 create() 中按 furniture 坐标添加精灵；背景最先添加、depth 最低 |

### 2.3 视觉与交互细节（可选但提升明显）

- **像素风字体**：如 ArkPixel，用于画布内文字、状态栏、气泡（Star-Office-UI 对齐设计中有提及）。
- **气泡与状态栏**：主角色/Agent 头顶气泡、底部 status-text 打字机效果；文案可来自 `office.status.detail` 或固定映射。
- **昨日小记**：前端已有 `memory.yesterdaySummary` 请求与 memo 面板；需 Gateway 实现该 method 并返回内容，否则保持「暂无」或占位。
- **多语**：已有多语与 i18n.js；可保留并统一用于画布内文案。

---

## 三、OpenClaw 式交互体验 — 需补充项

### 3.1 大模型对接（影响「主动提议」与对话质量）

当前未接大模型时：

- **主动提议**：`proactive.suggest` 依赖后端逻辑（如 HEARTBEAT.md、tasks、记忆等），无 LLM 时多为「暂无待办与进行中计划」；**接好 LLM 与记忆后**该区域会自然有内容。
- **对话**：`chat` 已支持流式；需在 Gateway 侧配置 `config.llm`（如 API Key、模型），并确保 `office.status` 在 chat 进行中为 `executing`，以便办公室主角色状态正确。

**操作**：在运行 Gateway 的机器上配置 `rzeclaw.json` 与 `.env`（如 `ANTHROPIC_API_KEY` 或其它 provider），运行 `rzeclaw self-check` 确保 LLM 就绪；前端无需改协议。

### 3.2 聊天式布局与交互（与 TERMINAL_CHANNEL_DESIGN 对齐）

若当前「Rzeclaw Terminal」为 Electron/Tauri 客户端，可对照 OpenClaw Control UI / ClawUI 做以下增强：

| 项 | 建议 |
|----|------|
| **左侧会话列表** | 调用 `session.list` 展示会话列表；点击切换时 `session.restore(sessionId)` 并刷新消息列表与画布（`canvas.get`） |
| **中央消息流** | 保持用户/助手消息区分；流式回复时逐字/逐段追加，可加简单光标或「正在输入」提示 |
| **底部输入** | 支持 Enter 发送、可选 Shift+Enter 换行；多行时适当增高输入框 |
| **右侧面板** | 保持画布、目标、步骤、主动提议、Heartbeat、工具；可折叠或 Tab 切换以适配小屏 |
| **连接/设置** | Gateway 地址、可选 API Key、工作区；保存到本地配置，启动时自动连接 |

### 3.3 视觉与体验优化（无美术资源也可做）

- **图标**：为「画布」「目标」「步骤」「主动提议」「Heartbeat」「工具」使用统一风格图标（可先用 Emoji 或简单 SVG），减少纯文字按钮。
- **状态反馈**：连接中/已连接/断开/错误 在状态栏或连接区明确区分颜色与文案；发送中可禁用发送按钮或显示 loading。
- **错误与空状态**：未连接时输入框提示「请先连接 Gateway」；无会话时提示创建或选择会话；主动提议为空时保留当前「暂无…可添加 HEARTBEAT.md…」类说明。

---

## 四、实施顺序建议

1. **先接大模型（可选但推荐）**  
   配置 LLM → 对话与主动提议有真实内容，便于验证整条链路和 OpenClaw 式体验。

2. **Star Office 美术与 Phaser**  
   - 从 Star-Office-UI 拷贝 `assets` 到 `frontend-office/assets/`。  
   - 在 `game.js` 的 preload/create 中加载背景、家具、主角色与多 Agent 精灵，替换当前占位几何。  
   - 保持现有 `office.status` / `agents.list` 轮询与 state→area 映射。

3. **OpenClaw 式终端增强**  
   - 会话列表 + `session.restore`；流式与连接状态优化。  
   - 图标与状态反馈、错误与空状态文案。

4. **可选**  
   昨日小记（Gateway `memory.yesterdaySummary`）、像素字体与气泡、多语统一。

---

## 五、快速对照表

| 目标 | 缺少什么 | 补充方式 |
|------|----------|----------|
| **Star Office 像素办公室** | 场景/家具/角色精灵 | 从 Star-Office-UI 拷贝 assets，在 game.js 中 preload/create 并接 office.status / agents.list |
| **主角色与多 Agent 动起来** | 精灵与 state→area 动画 | 同上 + 已有 STATE_TO_AREA、AREA_POSITIONS、差量渲染 |
| **OpenClaw 式聊天** | 会话列表、流式与状态 | session.list + session.restore；流式与连接状态已在协议支持，前端展示与状态栏优化 |
| **主动提议有内容** | 后端 LLM + 记忆/HEARTBEAT | 配置 LLM 与记忆；前端已调 proactive.suggest，无需改协议 |
| **整体观感** | 图标、字体、状态反馈 | 图标/SVG、ArkPixel 等像素字体、连接/发送状态与空状态文案 |

---

*文档依据：FRONTEND_OFFICE_UI_ALIGNMENT_DESIGN.md、PHASE15_OFFICE_FRONTEND_WORK_ORDERS.md、TERMINAL_CHANNEL_DESIGN.md。*
