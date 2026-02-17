# Phase 8：Gateway 安全与局域网工单

基于《Phase 8：Gateway 安全与局域网接入设计》进行工单拆解。**实现前需确认该设计文档。**

---

## 一、工单列表

| 工单 ID | 名称 | 依赖 | 范围 | 验收标准 |
|---------|------|------|------|----------|
| **WO-801** | gateway.host 配置项与 WebSocketServer 绑定 | 无 | 配置 gateway.host（默认 127.0.0.1）；创建 WebSocketServer 时传入 host 与 port。 | 配置 0.0.0.0 时他机可连入。 |
| **WO-802** | gateway.auth 配置项与 apiKey 来源 | 无 | gateway.auth.enabled、gateway.auth.apiKey 或 apiKeyEnv；从环境变量读取 API Key。 | 配置与 env 正确加载。 |
| **WO-803** | 连接级认证：首条请求校验 apiKey | WO-802 | 每连接维护「已认证」状态；首条 JSON-RPC 请求的 params.apiKey 与配置一致则标记已认证；否则返回 error 并关闭连接。 | 未带或错误 apiKey 无法继续请求。 |
| **WO-804** | 已认证连接免重复携带 apiKey | WO-803 | 认证通过后，后续请求不再要求 params.apiKey；其他 method 正常处理。 | 首条认证后会话正常。 |
| **WO-805** | auth.enabled=false 时跳过认证 | WO-803 | 当 auth.enabled 为 false 或未配置时，不校验 apiKey，行为与当前一致。 | 关闭认证时无行为变化。 |
| **WO-806** | 文档：host、防火墙与认证说明 | WO-801, WO-802 | CONFIG_REFERENCE 与终端设计文档中补充 gateway.host、gateway.auth 及防火墙放行说明。 | 配置与部署有据可查。 |
| **WO-807** | 可选：mDNS 服务注册（Gateway 侧） | WO-801 | 配置 gateway.discovery.enabled 为 true 时，listen 后注册 _rzeclaw._tcp（port、可选 name）；退出时注销。 | 局域网可发现 Gateway。 |
| **WO-808** | 可选：终端侧局域网扫描与列表展示 | Phase 7 终端 | 终端「设置」或连接页触发扫描 mDNS _rzeclaw._tcp，展示 Gateway 列表供选择；选后填入 URL。 | 终端可发现并选择 Gateway。 |

---

## 二、建议实现顺序

1. WO-801 → WO-802 → WO-803 → WO-804 → WO-805 → WO-806  
2. 可选：WO-807（Gateway）→ WO-808（终端，属 Phase 7 终端仓库）

---

## 三、依赖关系

- WO-801 独立；WO-802 → WO-803 → WO-804 → WO-805；WO-806 依赖 801、802。  
- WO-807 依赖 WO-801；WO-808 依赖 Phase 7 终端与 WO-807。

---

*实现时以 PHASE8_GATEWAY_SECURITY_AND_LAN_DESIGN.md 与本文档为准。*
