# Phase 14A：Event Bus 为中枢、Gateway 降为节点 — 工单

基于 `docs/EVENT_BUS_AS_HUB_DESIGN.md` 进行工单拆解。**实现前需确认该设计文档。**

---

## 一、工单列表

| 工单 ID | 名称 | 依赖 | 范围 | 验收标准 |
|---------|------|------|------|----------|
| **WO-1401** | Event Schema 类型定义 | 无 | 定义 ChatRequestEvent、ChatResponseEvent、ChatStreamEvent（及可选 task.status）的 TypeScript 类型或 JSON Schema；correlationId、source、message、sessionId、sessionType、content、error 等字段 | 类型可被 config/网关/执行层引用，与设计 §3 一致 |
| **WO-1402** | 进程内逻辑总线：topic 与订阅 | 无 | 实现内存态 Bus：topic → 订阅者回调 Map；subscribe(topic, callback)、publish(topic, payload)；支持 chat.request、chat.response、chat.stream | 多订阅者可按 topic 收到消息 |
| **WO-1403** | 进程内总线：请求-响应关联 | WO-1402 | 发布 request 时生成 correlationId；订阅 response 时按 correlationId 匹配并 resolve 对应 Promise 或回调；超时可配置 | 发布 request 后可在限定时间内收到同 correlationId 的 response |
| **WO-1404** | Gateway chat 改为发布 request | WO-1401, WO-1402 | Gateway chat 入口：构造 ChatRequestEvent（correlationId、source、message、sessionId 等），调用 bus.publish("chat.request", event)；不直接调用 Router/runAgentLoop | chat 请求以事件形式发出 |
| **WO-1405** | Gateway 订阅 response 并回传 | WO-1403, WO-1404 | Gateway 在启动时订阅 chat.response（及可选 chat.stream）；收到 response 时根据 correlationId 找到对应 WS 连接，推送 result 并清理映射；维护 correlationId → 连接/会话 映射 | 用户通过 WS 能收到与 request 对应的回复 |
| **WO-1406** | 执行层订阅 chat.request | WO-1402 | 独立模块或现有 Gateway 内「执行层」：订阅 chat.request；收到后读取 message、sessionId 等，调用现有 Router + executeFlow / runAgentLoop（逻辑不变） | 总线上 request 被消费并执行 |
| **WO-1407** | 执行层发布 chat.response | WO-1406, WO-1401 | 执行层在 runAgentLoop/executeFlow 完成后，构造 ChatResponseEvent（同一 correlationId、content、citedMemoryIds 等），publish("chat.response", event)；流式时可选多次 publish chat.stream 再 publish response | 执行结果经总线回传 |
| **WO-1408** | 会话与快照在 Gateway 侧保留 | WO-1404, WO-1405 | 约定：session 列表、session.restore、session.saveSnapshot 仍由 Gateway 维护；执行层从 request 中取 sessionId；response 返回后 Gateway 写快照（与现有逻辑一致） | 会话恢复与快照行为与现有一致 |
| **WO-1409** | correlationId 超时与错误处理 | WO-1404, WO-1405 | Gateway 侧：若在可配置时间内未收到 response，向用户返回「请求超时」并清理映射；执行层异常时仍发布 response（error 字段） | 超时与异常有明确用户可见结果 |
| **WO-1410** | 本地终端/CLI 对接（可选） | WO-1402, WO-1403 | 本地终端或 CLI 将用户输入构造为 ChatRequestEvent，publish chat.request；订阅 chat.response（按 correlationId）；将 content 输出到终端；source 如 local_ui | 本地入口可不经 Gateway 与 Bus 交互 |
| **WO-1411** | CONFIG_REFERENCE 与设计衔接说明 | WO-1401～1409 | 文档：Event Bus 形态（进程内/独立进程）、Schema 字段说明、Gateway 与执行层职责；可选 config.eventBus 配置项（如 timeoutMs） | 配置与架构可查 |
| **WO-1412** | 独立 Bus 进程或外部中间件（可选） | WO-1402, WO-1403 | 选型并实现：独立 Bus 进程（socket 发布/订阅）或 Redis/MQTT；Gateway 与执行层改为连接该 Bus 而非进程内引用；保持 Schema 与 topic 不变 | Gateway 与执行层可跨进程；重启 Gateway 不杀执行层 |

**建议实现顺序**：1401 → 1402 → 1403 → 1406 → 1407 → 1404 → 1405 → 1408 → 1409 → 1410（可选）→ 1411 → 1412（可选）。

---

## 二、依赖关系简图

```
WO-1401 ──┬── WO-1404 ── WO-1405
          │        ↑
WO-1402 ──┼── WO-1403    WO-1408, WO-1409
          │
          └── WO-1406 ── WO-1407
```

---

## 三、设计文档索引

| 依据 | 文档 |
|------|------|
| 设计 | `docs/EVENT_BUS_AS_HUB_DESIGN.md` |
| 总计划 | `docs/PHASE14_IMPLEMENTATION_PLAN.md` |

---

*实现时以 EVENT_BUS_AS_HUB_DESIGN.md 与本文档为准。*
