# Rzeclaw 自制终端（Channel）设计方案

本文档描述「自制终端」的完整设计方案：在不依赖第三方 Channel 的前提下，实现安全、点对点的通信，支持 Windows 桌面优先、局域网多机部署与交叉控制，并预留 iOS 接口。**仅设计不实现。**

---

## 一、目标与约束

### 1.1 目标

- **自制 Channel**：不依赖 Slack / Telegram / Discord 等第三方通讯平台，所有命令与数据经自建终端与现有 Gateway 点对点完成。
- **优先 Windows 桌面**：首个交付形态为 Windows 可执行程序（exe），打开即用，部署简单。
- **安全与点对点**：通信可加密、可认证，拓扑上为「终端 ↔ Gateway」直连，无中间转发节点（可选发现服务仅限局域网，不依赖公网第三方）。
- **局域网多机与交叉控制**：支持多台机器部署；任意一台终端可连接本机或局域网内其他机器上的 Gateway，对智能助手下达命令、查看会话与画布等。
- **预留 iOS**：协议与能力设计为后续 iOS 客户端复用，便于未来开发 iOS 版本并连接同一套智能助手。

### 1.2 约束

- 部署不宜过重：终端以「单 exe（或 exe + 少量本地配置）」为主，Gateway 保持现有单进程形态。
- 不引入必须的公网第三方服务：发现、认证、通信均可在局域网或自建环境中完成。

---

## 二、通信方案选型（最佳 / 科学 / 安全）

### 2.1 方案结论

在「不依赖第三方、安全、点对点、兼顾远程与局域网」的前提下，推荐：

- **传输层**：**WebSocket（WS / WSS）** 作为唯一会话通道；与现有 Rzeclaw Gateway 一致，无需改 Gateway 协议。
- **安全**：
  - **远程 / 公网**：必须 **WSS（TLS）**；Gateway 不直接暴露，前置于 **反向代理**（如 Nginx/Caddy）做 TLS 终结与访问控制。
  - **局域网**：建议 **WSS** 或 **WS**；若仅限可信 VLAN，可配置为 WS 以简化部署，但应在设计上预留 WSS 能力。
- **认证**：**连接级或首包级认证**（如 API Key / Token），在 Gateway 侧校验，避免未授权终端连入（见 6.2）。
- **点对点**：终端与 Gateway 之间为单条 TCP 连接，无中继服务器；多机场景下为「终端 ↔ 某台机器上的 Gateway」直连。

该方案兼顾实现成本、与现有代码一致性和安全性，且与后续 iOS 使用同一套 WebSocket + JSON-RPC 协议即可。

### 2.2 为何不采用其他方案（简述）

- **纯 HTTP 轮询**：实时性与流式输出差，需额外设计「长轮询或 SSE」才接近当前体验；协议与现有 Gateway 不一致，改动大。
- **gRPC**：需改造 Gateway 与多语言 SDK，部署与运维成本高，与「简单部署」冲突。
- **消息队列（MQTT/AMQP）**：适合多节点、异步、离线；当前场景以「单连接、请求-响应+流式」为主，引入 MQ 增加复杂度，非必需。
- **纯 TCP 自定义协议**：无标准生态，调试与跨平台（含未来 iOS）成本高。

故保持 **WebSocket + 现有 JSON-RPC 语义** 为最优折中。

### 2.3 远程与局域网的统一与差异

- **统一**：同一套协议（WebSocket + 方法名/参数/返回值），终端不区分「连本机」与「连局域网/远程」，仅配置「Gateway 地址」不同。
- **差异**：
  - **局域网**：地址多为 `ws://192.168.x.x:18789` 或 `wss://hostname.local:18789`；可选关闭 TLS（仅限可信内网）。
  - **远程**：地址为 `wss://your-domain.com`（经反向代理）；必须 TLS + 认证。
- **实现**：Gateway 侧需支持绑定 `0.0.0.0`（当前若仅 bind 127.0.0.1 需改为可配置），以便局域网他机连接；安全由「认证 + 可选 TLS」保证。

---

## 三、终端总体架构

### 3.1 角色与拓扑

```
┌─────────────────┐         WebSocket (WS/WSS)          ┌─────────────────┐
│  终端 (Client)   │ ◄─────────────────────────────────► │  Gateway        │
│  Windows exe    │     JSON-RPC request/response      │  (现有进程)     │
│  未来：iOS App  │     + 流式 text chunk               │  + Agent        │
└─────────────────┘                                     └─────────────────┘
        │                                                          │
        │ 本地配置/缓存                                             │ workspace
        ▼                                                          ▼
  配置：Gateway URL、可选 API Key                          会话、画布、记忆等
```

- **单点对单点**：一个终端实例在同一时刻只与一个 Gateway 地址建立一条 WebSocket 连接；多机交叉控制 = 切换「当前连接的 Gateway 地址」或开多窗口/多实例分别连不同地址。

### 3.2 Windows 终端技术栈建议

- **方案 A（推荐）**：**Tauri 2.x**  
  - 前端：HTML/CSS/JS（或 React/Vue/Svelte）实现聊天式 UI。  
  - 后端：Rust，负责 WebSocket 连接、JSON 序列化、本地配置与存储。  
  - 打包：单 exe 或 exe + 少量 dll，体积小，无需内置 Node；与现有 Node 版 Gateway 无依赖关系。  
  - 后续 iOS：可考虑共享前端逻辑（如 TypeScript 业务层），Rust 核心可复用于 iOS（通过 FFI 或 Tauri 的移动端规划）。

- **方案 B**：**Electron**  
  - 成熟、生态丰富；可参考开源 **ClawUI**（Electron + React，类 ChatGPT 界面）的布局与交互。  
  - 缺点：安装包体积大、内存占用高；与「轻量、打开即用」的期望略有冲突，但实现快。

- **方案 C**：**原生 Win32 / WPF / Qt**  
  - 体积与性能最优，但聊天式 UI、流式渲染、跨平台预留成本高；适合对安装包体积有极强要求的场景。

**建议**：优先 **Tauri**，在保证「单 exe、安全、可扩展」的前提下，便于后续统一协议与 iOS 复用；若团队更熟 Electron，可短期采用 Electron 快速出原型，再评估迁移到 Tauri。

### 3.3 进程与部署模型

- **终端**：单进程；启动后读本地配置（如 `%APPDATA%/Rzeclaw Terminal/config.json` 或同目录 `config.json`），连接配置中的 Gateway URL，进入主界面。
- **Gateway**：保持现有形态，单独进程（如 `node dist/index.js gateway` 或等价）；可配置监听 `0.0.0.0:port` 以接受局域网连接。
- **部署**：
  - **本机使用**：用户启动 Gateway（本机），终端配置 `ws://127.0.0.1:18789`（或 wss 若本机启了 TLS）。
  - **局域网多机**：在机器 B 上运行 Gateway，在机器 A 上运行终端，终端配置 `ws://B的IP:18789`，即实现「A 上的终端控制 B 上的助手」；反之亦然。
- **无中央服务器**：不依赖任何云端；可选组件仅为「局域网发现」（见 5.2），不依赖公网。

---

## 四、终端功能与交互设计

### 4.1 功能范围（与 Gateway 方法对应）

终端需覆盖以下能力（与现有 Gateway 方法一一对应，便于后续 iOS 复用同一协议）：

| 能力 | Gateway 方法 | 说明 |
|------|--------------|------|
| 连接与健康 | （连接后可选）`health` | 检查 Gateway 与 workspace 可用性。 |
| 会话 | `session.getOrCreate`, `session.restore`, `session.saveSnapshot`, `session.list` | 当前会话、恢复历史会话、保存快照、会话列表。 |
| 对话 | `chat` | 发送用户消息；接收流式 `stream: "text", chunk` 与最终 `result.content`、`citedMemoryIds`。 |
| 画布 | `canvas.get`, `canvas.update` | 查看/编辑当前目标、步骤、产物（可选面板）。 |
| 工具 | `tools.list`, `tools.call` | 列出工具、直接调用工具（高级/调试）。 |
| 主动与心跳 | `proactive.suggest`, `heartbeat.tick` | 获取提议、手动触发一次 Heartbeat（可选入口）。 |

以上为「预留 iOS 接口」的协议面；iOS 版本可实现子集（如仅会话+对话+画布），但协议格式与 Windows 终端一致。

### 4.2 交互风格与参照

- **主界面**：**聊天式**，与常用 Channel（Slack、Discord、Telegram 网页版）或 **OpenClaw Control UI / ClawUI** 类似：
  - **左侧**（可选）：会话列表（来自 `session.list`）+ 当前连接状态（Gateway 地址、连接中/断开）。
  - **中央**：当前会话的消息流（用户消息 / 助手回复；助手回复支持流式逐字显示）。
  - **底部**：输入框 + 发送按钮；支持多行与 Enter 发送（可配置）。
  - **右侧或折叠面板**（可选）：画布（goal/steps/artifacts）、工具列表、提议列表、设置。
- **设置**：至少包含「Gateway 地址」（ws/wss URL）、「可选 API Key」、工作区（若 Gateway 支持多 workspace 的 `params.workspace`）；可保存为本地配置，下次启动自动连接。
- **参照**：
  - **OpenClaw**：Control UI（浏览器）的会话与配置管理；**ClawUI**（Electron + React）的 ChatGPT 式布局、会话管理、快捷键——可作为布局与交互的参照，不必照抄。
  - 差异点：本终端为「自制、无第三方 Channel」，且强调「局域网多机、交叉控制」与「单 exe 打开即用」。

### 4.3 核心交互流程（简要）

1. **启动** → 读配置 → 连接 Gateway（WS/WSS）→ 若未配置则进入「设置」页要求填写 Gateway URL。
2. **连接成功** → 可选调用 `health` → 调用 `session.getOrCreate` 或 `session.list` 展示会话列表 → 选择或创建会话。
3. **对话** → 用户输入 → 发送 `chat`（params: message, sessionId, workspace）→ 订阅 `stream: "text"` 与最终 `result` → 更新本地会话消息列表与可选画布（若 Gateway 在 runAgentLoop 中写回 Canvas）。
4. **会话切换** → `session.restore(sessionId)` 或 `session.getOrCreate(sessionId)` → 刷新消息列表与画布。
5. **画布** → 定时或按需 `canvas.get`；编辑后 `canvas.update`（可选）。
6. **主动提议** → 用户点击「获取建议」→ `proactive.suggest` → 展示 proposals/suggestions（仅展示不自动执行，符合「提议与执行分离」）。

### 4.4 与「常用 Channel」的差异点

- **无第三方账号**：不依赖 Slack/Telegram 等登录；身份仅「本终端 + 可选 API Key」。
- **多机交叉控制**：通过切换 Gateway 地址，同一终端可连接不同机器上的助手；会话与 workspace 归属在 Gateway/workspace 侧，终端仅展示与操作。
- **单 exe 部署**：安装/解压即用，无需额外运行时（Tauri 方案）；Electron 则需打包 Node 运行时。

---

## 五、局域网多机部署与交叉控制

### 5.1 场景

- **多台 PC**：机器 A、B、C… 在同一局域网。
- **部分机器运行 Gateway**：例如 A、B 各跑一个 Gateway（可同端口，因不同机器）；或仅 B 跑 Gateway。
- **终端可安装于任意机器**：例如仅在 A 上安装终端，A 的终端可连 `ws://A:18789`（本机）或 `ws://B:18789`（B 上的助手），实现「交叉控制」。

### 5.2 连接方式

- **手动配置**（必选）：终端设置中填写「Gateway 地址」，如 `ws://192.168.1.10:18789`。适用于所有环境，无额外依赖。
- **局域网发现**（可选）：  
  - Gateway 启动时在局域网注册自身（如 **mDNS/Bonjour**：`_rzeclaw._tcp` + 端口 + 可选主机名）；  
  - 终端启动时扫描局域网内的 `_rzeclaw._tcp`，在「连接」或「设置」页展示「可用的 Gateway 列表」，用户选择其一即可连接。  
  - 实现简单、无需中心服务器，仅限局域网；设计阶段建议预留「发现协议与报文格式」，首版可实现「仅手动输入地址」，后续再加发现。

### 5.3 Gateway 侧要求

- **监听地址**：需支持绑定 `0.0.0.0`（或可配置 host），否则他机无法连入。若当前仅 `127.0.0.1`，需在配置中增加 `host: "0.0.0.0"` 或等价项。
- **防火墙**：用户需在运行 Gateway 的机器上放行对应端口（如 18789），否则局域网连接会被拒绝；可在文档中说明。
- **认证**：见 6.2；建议至少支持「可选 API Key」，以便局域网内多用户/多终端时做简单访问控制。

### 5.4 交叉控制语义

- 「交叉控制」即：终端连到哪台 Gateway，就操作哪台 Gateway 上的会话与 workspace。
- 同一终端可保存多个「连接配置」（名称 + Gateway URL + 可选 API Key），快速切换所连机器，无需改代码；多实例或多标签页也可分别连不同 Gateway。

---

## 六、安全设计

### 6.1 传输安全

- **公网/远程**：一律 **WSS**；Gateway 前置反向代理（Nginx/Caddy），TLS 在代理终结，代理将 WS 转发到本机 Gateway（如 `http://127.0.0.1:18789`）。
- **局域网**：推荐 WSS（自签名或内网 CA 均可）；若明确仅限可信网段，可允许 WS，但设计上保留「同一二进制支持 WSS」的能力。

### 6.2 认证与访问控制

- **推荐**：**连接后首条请求或首包携带 API Key / Token**（如自定义 method `auth` 或约定首条 `session.getOrCreate` 的 params 中带 `apiKey`）；Gateway 校验通过后才允许后续方法调用，否则关闭连接或返回 4xx。
- **存储**：终端将 API Key 存在本地（如当前用户目录的配置文件），可选「仅内存、不落盘」；不在日志或界面上明文展示。
- **多机/多用户**：每台 Gateway 可配置「允许的 API Key 列表」或共享密钥；终端连接时携带，Gateway 校验；可选与「workspace」绑定（某 Key 仅能访问某 workspace）。

### 6.3 数据与隐私

- **点对点**：消息与结果仅在「终端 ↔ Gateway」之间传输，不经第三方服务器。
- **本地缓存**：终端可缓存会话列表、最近消息预览等；敏感内容（如完整对话）是否落盘、是否加密，可在终端实现时按需设计（建议可配置「不缓存敏感内容」或「加密存储」）。

---

## 七、iOS 接口预留

### 7.1 协议统一

- iOS 与 Windows 终端使用**同一套协议**：
  - 传输：**WebSocket（建议 WSS）**。
  - 消息格式：JSON，请求 `{ id, method, params }`，响应 `{ id, result }` 或 `{ id, error: { message } }`，流式 `{ id, stream: "text", chunk }`。
  - 方法集：与 4.1 表一致（session.*, chat, canvas.*, tools.*, proactive.suggest, heartbeat.tick, health）。
- Gateway 端**不区分**客户端类型（Windows / iOS / 未来其他），仅根据 method 与 params 处理；认证方式统一（如 API Key），便于 iOS 复用。

### 7.2 文档与契约

- 建议在仓库中维护一份 **《Gateway 协议说明》**（或扩展现有文档），包含：
  - 连接方式（WS/WSS URL、可选 Query 参数）。
  - 认证方式（首包/Header/Query 的 API Key 等）。
  - 各 method 的 params 与 result 形状（可抽成 JSON Schema 或 TypeScript 类型），以及流式事件的格式。
- 该文档即「iOS 接口」的契约；iOS 开发时只需按此实现客户端，无需改 Gateway 协议。

### 7.3 iOS 实现时的差异（设计预留）

- **网络**：iOS 使用系统 WebSocket API 或第三方库连接同一 WSS URL；后台与断线重连策略由 iOS 端实现。
- **UI**：iOS 为原生或 SwiftUI/UIKit，可与 Windows 共享「业务逻辑与协议层」（若用 TypeScript 等可考虑共享）；UI 层按平台实现。
- **推送**（可选）：若未来需要「助手主动推送提议/通知」到锁屏，可考虑 Gateway 侧增加「推送注册」接口（如上传 device token），由 Gateway 或自建轻量推送服务发送；当前设计可仅预留接口名与参数，不实现。

---

## 八、部署与发布

### 8.1 终端（Windows）

- **构建产物**：单 exe（Tauri）或安装包（Electron）；首次运行可引导用户配置 Gateway 地址与可选 API Key，写入本地配置。
- **更新**：可选「启动时检查更新」（指向自建或 GitHub Releases），不依赖第三方应用商店；若无需自动更新，可仅提供「下载页 + 手动替换 exe」。

### 8.2 Gateway

- 保持现有部署方式；若需局域网可访问，需：
  - 配置 `host: "0.0.0.0"`（或等价）；
  - 防火墙放行端口；
  - 可选：启用认证（6.2）。

### 8.3 用户使用流程（简要）

1. 在一台或多台机器上按需启动 Rzeclaw Gateway（本机或局域网）。
2. 在 Windows 上安装/解压终端 exe，首次运行填写 Gateway 地址（及可选 API Key）。
3. 连接成功后即可进行会话、画布、提议等操作；切换 Gateway 地址即可切换所控的助手（局域网交叉控制）。

---

## 九、设计小结表

| 维度 | 选择 / 约定 |
|------|-------------|
| 通信 | WebSocket（WS/WSS），与现有 Gateway 一致 |
| 安全 | 远程必 WSS + 反向代理；局域网推荐 WSS，可选 WS；认证建议 API Key |
| 点对点 | 终端 ↔ Gateway 直连，无中继 |
| Windows 终端 | 推荐 Tauri（单 exe、小体积）；备选 Electron（参考 ClawUI） |
| 交互 | 聊天式主界面 + 会话列表 + 画布/工具/提议等可选面板 |
| 局域网多机 | Gateway 绑定 0.0.0.0；终端配置他机 IP；可选 mDNS 发现 |
| 交叉控制 | 终端通过切换「Gateway 地址」连接不同机器上的助手 |
| iOS 预留 | 同一协议（WS + JSON-RPC）；独立文档《Gateway 协议说明》作为契约 |

---

## 十、附录

### A. Gateway 方法速查（与终端能力对应）

- `health` — 健康检查  
- `session.getOrCreate`, `session.restore`, `session.saveSnapshot`, `session.list` — 会话  
- `chat` — 发送消息，响应含 content、stream、citedMemoryIds  
- `canvas.get`, `canvas.update` — 画布  
- `tools.list`, `tools.call` — 工具  
- `proactive.suggest` — 主动提议  
- `heartbeat.tick` — 手动心跳  

### B. 术语

- **Channel**：用户与智能助手交互的「通道」；本方案中指自制的桌面/iOS 终端，而非第三方 IM。
- **Gateway**：Rzeclaw 现有 WebSocket 服务进程，负责会话调度、Agent 调用、画布与工具等。
- **点对点**：终端与 Gateway 之间单条连接，无第三方中继服务器。

---

*本文档为终端（自制 Channel）的完整设计方案，不包含实现细节；实现时可按本文分阶段交付（如先手动地址 + 基础会话与对话，再加画布、发现、认证等）。*
