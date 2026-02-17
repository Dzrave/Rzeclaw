# Rzeclaw Terminal（Phase 7）

桌面终端 Channel，通过 WebSocket 连接 Rzeclaw Gateway，实现会话与对话。

## 功能

- 连接与健康检查、会话列表与恢复、对话与流式回复
- 画布：查看当前目标与步骤；**编辑目标与步骤**（每行一条，可加 `[pending]`/`[in_progress]`/`[done]`）并**保存画布**（调用 canvas.update）
- 主动提议：获取建议（proactive.suggest）
- Heartbeat：手动触发一次心跳
- 工具列表（tools.list）
- **多连接配置（WO-719）**：设置页可添加/删除/切换多组连接（名称、Gateway 地址、API Key）；工具栏可切换当前连接（断开后重连）
- 设置：Gateway 地址（ws/wss）、API Key；地址须以 ws:// 或 wss:// 开头
- 连接失败时显示错误与「重试」

## 运行

```bash
cd terminal
npm install
npm start
```

## 设置

首次运行若无 Gateway 地址会进入设置页。填写：

- **Gateway 地址**：如 `ws://127.0.0.1:18789`（本机）或 `ws://192.168.x.x:18789`（局域网）。
- **API Key**：若 Gateway 启用 `gateway.auth.enabled`，需设置环境变量 `RZECLAW_GATEWAY_API_KEY` 并在终端中填写相同值。

保存后自动连接。可点击「设置」修改并重新连接。

- **多连接**：在设置页选择「连接配置」下拉，可「添加」新连接、「删除当前」、在列表中选一条后修改地址与 API Key，再「保存并连接」。连接成功后可在工具栏「连接」下拉中切换至其他配置（会断开并重连）。

## 打包 Windows exe

```bash
npm run dist
```

产出在 `terminal/dist/`。

## 协议

与 `docs/TERMINAL_CHANNEL_DESIGN.md` 附录 A 一致：JSON-RPC over WebSocket；首条请求可带 `params.apiKey` 用于认证。
