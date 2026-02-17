# Phase 7：终端（Channel）工单

基于《Rzeclaw 自制终端（Channel）设计方案》进行详细工单拆解。**实现前需确认该设计文档已阅读并认可。** 工单覆盖从项目搭建到可交付 Windows exe 的全过程，避免遗漏。

---

## 一、工单列表（全量）

| 工单 ID | 名称 | 依赖 | 范围 | 验收标准 |
|---------|------|------|------|----------|
| **WO-701** | 终端项目脚手架与技术栈选定 | 无 | 新建终端仓库或 monorepo 子包；选定 Tauri 2.x 或 Electron；目录结构、构建脚本、依赖声明。 | 可成功 build/run 出空白窗口。 |
| **WO-702** | 本地配置存储与读取 | WO-701 | 定义配置结构（gatewayUrl, apiKey?, workspace?）；存储路径（如 %APPDATA%/Rzeclaw Terminal/config.json 或同目录）；读/写 API，首次无文件时返回默认或空。 | 可保存并再次读取配置。 |
| **WO-703** | WebSocket 连接层 | WO-701 | 建立 WS/WSS 连接；断线重连策略（可配置重试次数与间隔）；连接状态（connecting/connected/disconnected/error）暴露给 UI。 | 给定 URL 可连接、断开、获知状态。 |
| **WO-704** | JSON-RPC 请求/响应封装 | WO-703 | 请求格式 { id, method, params }；响应 { id, result } 或 { id, error }；id 与 Promise 映射，超时与错误回调。 | 可发送任意 method 并正确解析 result/error。 |
| **WO-705** | 流式消息解析（stream: text） | WO-704 | 服务端推送 { id, stream: "text", chunk } 时累积到对应请求的「流式结果」；与最终 result 区分。 | 能正确拼接并展示流式 chunk。 |
| **WO-706** | health 调用与连接就绪 | WO-704 | 连接成功后可选调用 health，展示 workspaceWritable、apiKeySet 等；失败时提示用户检查地址与密钥。 | 连接后可看到健康状态或错误提示。 |
| **WO-707** | session.getOrCreate 与 session.list | WO-704 | 调用 session.getOrCreate(sessionId) 与 session.list(workspace?, limit?)；解析返回的 sessionId、messagesCount、sessions 列表。 | 可获取/创建会话并展示会话列表。 |
| **WO-708** | session.restore 与 session.saveSnapshot | WO-704 | 调用 session.restore(sessionId) 与 session.saveSnapshot(sessionId)；根据结果刷新本地会话状态。 | 可恢复历史会话并保存当前会话快照。 |
| **WO-709** | chat 发送与流式展示 | WO-705, WO-707 | 发送 chat({ message, sessionId, workspace? })；处理 stream: "text" 逐字追加到当前回复区域；收到 result 后更新 content、citedMemoryIds。 | 发送消息后能看到流式回复与最终结果。 |
| **WO-710** | 消息列表与当前会话状态 | WO-709 | 维护当前会话的 messages 列表（user/assistant）；恢复会话时从服务端或本地缓存加载历史消息；渲染消息气泡与引用（citedMemoryIds）。 | 会话内消息列表正确、恢复后历史完整。 |
| **WO-711** | 输入框与发送行为 | WO-709 | 多行输入框；发送按钮与 Enter 发送（可配置）；发送时禁用输入直至本轮 result 返回；空消息不发送。 | 可输入多行并发送，行为符合预期。 |
| **WO-712** | canvas.get 与画布数据模型 | WO-704 | 调用 canvas.get(workspace?)；解析 goal、steps、currentStepIndex、artifacts；前端数据模型与状态。 | 可拉取画布并持有结构化数据。 |
| **WO-713** | 画布面板 UI | WO-712 | 右侧或折叠面板展示 goal、步骤列表、当前步骤、artifacts；只读或可编辑（编辑后调用 canvas.update）。 | 画布内容可见可编辑（若支持 update）。 |
| **WO-714** | canvas.update 调用 | WO-712 | 用户编辑后调用 canvas.update({ goal?, steps?, currentStepIndex?, artifacts? })；成功后刷新本地画布状态。 | 编辑画布后能写回并刷新。 |
| **WO-715** | proactive.suggest 与提议展示 | WO-704 | 调用 proactive.suggest(workspace?, trigger?)；展示 proposals、suggestions、isProposalOnly；不自动执行。 | 可获取并展示提议列表。 |
| **WO-716** | heartbeat.tick 手动触发入口 | WO-704 | 提供「手动触发 Heartbeat」按钮或菜单；调用 heartbeat.tick(workspace?)；展示 executed、content、error。 | 可手动触发一次 tick 并看到结果。 |
| **WO-717** | tools.list 与 tools.call（可选） | WO-704 | 可选面板：tools.list 展示工具列表；tools.call(name, args) 用于调试或高级操作。 | 需要时能列出并调用工具。 |
| **WO-718** | 设置页：Gateway 地址与 API Key | WO-702, WO-703 | 设置页表单：Gateway URL（ws/wss）、API Key（可选、可掩码）；保存后写配置并可选立即重连。 | 可修改地址与密钥并生效。 |
| **WO-719** | 设置页：工作区与连接配置 | WO-718 | 可选：默认 workspace、重连次数/间隔；多连接配置（名称+URL+Key）便于多机切换。 | 可保存多组连接配置并切换。 |
| **WO-720** | 主布局：会话列表 + 消息区 + 画布/提议 | WO-710, WO-713, WO-715 | 左侧会话列表；中央消息区 + 输入框；右侧或折叠画布与提议；连接状态指示。 | 布局符合设计文档 4.2 节。 |
| **WO-721** | 连接失败与未配置引导 | WO-706, WO-718 | 未配置 Gateway URL 时引导用户进入设置；连接失败时提示并允许重试或修改设置。 | 新用户与断线场景有明确引导。 |
| **WO-722** | Windows 打包与安装/便携 | WO-701 | 产出 Windows exe（或安装包）；支持便携（同目录 config.json）或安装到用户目录；图标与应用名。 | 可交付单 exe 或安装包供本机/局域网使用。 |
| **WO-723** | 文档：终端使用说明与协议约定 | 无 | 终端使用说明（如何配置、如何多机）；与《终端 Channel 设计》附录 A 的 Gateway 方法速查对齐。 | 用户与开发者可据此使用与对接。 |

---

## 二、建议实现顺序（按依赖）

1. **基础**：WO-701 → WO-702 → WO-703 → WO-704 → WO-705  
2. **连接与健康**：WO-706  
3. **会话**：WO-707 → WO-708  
4. **对话**：WO-709 → WO-710 → WO-711  
5. **画布**：WO-712 → WO-713 → WO-714  
6. **主动与心跳**：WO-715 → WO-716  
7. **工具（可选）**：WO-717  
8. **设置与多连接**：WO-718 → WO-719  
9. **布局与体验**：WO-720 → WO-721  
10. **交付与文档**：WO-722 → WO-723  

---

## 三、依赖关系简图

```
WO-701 → WO-702 → WO-703 → WO-704 → WO-705
                                    → WO-706
                                    → WO-707 → WO-708
                                    → WO-709 → WO-710 → WO-711
                                    → WO-712 → WO-713 → WO-714
                                    → WO-715, WO-716, WO-717
WO-702, WO-703 ─────────────────────→ WO-718 → WO-719
WO-710, WO-713, WO-715 ─────────────→ WO-720 → WO-721
WO-701 ─────────────────────────────→ WO-722
                                       WO-723
```

---

## 四、与设计文档的对应

| 设计章节 | 工单 |
|----------|------|
| 三、终端总体架构（技术栈、进程模型） | WO-701, WO-722 |
| 四、功能范围（health, session, chat, canvas, tools, proactive, heartbeat） | WO-706～WO-717 |
| 四、设置与配置 | WO-702, WO-718, WO-719 |
| 四、主界面布局与交互 | WO-720, WO-721 |
| 五、局域网多机（多连接配置） | WO-719 |
| 附录 A Gateway 方法速查 | WO-723 |

---

*Phase 7 实现前请确认 TERMINAL_CHANNEL_DESIGN.md；实现时以本工单文档为准，按顺序执行。*
