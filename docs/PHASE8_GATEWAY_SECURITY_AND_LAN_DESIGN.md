# Phase 8：Gateway 安全与局域网接入设计

本文档为 **Phase 8** 的详细设计：使 Gateway 支持**可配置监听地址**（含 0.0.0.0）、**连接级认证**（API Key/Token），以及可选的**局域网发现**（mDNS），以便终端在局域网多机部署与交叉控制时安全连入。**仅设计不实现。**

---

## 一、目标

- **监听地址可配置**：默认可保持 127.0.0.1；配置 host 为 0.0.0.0 时接受局域网内他机连接。
- **认证**：连接建立后，在首条请求或首包中校验 API Key/Token；未通过则拒绝后续请求或关闭连接。
- **可选发现**：Gateway 在局域网内通过 mDNS 注册服务（如 _rzeclaw._tcp），终端可扫描并展示「可用 Gateway 列表」，便于用户选择连接。

---

## 二、监听地址（host）

- **配置项**：`gateway.host`（或顶层 `host`），类型 string。  
  - 默认：`127.0.0.1`（仅本机）。  
  - 设为 `0.0.0.0` 时，监听所有网卡，局域网他机可通过 `ws://<本机IP>:port` 连接。
- **实现要点**：WebSocketServer 的 `host` 选项传入配置值；若未配置则 127.0.0.1。
- **文档**：在 CONFIG_REFERENCE 中说明 host 与防火墙注意点（局域网开放时需放行 port）。

---

## 三、认证（API Key / Token）

- **配置项**：`gateway.auth.enabled`（boolean）、`gateway.auth.apiKey`（string）或从环境变量读取（如 `RZECLAW_GATEWAY_API_KEY`）。  
  - 若 `auth.enabled` 为 true，则所有连接在处理首条 JSON-RPC 请求前需通过认证。
- **认证方式（二选一或并存）**：  
  - **方式 A**：首条请求的 params 中携带 `apiKey`（如 session.getOrCreate 的 params.apiKey）；Gateway 校验与配置/环境变量一致则放行，并标记该连接已认证；否则返回 error 并可选关闭连接。  
  - **方式 B**：WebSocket 子协议或首条文本帧为固定格式（如 `auth:<apiKey>`），Gateway 解析后校验；通过则后续帧为 JSON-RPC。  
- **建议**：优先方式 A（与现有 JSON-RPC 兼容，终端在每次请求 params 中带 apiKey，或 Gateway 在连接后首条请求要求 auth method）。  
  - 更简单：首条任意请求若带 `params.apiKey` 且正确，则标记连接已认证；后续请求不再强制带 apiKey。若首条未带或错误，返回 401 类 error 并关闭连接。
- **无认证**：`auth.enabled` 为 false 或未配置时，不校验，保持现有行为。

---

## 四、局域网发现（可选）

- **协议**：mDNS（Bonjour），服务类型 `_rzeclaw._tcp`，端口与配置的 port 一致，TXT 可带 hostname 或 workspace 标签便于识别。
- **Gateway 侧**：若配置 `gateway.discovery.enabled === true`，在 listen 后向局域网广播该服务；进程退出时注销。
- **终端侧**：在「设置」或「连接」页可触发「扫描局域网」，列出发现的 Gateway（名称/IP/端口），用户选择后填入 Gateway URL。
- **依赖**：Node 侧可用 `bonjour` 或 `multicast-dns` 等包；实现时注意仅局域网、无公网依赖。

---

## 五、与终端设计的对应

- 《终端 Channel 设计》6.2 节：认证为连接级或首包级 API Key；终端存储 apiKey 并在连接后首条请求携带。  
- 5.2 节：发现为可选；终端可展示「可用 Gateway 列表」并选择。  
- 5.3 节：Gateway 需支持 0.0.0.0 与防火墙说明。

---

## 六、配置示例（建议）

```json
{
  "gateway": {
    "host": "0.0.0.0",
    "auth": {
      "enabled": true,
      "apiKeyEnv": "RZECLAW_GATEWAY_API_KEY"
    },
    "discovery": {
      "enabled": false
    }
  }
}
```

---

*本文档为 Phase 8 实施的设计依据；具体工单见 PHASE8_WORK_ORDERS.md。*
