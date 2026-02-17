# IDE/PC 操作能力 — 统一实施计划与工单

本文档基于 `IDE_AND_PC_OPERATION_DESIGN.md` 的设计，将方案**统一整理**为可执行的**实施计划**与**实现工单**，并按优先级顺序实施。

---

## 一、方案统一整理（设计摘要）

### 1.1 目标与原则

- **目标**：在用户授权范围内，让助手能通过终端/脚本、非模拟协议（CLI/LSP/DAP/扩展）、以及可选的 UI 自动化/键鼠，完成对 IDE 与主机的操作。
- **原则**：语义 > 结构 > 物理；终端/脚本优先；L2/L3 默认关闭、显式启用；可观测、可审计、可归属。

### 1.2 能力分层与选型顺序

| 层级 | 能力 | 实现形态 | 优先级 |
|------|------|----------|--------|
| **L1** | 终端/脚本、IDE CLI、run_script 语义 | bash、process、usageHint/Bootstrap | P0 已有+巩固 |
| **非模拟** | IDE CLI、LSP、DAP、扩展/API、工作区文件驱动 | bash 调用、MCP/Skill、未来 ide_lsp/ide_dap | P0 文档化；P1 可选 MCP |
| **可观测** | 统一结果结构、env_summary、审计 | ToolResult 扩展、新工具、审计格式 | P0 |
| **策略** | ideOperation 配置、超时、确认策略 | config、loop 包装 | P0 |
| **L2** | 程序化 UI（ui_describe/ui_act/ui_focus） | 新工具或 MCP，Windows UIA 先 | P2 |
| **L3** | 键鼠/视觉 | 按需、单独开关 | P3 |

### 1.3 与现有架构的衔接

- **配置**：`RzeclawConfig` 增加 `ideOperation?: IdeOperationConfig`。
- **工具**：新能力以新 `ToolDef` 或 MCP 接入，经 `getMergedTools` 合并；`ToolResult`/`ToolDef` 扩展可选字段，保持向后兼容。
- **执行**：在 `runAgentLoop` 中统一包装超时、可选确认策略、结构化审计写入；工具 handler 返回可含 `state_snapshot`、`suggested_next` 等，由 loop 序列化进 tool_result content。

---

## 二、实施阶段划分

| 阶段 | 内容 | 工单范围 |
|------|------|----------|
| **Phase A：基础与契约** | 配置、类型扩展、超时、审计格式 | WO-IDE-001 ～ 003、006 |
| **Phase B：L1 巩固与能力发现** | IDE CLI 文档化、env_summary、bash 增强 | WO-IDE-004、005 |
| **Phase C：策略与可观测** | 确认策略、dry-run（可选）、结果统一序列化 | WO-IDE-007、008 |
| **Phase D：L2 UI 自动化** | ui_describe/ui_act/ui_focus（Windows UIA 先） | WO-IDE-010+ |
| **Phase E：后续可选** | L3、意图路由、账本/撤销、异步 | 后续工单 |

---

## 三、实现工单列表

工单按**执行顺序/优先级**排列；依赖关系在「依赖」列注明。

| 工单 ID | 标题 | 阶段 | 依赖 | 状态 | 说明 |
|---------|------|------|------|------|------|
| **WO-IDE-001** | ideOperation 配置类型与加载 | A | - | ✅ 已实现 | 在 config 中增加 IdeOperationConfig；loadConfig 解析 uiAutomation、keyMouse、visualClick、allowedApps、timeoutMs、confirmPolicy 等。 |
| **WO-IDE-002** | ToolResult / ToolDef 类型扩展 | A | - | ✅ 已实现 | ToolResult 可选 state_snapshot、channel_used、suggested_next、undoHint、asyncHandle；ToolDef 可选 version、deprecated、supportsDryRun、supportsUndo、timeoutMs。保持向后兼容。 |
| **WO-IDE-003** | 工具执行超时包装 | A | 001, 002 | ✅ 已实现 | 在 runAgentLoop 中根据 config.ideOperation?.timeoutMs 或 ToolDef.timeoutMs 包装 tool.handler，超时则返回明确错误与 partial 输出。 |
| **WO-IDE-004** | Bash 的 IDE CLI usageHint 与 run_script 语义 | B | - | ✅ 已实现 | 在 bash 的 usageHint 中明确 code/idea 等 IDE CLI 用法；可选在 description/examples 中增加「执行脚本文件」示例。 |
| **WO-IDE-005** | env_summary 工具 | B | - | ✅ 已实现 | 新增 env_summary 工具：返回当前 workspace、cwd（即 workspace）、可选 platform；为后续「焦点窗口」等预留扩展点。 |
| **WO-IDE-006** | 结构化操作审计格式 | A | 002 | ✅ 已实现 | 定义操作日志条目格式 (op_id, tool, args, result_summary, channel_used?, ts)；在 loop 中工具调用后写入 .rzeclaw/ops.log。 |
| **WO-IDE-007** | 确认策略与执行前检查 | C | 001, 006 | ✅ 已实现 | 根据 ideOperation.confirmPolicy 在执行前判断是否需用户确认；若需确认则返回「待确认」占位结果（不执行）。 |
| **WO-IDE-008** | 统一结果序列化与 suggested_next | C | 002, 003 | ✅ 已实现 | 在 loop 中若 ToolResult 含 state_snapshot/suggested_next，将其序列化进 tool_result content（如尾部 [state_snapshot]/[suggested_next]），供模型使用。 |
| **WO-IDE-009** | L2 能力开关与 allowedApps 检查 | D | 001 | ✅ 已实现 | 仅在 ideOperation.uiAutomation === true 且 Windows 时注册 ui_*；ui_act/ui_focus 内检查 allowedApps。 |
| **WO-IDE-010** | L2 Windows UIA：ui_describe / ui_act / ui_focus | D | 009 | ✅ 已实现 | Windows 下通过 PowerShell + .NET UIA 实现 ui_describe（窗口列表）、ui_act（Invoke/Value）、ui_focus（SetForegroundWindow）。 |
| **WO-IDE-011** | dry-run：bash / edit / write 支持预览不执行 | E | 002 | ✅ 已实现 | 为三工具增加可选 dryRun 参数；为 true 时返回将要执行的内容摘要，不实际执行。 |
| **WO-IDE-012** | 操作账本扩展与 undoHint | E | 006, 002 | ✅ 已实现 | op_log 条目增加 undo_hint；edit/write 成功时返回 undoHint；loop 写入审计时带 undo_hint。 |
| **WO-IDE-013** | undo_last 工具 | E | 012 | ✅ 已实现 | 新增 undo_last：从 ops.log 取最近一条带 undo_hint 并执行逆操作（edit/write handler）。 |
| **WO-IDE-014** | 可重放 replay_ops | E | 006 | ✅ 已实现 | createReplayOpsTool(baseTools) 在 merged 中注入；参数 last，从 ops.log 最近 N 条依次重放。 |
| **WO-IDE-015** | 异步长时操作与 operation_status | E | 002 | ✅ 已实现 | bash 支持 async 返回 asyncHandle；operation_status(handle) 查询；async-ops 存储与退出更新。 |
| **WO-IDE-016** | L3 键鼠模拟（Windows） | E | 001 | ✅ 已实现 | ideOperation.keyMouse 且 Windows 时注册 keymouse；当前前台进程校验 allowedApps；SendKeys 发送。 |

---

## 四、工单详细说明（供实现参考）

### WO-IDE-001：ideOperation 配置类型与加载

- **类型**：`IdeOperationConfig = { uiAutomation?: boolean; keyMouse?: boolean; visualClick?: boolean; allowedApps?: string[]; timeoutMs?: number; confirmPolicy?: { tools?: string[]; requireConfirm?: boolean } }`。
- **默认**：不配置时 L2/L3 均不启用；timeoutMs 默认可由全局如 60000。
- **加载**：在 `loadConfig` 的 `data.ideOperation` 分支中解析并写入 `config.ideOperation`。

### WO-IDE-002：ToolResult / ToolDef 类型扩展

- **ToolResult**：在现有 `{ ok, content } | { ok: false, error, code?, suggestion? }` 上增加可选 `state_snapshot?: string; channel_used?: string; suggested_next?: string; undoHint?: { tool: string; args: Record<string, unknown> }; asyncHandle?: string`。
- **ToolDef**：增加可选 `version?: string; deprecated?: string; supportsDryRun?: boolean; supportsUndo?: boolean; timeoutMs?: number`。
- **兼容**：所有现有 handler 不返回新字段、不设置新 ToolDef 属性时行为不变。

### WO-IDE-003：工具执行超时包装

- **位置**：`agent/loop.ts` 中调用 `tool.handler` 处。
- **逻辑**：使用 `AbortSignal` + `setTimeout` 或 `Promise.race`，超时时间取 `config.ideOperation?.timeoutMs ?? tool.timeoutMs ?? 60000`；超时后 reject 并 catch 为 `ToolResult` 错误，content 可含 partial 输出（若 bash 已收集部分 stdout/stderr 可一并返回）。

### WO-IDE-004：Bash IDE CLI usageHint

- **修改**：`tools/bash.ts` 的 `usageHint` 增加一句：可用 `code`（VS Code）、`idea`/`webstorm`（JetBrains）等在 workspace 打开项目/文件；执行脚本可用 `node scripts/foo.js` 或 `bash scripts/foo.sh`。
- **可选**：在 `examples` 中增加一条 `command: "code ."` 或 `command: "node scripts/build.js"`。

### WO-IDE-005：env_summary 工具

- **新文件**：`tools/env-summary.ts`（或合并在某工具模块）。
- **工具名**：`env_summary`。
- **参数**：无或 `{}`。
- **返回**：`{ ok: true, content: "workspace: <path>\ncwd: <workspace>\nplatform: win32|darwin|linux" }`；后续可扩展「焦点窗口」「LSP 检测」等。

### WO-IDE-006：结构化操作审计

- **格式**：每行 JSON：`{ "op_id": "<uuid>", "tool": "<name>", "args": {...}, "result_ok": boolean, "result_summary": "<short>", "channel_used": "<optional>", "ts": "<iso>" }`。
- **写入**：在 loop 中每次工具调用完成后，追加到 `workspace/.rzeclaw/ops.log`（或复用现有 audit 路径）；op_id 由 loop 生成并可在 tool_result 中省略（或简短返回）。

### WO-IDE-007、008、009、010

- **007**：在执行 tool.handler 前，若 config.ideOperation?.confirmPolicy 要求该工具需确认，则先不执行，返回 content 为「该操作需用户确认，请用户批准后再试」的 tool_result。
- **008**：在构造 tool_result content 时，若 `result.state_snapshot` 或 `result.suggested_next` 存在，追加到 content 末尾（如 `\n[state_snapshot]\n...` 或一行 JSON）。
- **009**：L2 工具注册时若 `!config.ideOperation?.uiAutomation` 则不注册；ui_act 内检查目标窗口/应用是否在 allowedApps。
- **010**：实现 Windows UIA 的 ui_describe、ui_act、ui_focus（可单独 MCP 或 src/tools 下新模块），依赖 009 的开关与白名单。

---

## 五、执行顺序与当前批次

**建议实现顺序**：WO-IDE-001 → WO-IDE-002 → WO-IDE-003 → WO-IDE-006 → WO-IDE-004 → WO-IDE-005 → WO-IDE-008 → WO-IDE-007 → …  

**当前批次（先做）**：001～006；007～010 已完成。**Phase E**：011～016 按依赖顺序实施（011 → 012 → 013 → 014；015、016 可并行或后续）。

### Phase E 工单说明（WO-IDE-011～016）

- **011 dry-run**：bash 返回 "[dry-run] Would run: <command>"；edit 返回将替换的摘要；write 返回将写入的 path 与长度/摘要；不写盘、不执行命令。
- **012 undo_hint**：OpLogEntry 增加 `undo_hint?: { tool: string; args: Record<string, unknown> }`；edit 成功时 result.undoHint = { tool: "edit", args: { path, old_string: newStr, new_string: oldStr } }；write 成功时若文件原已存在则 result.undoHint = { tool: "write", args: { path, content: previousContent } }；loop 写入 appendOpLog 时若 result.undoHint 存在则写入 entry.undo_hint。
- **013 undo_last**：工具从 .rzeclaw/ops.log 末尾向前找最近一条含 undo_hint 的条目，以 undo_hint.tool 与 undo_hint.args 调用对应 handler，返回执行结果。
- **014 replay_ops**：工厂 getReplayOpsTool(config) 返回工具，handler 内 getMergedTools、读 ops.log、取最近 last 条，按序调用各 entry.tool 的 handler(entry.args, cwd)，汇总结果返回。
- **015 async**：bash 支持 async: true 时 spawn 后立即返回 asyncHandle（pid），后台收集 stdout/stderr 并在进程退出时写入共享 Map；operation_status(handle) 查询该 Map 返回 running/exitCode/output。
- **016 keymouse**：Windows 下 PowerShell 获取当前前台窗口进程名，校验 allowedApps，再通过 SendKeys 或 SendInput 发送键序列；仅当 ideOperation.keyMouse 时注册。

---

*本文档与 `IDE_AND_PC_OPERATION_DESIGN.md` 配套；工单实现状态以代码与提交为准。*
