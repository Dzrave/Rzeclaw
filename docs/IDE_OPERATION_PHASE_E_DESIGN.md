# IDE/PC 操作 Phase E — 详细设计规范

本文档为 **IDE/PC 操作能力 Phase E**（工单 WO-IDE-011～016）的**详细设计规范**：dry-run、操作账本与 undo、replay、异步长时操作、L3 键鼠模拟的范围、接口与行为边界。Phase E 在实施计划中为「后续可选」阶段；当前实现状态见 `IDE_OPERATION_IMPLEMENTATION_PLAN.md`（011～016 已实现）。本文档作为该阶段的**设计锚点**，便于验收、扩展与与其它设计对齐；**不包含新的实施计划与工单**。

**设计依据**：`docs/IDE_AND_PC_OPERATION_DESIGN.md`、`docs/IDE_OPERATION_IMPLEMENTATION_PLAN.md` Phase E 说明。

---

## 一、目标与范围

### 1.1 Phase E 定位

- **Phase A～D**：配置与契约、L1 巩固、策略与可观测、L2 UI 自动化（UIA）。
- **Phase E**：在 L2 基础上增加「可逆性与可重放」「长时任务不阻塞」「L3 键鼠兜底」等可选能力，提升体验与可控性。

### 1.2 设计目标

| 工单 | 目标 |
|------|------|
| **WO-IDE-011** | bash / edit / write 支持 **dryRun** 参数：为 true 时仅返回将要执行的内容摘要，不写盘、不执行命令。 |
| **WO-IDE-012** | 操作账本（ops.log）条目增加 **undo_hint**；edit/write 成功时返回 **undoHint**，loop 写入审计时带 undo_hint。 |
| **WO-IDE-013** | 新增 **undo_last** 工具：从 ops.log 取最近一条带 undo_hint 的条目，执行其逆操作并返回结果。 |
| **WO-IDE-014** | **replay_ops**：从 ops.log 取最近 N 条操作按序重放（由 getMergedTools 注入，如 replay_ops(last)）。 |
| **WO-IDE-015** | **bash async**：bash 支持 `async: true`，spawn 后立即返回 **asyncHandle**；**operation_status(handle)** 查询运行状态/退出码/输出。 |
| **WO-IDE-016** | **L3 keymouse**：在 Windows 下、且 `ideOperation.keyMouse === true` 时注册 **keymouse** 工具；校验当前前台窗口在 allowedApps 后发送键序列。 |

### 1.3 范围边界

| 在范围内 | 在范围外 |
|----------|----------|
| dryRun 的语义、各工具返回格式；undo_hint 的结构与逆操作定义；replay 顺序与错误处理；async 句柄与 operation_status 契约；keymouse 的 allowedApps 与发送方式 | 跨会话 undo、多步 undo 栈、replay 的条件过滤（仅按 last N）；macOS/Linux 的 keymouse 实现细节 |
| 与现有 ToolResult/ToolDef、ops.log、confirmPolicy 的兼容 | 新 IDE 协议（LSP/DAP）工具 |

---

## 二、WO-IDE-011：dry-run

### 2.1 语义

- **bash**：`dryRun: true` 时，不执行 command，返回 `[dry-run] Would run: <command>`（或等价文案），不写盘、不 spawn 进程。
- **edit**：`dryRun: true` 时，不修改文件，返回将要替换的摘要（如 old_string 与 new_string 的片段、path），不写盘。
- **write**：`dryRun: true` 时，不写文件，返回将要写入的 path、内容长度或摘要，不写盘。

### 2.2 接口

- 三工具在 inputSchema 中增加可选 `dryRun?: boolean`；handler 内若 `args.dryRun === true` 则走上述逻辑并返回 `{ ok: true, content: "..." }`。
- ToolResult 无需新增字段；content 为人类可读摘要即可。ops.log 若记录 dry-run 调用，建议标记 `dry_run: true`，便于与真实操作区分。

### 2.3 与安全策略的关系

- dry-run 不触发危险命令执行，但仍可被 dangerousCommands 策略拦截（即「将要执行的命令」若命中危险模式，可返回「若执行将被拒绝」的说明）。实施时可选：dry-run 仅做字符串返回，不做策略检查；或做策略检查以提前告知用户。

---

## 三、WO-IDE-012 / 013：undo_hint 与 undo_last

### 3.1 undo_hint 结构

- **OpLogEntry** 增加可选 `undo_hint?: { tool: string; args: Record<string, unknown> }`。
- **edit** 成功时：`result.undoHint = { tool: "edit", args: { path, old_string: newStr, new_string: oldStr } }`（即逆替换）。
- **write** 成功时：若文件原已存在，则读取原内容并设 `result.undoHint = { tool: "write", args: { path, content: previousContent } }`；若为新建文件，可选不返回 undoHint 或返回「删除文件」的占位（若支持 delete 工具）。
- **loop**：在 appendOpLog 时，若 tool 返回了 undoHint，则写入 entry.undo_hint。

### 3.2 undo_last 行为

- **输入**：无参数或 `{}`。
- **逻辑**：从 workspace/.rzeclaw/ops.log 末尾向前扫描，取**最近一条**含 `undo_hint` 的条目；以 `undo_hint.tool` 与 `undo_hint.args` 调用对应工具的 handler，返回执行结果。
- **边界**：若无任何带 undo_hint 的条目，返回错误（如 "No undoable operation found"）。不删除 ops 条目；仅执行逆操作，逆操作本身会再 append 一条 op（可选在 entry 中标记 `is_undo: true` 避免形成循环）。

---

## 四、WO-IDE-014：replay_ops

### 4.1 语义

- 从 ops.log 取**最近 N 条**操作（按时间顺序），依次按 `entry.tool` 与 `entry.args` 调用对应 handler，汇总结果返回。
- **参数**：`last: number`（默认如 5），表示重放最近几条。
- **顺序**：按 ops.log 中从旧到新的顺序执行（先执行较早的 op，再执行较晚的），以符合「重放历史」的语义。

### 4.2 接口与注入

- **工厂**：`createReplayOpsTool(baseTools)` 或等价：依赖 baseTools 与 ops.log 读取，返回一个 ToolDef，name 如 `replay_ops`，handler 内读 ops、取 last N、循环调用 baseTools 中匹配的 handler。
- **注册**：在 getMergedTools 中注入该工具（与 replay_ops 文档一致），使 Agent 与 Gateway 均可调用。

### 4.3 错误与边界

- 若某条 op 的 tool 不在当前 baseTools 中，可跳过并记录在结果中，或返回错误。若某条执行失败，可中止并返回已执行条数及错误信息，或继续执行并汇总失败；设计上建议**可配置或固定为「遇失败即中止并返回」**，避免半截重放。

---

## 五、WO-IDE-015：异步长时操作与 operation_status

### 5.1 bash async

- **参数**：`async?: boolean`；为 true 时，bash 不等待进程结束，spawn 后即返回。
- **返回**：`{ ok: true, content: "...", asyncHandle: "<handle>" }`；handle 可为 pid 或内部生成的 UUID，用于后续查询。
- **后台行为**：进程在后台运行，stdout/stderr 收集到内存或临时存储；进程退出时更新该 handle 对应的状态（running → exited，并记录 exitCode、output）。

### 5.2 operation_status

- **参数**：`handle: string`（即 asyncHandle）。
- **返回**：`{ status: "running" | "exited", exitCode?: number, output?: string }` 或等价；若 handle 不存在或已过期，返回错误。
- **存储**：async 任务元数据需在进程内维护（如 Map<handle, { status, exitCode?, output? }>）；进程退出时可选将未完成的 handle 写入 workspace 下持久化，以便重启后仍可查询（实施时可选）。

### 5.3 边界

- 不定义「最大并发 async 数」；实施时可设上限避免资源耗尽。过期 handle 的清理策略（如 24 小时后移除）可在实现中约定。

---

## 六、WO-IDE-016：L3 键鼠模拟（Windows）

### 6.1 条件

- 仅当 `config.ideOperation?.keyMouse === true` 且当前平台为 Windows 时注册 **keymouse** 工具。
- **allowedApps**：执行前获取当前前台窗口的进程名/标题，校验是否在 `ideOperation.allowedApps` 白名单中；不在则拒绝并返回错误。

### 6.2 接口

- **参数**：如 `keys: string`（键序列，如 "Ctrl+S"、"Enter"）或结构化序列；具体格式由实现定（如 SendKeys 风格）。
- **行为**：通过 Windows API（如 SendInput 或 PowerShell SendKeys）将键序列发送到当前焦点窗口；不移动鼠标（若需鼠标可单独工具或后续扩展）。

### 6.3 安全与审计

- 每次调用写 ops.log，tool 为 keymouse，args 可脱敏（如只记录 keys 长度或类型）；allowedApps 校验失败也记录。与 confirmPolicy 兼容：若 keymouse 在需确认列表中，则执行前返回 REQUIRES_CONFIRMATION。

---

## 七、与现有组件的衔接

- **ToolResult / ToolDef**：undoHint、asyncHandle 已在 Phase A/B 的类型扩展中；Phase E 仅实现具体工具的返回与消费。
- **ops.log**：格式扩展 undo_hint、可选 dry_run、is_undo 等字段；与现有 appendOpLog 兼容。
- **getMergedTools**：注入 replay_ops、keymouse（条件满足时）；与 CORE_TOOLS、Skill、MCP、L2 工具并列。
- **confirmPolicy**：undo_last、replay_ops、keymouse 可列入 confirmPolicy.tools，按需确认。

---

## 八、小结

| 工单 | 设计要点 |
|------|----------|
| **011** | dryRun 参数；bash/edit/write 仅返回摘要不执行。 |
| **012** | ops 条目与 edit/write 返回带 undo_hint；loop 写入 undo_hint。 |
| **013** | undo_last 从 ops 取最近一条带 undo_hint 并执行逆操作。 |
| **014** | replay_ops(last) 按序重放最近 N 条 op；getMergedTools 注入。 |
| **015** | bash async + asyncHandle；operation_status(handle) 查询。 |
| **016** | keymouse 仅在 keyMouse 且 Windows 时注册；allowedApps 校验。 |

本文档为 Phase E 的详细设计规范，**不包含新的实施计划与工单**；实现状态与工单列表见 `IDE_OPERATION_IMPLEMENTATION_PLAN.md`。
