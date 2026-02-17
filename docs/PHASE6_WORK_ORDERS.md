# Phase 6：自主性、Skill/MCP、Heartbeat 与主动模式工单

基于《自主性、Skill/MCP 与主动模式（Heartbeat / Live Canvas）设计》进行实施计划拆解，**保留 Heartbeat 实现**，并实现**更主动、更智能的主动机制**（多触发源、任务/需求推断、提议与执行分离）。工单覆盖实现每个细节，按依赖顺序执行。

---

## 一、工单列表（全量）

| 工单 ID | 名称 | 依赖 | 范围 | 验收标准 |
|---------|------|------|------|----------|
| **WO-601** | Canvas 状态结构与类型定义 | 无 | 定义 `CurrentPlan`、`Step`、`Artifact` 等类型；`workspace/.rzeclaw/canvas/` 目录约定。 | 类型可被 canvas 读写与 Gateway 使用。 |
| **WO-602** | Canvas 持久化读写 | WO-601 | 实现 `readCanvas(workspace)` / `writeCanvas(workspace, data)`；存储路径 `workspace/.rzeclaw/canvas/current.json`。 | 可读可写，无数据时返回空结构。 |
| **WO-603** | Gateway canvas.get / canvas.update | WO-602 | Gateway 新增 method：`canvas.get`（返回当前画布）、`canvas.update`（params 部分更新并持久化）。 | 客户端可读/写画布。 |
| **WO-604** | Agent 写回 Canvas | WO-602, 现有规划 | 在 runAgentLoop 中：有规划时每步/每轮结束后更新 Canvas（goal、steps、currentStepIndex、artifacts）；提供 `updateCanvasFromPlan` 辅助。 | 规划/多步执行中画布与进度同步。 |
| **WO-605** | Skill 类型定义与 schema | 无 | 定义 Skill 类型：name, description, inputSchema, 执行入口（scriptPath 或 type: "script"|"http"）；与 ToolDef 兼容的形态。 | 类型可被加载与执行器使用。 |
| **WO-606** | 本地 Skill 目录加载 | WO-605 | 从 `workspace/.rzeclaw/skills/` 或配置路径加载 `*.json`；解析为 Skill[]；白名单：仅此目录。 | 配置/目录下的 skill 可被枚举。 |
| **WO-607** | Skill 执行器 | WO-605, WO-606 | 执行 script 类 Skill：cwd 限定 workspace，子进程或 spawn；返回 stdout/err 或结构化 ToolResult。 | 调用 skill 可执行并得到结果。 |
| **WO-608** | Skill 转为 Agent Tool | WO-605, WO-607 | 将已加载 Skill[] 转为 ToolDef[]（name, description, inputSchema, handler 委托执行器）；导出 `getSkillTools(workspace, config)`。 | Agent 可把 Skill 当工具调用。 |
| **WO-609** | MCP 配置项与连接入口 | 无 | 配置 `mcp.servers: [{ name, command }]` 或 url；加载到 config；提供「按 name 连接」的入口。 | 配置可声明 MCP Server。 |
| **WO-610** | MCP 客户端连接与 list_tools | WO-609 | 使用 @modelcontextprotocol/sdk 连接（stdio 或 HTTP）；请求 tools/list，得到 Tool 列表。 | 可拉取 MCP 暴露的 tools。 |
| **WO-611** | MCP 工具调用与结果回传 | WO-610 | 对 MCP Tool 发起 call_tool，参数与结果按协议回传；单次调用 API。 | 调用 MCP 工具返回结果。 |
| **WO-612** | MCP Tools 转为 Agent Tool 形态 | WO-610, WO-611 | 将 MCP Tool 列表转为 ToolDef[]（name, description, inputSchema, handler 内调 MCP call_tool）；命名空间避免与 CORE/Skill 冲突。 | 与 CORE、Skill 同构，可合并。 |
| **WO-613** | 统一工具列表合并 | WO-608, WO-612 | `getMergedTools(config, workspace)`：合并 CORE_TOOLS + getSkillTools + getMcpTools；返回统一 ToolDef[]。 | 一份列表包含三类工具。 |
| **WO-614** | 工具调用路由 | WO-613 | runAgentLoop 使用 getMergedTools；getTool 扩展为「按来源路由」：CORE -> 现有 getTool；Skill -> Skill 执行器；MCP -> MCP client call_tool。 | 模型调用任一来路工具均正确执行。 |
| **WO-615** | Heartbeat 配置项 | 无 | `heartbeat.intervalMinutes`（0=关闭）、`heartbeat.checklistPath`（如 HEARTBEAT.md）；config 加载与默认值。 | 配置可开关与指定清单。 |
| **WO-616** | Heartbeat 定时器与单次 tick | WO-615 | Gateway 或入口处：若 intervalMinutes>0 则 setInterval 触发「单次 heartbeat tick」；暴露 `runHeartbeatTick(config)`。 | 定时可唤醒一次 Heartbeat。 |
| **WO-617** | Heartbeat Orient | WO-615, WO-616 | 单次 tick 内：加载身份/策略（AGENTS.md 或 checklistPath 文件内容）供后续 Check/Act 使用。 | 有明确的「上下文」输入。 |
| **WO-618** | Heartbeat Check | WO-617, WO-602 | 读取待办/清单（checklistPath 或 canvas）；可选：调用轻量 LLM 判断「是否有需要执行的事项」。 | 可得到「待办项」或「无需执行」。 |
| **WO-619** | Heartbeat Act | WO-618 | 若有待办且策略允许：调用 runAgentLoop（输入为清单一条或生成的计划）或单步工具执行。 | 可自动执行一项任务。 |
| **WO-620** | Heartbeat Record | WO-619, 记忆/Canvas | 将执行结果/摘要写回记忆或指定文件；可选写回 Canvas；便于下一轮或用户查看。 | 有持久化输出。 |
| **WO-621** | 任务/目标体系与持久化 | WO-602 | 任务结构（如 taskId, title, status, source）；持久化到 tasks.json 或复用 Canvas；支持「从 HEARTBEAT.md/清单解析」或用户维护。 | 有结构化任务可读。 |
| **WO-622** | 需求推断与提议生成 | WO-621, 记忆 | 统一入口 `runProactiveInference(config, { trigger, workspace })`：输入任务+记忆+上下文，输出 `{ proposals, suggestions }`（建议列表、待决策项）；可用 LLM 或规则。 | 一次推断得到提议列表。 |
| **WO-623** | 多触发源接入 | WO-616, WO-622 | 触发源：① 定时（Heartbeat tick 内调用 runProactiveInference）；② 事件（占位：文件变更/长时间未用）；③ 显式（Gateway method proactive.suggest 或 session.getOrCreate 时可选跑一次）。 | 至少定时+显式两种触发可用。 |
| **WO-624** | 提议与执行分离 | WO-622, WO-623 | 主动输出仅为「提议」；执行（写文件、发邮件等）需用户确认或授权；文档与接口标明 isProposal；Gateway 返回 proposals 不自动执行。 | 主动侧不擅自执行敏感操作。 |
| **WO-625** | Skill 安全与白名单 | WO-606 | Skill 仅从配置的目录加载；执行 cwd 限定 workspace；文档说明安全边界。 | 无任意路径执行。 |
| **WO-626** | 配置与文档对齐 | WO-609, WO-615, WO-621 | CONFIG_REFERENCE 或 README 补充：heartbeat、canvas、skills、mcp、proactive 配置项与示例。 | 配置有据可查。 |

---

## 二、建议实现顺序（按依赖）

1. **Canvas 基础**：WO-601 → WO-602 → WO-603 → WO-604  
2. **Skill**：WO-605 → WO-606 → WO-607 → WO-608  
3. **MCP**：WO-609 → WO-610 → WO-611 → WO-612  
4. **工具合并与路由**：WO-613 → WO-614  
5. **Heartbeat**：WO-615 → WO-616 → WO-617 → WO-618 → WO-619 → WO-620  
6. **主动机制**：WO-621 → WO-622 → WO-623 → WO-624  
7. **安全与文档**：WO-625 → WO-626  

---

## 三、依赖关系简图

```
WO-601 → WO-602 → WO-603
              ↓
         WO-604 (Agent 写回)
WO-605 → WO-606 → WO-607 → WO-608 ─┐
WO-609 → WO-610 → WO-611 → WO-612 ─┼→ WO-613 → WO-614 (合并+路由)
CORE_TOOLS ────────────────────────┘
WO-615 → WO-616 → WO-617 → WO-618 → WO-619 → WO-620 (Heartbeat)
WO-621 → WO-622 → WO-623 → WO-624 (主动推理与多触发)
WO-625, WO-626 (安全与文档)
```

---

## 四、与设计文档的对应

| 设计块 | 工单 |
|--------|------|
| 4.1 Skill 抽象、本地加载、MCP 客户端、工具合并与路由、安全 | WO-605～608, WO-609～614, WO-625 |
| 4.2 Heartbeat 入口、配置、Orient/Check/Act/Record | WO-615～620 |
| 4.3 Live Canvas 状态、持久化、Gateway API、Agent 写回 | WO-601～604 |
| 6.3 / 6.4 统一主动推理、多触发源、任务与需求推断、提议与执行分离 | WO-621～624, WO-626 |

---

*本文档为 Phase 6 实施的唯一工单来源，实现时按上表顺序执行，避免遗漏。*
