# Rzeclaw 办公室前端（Phase 15）

像素办公室看板 + 内嵌对话窗口，通过 WebSocket 连接 Rzeclaw Gateway；支持多智能体放置、入场/离场与 isMain 主角色区分。

## 使用

1. **启动 Gateway**：在项目根目录执行 `npm run gateway`（默认 `ws://127.0.0.1:18789`）。
2. **打开前端**：
   - 推荐：在 `frontend-office` 下执行 `npx serve .` 或 `python -m http.server 8080`，浏览器访问 `http://localhost:8080`。
   - 或直接打开 `index.html`（file://）；连接地址为 `ws://当前页 hostname:18789`，若 Gateway 在不同端口可在 URL 加 `?port=端口`。
3. **连接**：页面自动连接 Gateway；状态栏显示「已连接」/「未连接」。发消息后主状态会变为 executing，画布上主角色移动；若有 Agent 实例会按 state 落在 breakroom/writing 区域，新实例入场有 toast 与「新」角标，回收有「xxx 已下班」toast。

## 接口依赖

- `office.status`：主状态（idle / executing），驱动主角色位置。
- `agents.list`：当前 Agent 实例列表，驱动多角色、槽位与 isMain。
- `chat`：发送消息与流式回复。
- `agents.blueprints`：智能体图鉴（点击「智能体图鉴」加载）。
- 可选：`memory.yesterdaySummary`（昨日小记，未实现则显示「暂无」）。

## 文件

- `index.html`：布局、对话面板、状态栏、toast、昨日小记占位、智能体图鉴按钮、发送与流式逻辑。
- `layout.js`：LAYOUT、STATE_TO_AREA、AREA_POSITIONS、getAreaPosition(area, slotIndex)（含超出预定义槽位时的网格扩展）。
- `gateway.js`：WebSocket、request(method, params)、setOnStream(id, chunk)。
- `game.js`：Phaser 场景、轮询、主角色与多 Agent 渲染、差量入场/离场动画、isMain 主角色与「新」角标。

## Phase 15 验收清单（端到端）

- [x] Gateway：`agents.list`、`office.status` 返回格式一致；无 Agent 时 agents 为空数组正常。
- [x] 前端：单一 WebSocket；办公室画布与主角色；主角色随 office.status 变化。
- [x] 前端：对话窗口可发消息、收完整回复与流式输出。
- [x] 前端：多实例按 state→area 放置；超过单区槽位时通过 getAreaPosition 网格扩展。
- [x] 前端：新实例入场（toast + 淡入 + 「新」角标）；实例消失时离场（toast + 淡出）；状态变更时角色换区。
- [x] 前端：用户发话触发某 Agent 后，新实例在下一轮 agents.list 中出现并入场。
- [x] 昨日小记占位、智能体图鉴（agents.blueprints）、文档可复现。
