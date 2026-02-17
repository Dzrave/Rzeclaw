# 安全与隐私实施计划与工单

本文档基于 **`docs/SECURITY_AND_PRIVACY_DESIGN.md`** 的设计，给出分阶段实施计划与可执行工单。工单编号格式：**WO-SEC-xxx**（安全与隐私专项）。

---

## 一、阶段划分

| 阶段 | 主题 | 目标 |
|------|------|------|
| **Phase A** | 非破坏性：危险命令与 process 保护 | 原则一落地，Bash 危险命令策略、process kill 保护、执行后风险标记 |
| **Phase B** | 隐私：脱敏与沙盒 | 原则三落地，ops/导出脱敏、隐私会话与沙盒、sessionFlags.privacy |
| **Phase C** | 权限模型与会话授权 | 原则二落地，权限域、默认策略、会话/临时授权与交互 |
| **Phase D** | 事后检查与纠正 | 原则一收尾，self-check 风险扫描、纠正入口与提示 |

---

## 二、工单列表

### Phase A：非破坏性 — 危险命令与 process 保护

| 工单 | 标题 | 范围 | 验收标准 | 依赖 |
|------|------|------|----------|------|
| **WO-SEC-001** | 危险命令策略配置与内置规则集 | 在 config 中新增 `security.dangerousCommands`：`mode`: block \| confirm \| dryRunOnly；可选 `patterns` 覆盖/扩展。内置规则：`rm -rf` 根路径、`format`、`del /f/s/q`、`mkfs`、`dd` 等危险模式。 | 配置可加载；存在默认危险模式列表；可配置 mode 与自定义 patterns。 | 无 |
| **WO-SEC-002** | Bash 执行前危险命令检测与策略执行 | 在 bash 工具执行前（或 validation 层）调用「危险命令检测」：若命中且 mode=block 则直接返回错误；mode=confirm 则返回 REQUIRES_CONFIRMATION（与现有 confirmPolicy 统一）；mode=dryRunOnly 则仅允许 dryRun 为 true 的调用。 | 危险命令在 block 时无法执行；confirm 时走确认流程；dryRunOnly 时非 dryRun 调用被拒。 | WO-SEC-001 |
| **WO-SEC-003** | process kill 保护与可选确认 | 配置项 `security.processKillRequireConfirm` 或 `security.protectedPids`（可选）。kill 执行前：若 pid 在保护集则拒绝；若需确认则返回 REQUIRES_CONFIRMATION。 | 保护 pid 或「需确认」时 kill 不直接执行，需用户确认或配置允许。 | 无 |
| **WO-SEC-004** | 操作日志风险分级与执行后标记 | 在 appendOpLog 时或后，对本次 tool/args/result 做风险分类（low/medium/high），写入 OpLogEntry 的 `risk_level` 字段（可选，兼容旧条目）。规则：危险命令执行、kill、write/edit 系统路径等可标 high。 | ops.log 新条目可含 risk_level；self-check 或后续可读。 | WO-SEC-001, WO-SEC-002 |

### Phase B：隐私 — 脱敏与沙盒

| 工单 | 标题 | 范围 | 验收标准 | 依赖 |
|------|------|------|----------|------|
| **WO-SEC-005** | ops.log 与审计导出脱敏 | 写入 ops.log 前对 `args`、`result_summary` 做敏感脱敏（复用或引用 sanitizeForMemory 的规则）；audit-export 输出时对敏感字段做过滤或占位。 | ops 与导出结果中不出现明文 API Key、password、明显路径等。 | 无 |
| **WO-SEC-006** | 隐私会话标记与存储策略 | 支持会话级 `sessionFlags.privacy`（Gateway params、CLI 参数或用户首句触发）。当 privacy=true：不写入 L1 记忆；可选不写入会话快照或写入隔离区。 | 隐私会话内 L1 不写入；快照策略可配置（不持久化或隔离）。 | 无 |
| **WO-SEC-007** | 隐私沙盒：工具与记忆策略 | 隐私模式下可选「仅允许只读工具」（read、env_summary）或「禁止 write/edit/bash/process」；隐私会话内容不参与全局记忆检索。 | 配置或默认下，隐私会话内可限制工具集；检索不返回隐私会话数据。 | WO-SEC-006 |
| **WO-SEC-008** | 快照与会话持久化的隐私处理 | 若会话为隐私，快照不落盘或落盘到临时/加密区并设定生命周期（如会话结束删除）。Gateway 内存会话在隐私模式下不将消息写入可导出区。 | 隐私会话的持久化与导出符合「不泄露」策略。 | WO-SEC-006 |

### Phase C：权限模型与会话授权

| 工单 | 标题 | 范围 | 验收标准 | 依赖 |
|------|------|------|----------|------|
| **WO-SEC-009** | 权限域定义与默认策略配置 | 定义 scope：file_read、file_write、bash、process_kill、ui_automation、keymouse；config 中 `security.permissionScopes` 每 scope 默认 allow \| confirm \| deny。工具与 scope 映射表。 | 配置可读；执行前可查询「该工具对应 scope 的当前策略」。 | 无 |
| **WO-SEC-010** | 会话级授权（本次会话允许某 scope） | 运行时维护「本会话已授权 scope 列表」（内存，不落盘）。当工具需 confirm 时，若该 scope 已在会话授权列表中则不再弹确认直接执行。Gateway 需在确认 UI/流程中支持「允许本次会话」并写入会话状态。 | 用户选择「本次会话允许」后，同 scope 在本会话内不再询问。 | WO-SEC-009 |
| **WO-SEC-011** | 与现有 confirmPolicy 的兼容与迁移 | 将现有 `ideOperation.confirmPolicy.tools` 映射到 scope（如 write/edit → file_write）；若某工具在 confirmPolicy 中则其 scope 视为 confirm。保留原有配置语义。 | 现有 confirm 行为不变；新配置可与 permissionScopes 共存或逐步迁移。 | WO-SEC-009 |
| **WO-SEC-012** | 定时授权（可选） | 配置 `security.scheduledGrants`：如某 scope 在指定时间窗口内为 allow。执行前检查当前时间是否在窗口内。 | 可选实现；若实现则按时段自动放宽/收紧权限。 | WO-SEC-009 |

### Phase D：事后检查与纠正

| 工单 | 标题 | 范围 | 验收标准 | 依赖 |
|------|------|------|----------|------|
| **WO-SEC-013** | self-check 增加「最近操作风险」扫描 | self-check 读取最近 N 条 ops.log；若存在 risk_level=high 的条目，在检查结果中增加一项「存在高风险操作，建议检查工作区或执行 undo_last」并输出建议。 | 自检能发现近期高风险操作并给出可操作建议。 | WO-SEC-004 |
| **WO-SEC-014** | 纠正入口与文档 | 在 USAGE_AND_VERIFICATION 或 SELF_CHECK 文档中增加「发现高风险操作后如何纠正」（undo_last、replay_ops、检查 workspace）；Gateway/CLI 可在会话结束若存在 high 风险时输出简短提示。 | 文档与可选运行时提示闭环「检查与纠正」。 | WO-SEC-013 |

---

## 三、实施顺序建议

1. **Phase A**：WO-SEC-001 → WO-SEC-002 → WO-SEC-003 → WO-SEC-004（先配置与检测，再执行层与日志）。
2. **Phase B**：WO-SEC-005（脱敏可独立）→ WO-SEC-006 → WO-SEC-007 → WO-SEC-008（先标记与会话策略，再沙盒与持久化）。
3. **Phase C**：WO-SEC-009 → WO-SEC-011（兼容）→ WO-SEC-010（会话授权）→ WO-SEC-012（可选）。
4. **Phase D**：WO-SEC-004 完成后 → WO-SEC-013 → WO-SEC-014。

---

## 四、配置形态摘要（供实现参考）

```json
{
  "security": {
    "dangerousCommands": {
      "mode": "confirm",
      "patterns": []
    },
    "processKillRequireConfirm": true,
    "protectedPids": [],
    "permissionScopes": {
      "file_read": "allow",
      "file_write": "confirm",
      "bash": "allow",
      "process_kill": "confirm",
      "ui_automation": "confirm",
      "keymouse": "confirm"
    },
    "scheduledGrants": []
  },
  "sessionFlags": {
    "privacy": false
  }
}
```

会话级授权（sessionGrants）仅存内存，不写入上述 config。

---

## 五、工单状态跟踪（建议）

| 工单 | 状态 | 备注 |
|------|------|------|
| WO-SEC-001 | 已完成 | |
| WO-SEC-002 | 已完成 | |
| WO-SEC-003 | 已完成 | |
| WO-SEC-004 | 已完成 | |
| WO-SEC-005 | 已完成 | |
| WO-SEC-006 | 已完成 | |
| WO-SEC-007 | 已完成 | |
| WO-SEC-008 | 已完成 | |
| WO-SEC-009 | 已完成 | |
| WO-SEC-010 | 部分完成 | runAgentLoop 已支持 sessionGrantedScopes；Gateway「本次会话允许」UI 待补 |
| WO-SEC-011 | 已完成 | |
| WO-SEC-012 | 已完成 | 可选 |
| WO-SEC-013 | 已完成 | |
| WO-SEC-014 | 已完成 | 纠正说明已写入 SELF_CHECK_AND_UNINSTALL.md，USAGE_AND_VERIFICATION 已引用 |

实现时可在本表或项目看板中更新状态为「进行中」「已完成」。
