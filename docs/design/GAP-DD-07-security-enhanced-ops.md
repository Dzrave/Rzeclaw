# GAP-DD-07: 安全增强操作 / Security Enhanced Operations

> **覆盖 GAP**: GAP-U16, GAP-U17, GAP-U18, GAP-U19, GAP-U20, GAP-B17
> **影响屏幕**: Screen 08 (Security & Permission Audit)
> **优先级**: P1-P2
> **关联工单**: P6-01~P6-08

---

## 1. 功能概述

1. **自定义正则规则** — 后端 `dangerous-commands.ts` 支持自定义 patterns，需 UI 管理
2. **作用域请求流程** — 后端 `permission-scopes.ts` 完整，需 UI 审批流程
3. **授权到期倒计时** — 后端 `scheduledGrants` 支持时间窗口，需 UI 倒计时
4. **审计日志导出** — 后端 `exportAuditLog()` 和 `ops.log` 完整，需 UI 导出入口
5. **内核完整性检查** — 后端无此功能，需设计安全完整性校验

---

## 2. 自定义正则规则 (GAP-U16)

### 2.1 后端现状
- 13 个内置危险命令正则 (rm -rf, format, del, fork bomb, mkfs, dd, wmic, chmod, reg delete, diskpart 等)
- 配置: `security.dangerousCommands.patterns`: 自定义正则数组
- 配置: `security.dangerousCommands.mode`: "block" | "confirm" | "dryRunOnly"
- `checkDangerousCommand(command, config)`: 合并内置 + 自定义规则检查

### 2.2 需新增后端

**新增 RPC: `security.rules.list`**
```typescript
interface SecurityRulesListResponse {
  builtinRules: Array<{
    pattern: string;
    description: string;
  }>;
  customRules: Array<{
    id: string;
    pattern: string;
    description?: string;
    enabled: boolean;
    createdAt: string;
  }>;
  mode: 'block' | 'confirm' | 'dryRunOnly';
}
```

**新增 RPC: `security.rules.update`**
```typescript
interface SecurityRulesUpdateRequest {
  customRules: Array<{
    id?: string;          // 空则新建
    pattern: string;
    description?: string;
    enabled: boolean;
  }>;
  mode?: 'block' | 'confirm' | 'dryRunOnly';
}
interface SecurityRulesUpdateResponse {
  ok: boolean;
  ruleCount: number;
  invalidPatterns?: string[];  // 无效正则
}
```

**实现方案:**
1. 自定义规则持久化到 `.rzeclaw/security/custom_rules.json`
2. 启动 / 热重载时合并到 config
3. 新增规则时验证正则语法有效性
4. 写入审计日志

### 2.3 前端设计

**安全规则管理面板:**
```
┌─ Dangerous Command Rules ──── Mode: [Confirm ▾] ────┐
│                                                       │
│ ┌─ Built-in Rules (13) ── [展开/折叠] ──────────┐   │
│ │ /\brm\s+(-rf?|--recursive)...\  🔒 不可修改   │   │
│ │ /\bformat\s+[a-z]:/i\           🔒 不可修改   │   │
│ │ ... (11 more)                                  │   │
│ └────────────────────────────────────────────────┘   │
│                                                       │
│ ┌─ Custom Rules ──────────── [+ Add Rule] ──────┐   │
│ │ # │ Pattern              │ Desc       │ ⚡│ 🗑│   │
│ │ 1 │ /\bcurl\s+.*\|.*sh/  │ 远程脚本执行│ ● │   │   │
│ │ 2 │ /\bchown\s+-R\s+/    │ 递归改权限  │ ● │   │   │
│ │ 3 │ /\bnpm\s+exec\s+/    │ npm远程执行 │ ○ │   │   │
│ └────────────────────────────────────────────────┘   │
│                                                       │
│ ┌─ Test Rule ────────────────────────────────────┐   │
│ │ 输入测试命令: [curl http://x.com/s | sh  ]    │   │
│ │ 结果: ⚠ 匹配规则 #1 - Mode: confirm           │   │
│ └────────────────────────────────────────────────┘   │
│                                                       │
│                              [重置] [保存规则]        │
└───────────────────────────────────────────────────────┘
```

---

## 3. 作用域请求流程 (GAP-U17)

### 3.1 后端现状
- `TOOL_SCOPE_MAP`: 工具 → 作用域映射 (file_read, file_write, bash, process_kill, ui_automation, keymouse)
- `getEffectivePolicy(toolName, config)`: 解析策略 (allow/confirm/deny)
- `scope.grantSession` RPC: 为会话授权特定作用域
- 会话维度: `session.grantedScopes: string[]`

### 3.2 前端设计

**作用域概览面板:**
```
┌─ Permission Scopes ──────────────────────────────────┐
│                                                       │
│  Scope          │ Policy  │ Session │ Scheduled       │
│ ─────────────────┼─────────┼─────────┼─────────────── │
│  file_read      │ allow   │ ✓       │ —               │
│  file_write     │ confirm │ ✓       │ 09:00-18:00    │
│  bash           │ allow   │ ✓       │ —               │
│  process_kill   │ confirm │ ✗       │ —               │
│  ui_automation  │ confirm │ ✗       │ —               │
│  keymouse       │ deny    │ ✗       │ —               │
│                                                       │
│ Session Grants: file_read, file_write, bash          │
│                                                       │
│ [管理策略] [查看会话授权]                             │
└───────────────────────────────────────────────────────┘
```

**权限请求审批流 (复用 GAP-DD-01 §4 的弹窗):**
```
工具执行 → 检查 scope → policy=confirm
  → 检查 session.grantedScopes 是否已授权
    → 已授权: 直接执行
    → 未授权: 弹出确认对话框 (GAP-DD-01 §4.2)
      → 用户授权: scope.grantSession → 执行
      → 用户拒绝: 返回权限被拒信息
```

---

## 4. 授权到期倒计时 (GAP-U18)

### 4.1 后端现状
- `security.scheduledGrants`: `Record<string, string>` (scope → "HH:MM-HH:MM")
- `isInScheduledGrant(scope, config)`: 检查当前时间是否在授权窗口内

### 4.2 需新增后端

**新增 RPC: `security.scheduledGrants.list`**
```typescript
interface ScheduledGrantsListResponse {
  grants: Array<{
    scope: string;
    window: string;          // "HH:MM-HH:MM"
    isActive: boolean;       // 当前是否在窗口内
    expiresIn?: number;      // 距离窗口结束的秒数
    startsIn?: number;       // 距离窗口开始的秒数
  }>;
}
```

**新增 RPC: `security.scheduledGrants.update`**
```typescript
interface ScheduledGrantsUpdateRequest {
  grants: Record<string, string>;  // scope → "HH:MM-HH:MM"
}
```

### 4.3 前端设计

**计划授权面板:**
```
┌─ Scheduled Grants ──────────────────────────────────┐
│                                                      │
│  file_write  │ 09:00 - 18:00 │ ● 活跃 │ 剩余 3h 42m│
│  ui_auto     │ 10:00 - 16:00 │ ● 活跃 │ 剩余 1h 42m│
│  keymouse    │ 14:00 - 15:00 │ ○ 未激活│ 0h 18m 后 │
│                                                      │
│  ┌─ file_write 倒计时 ─────────────────────────┐    │
│  │ ████████████████████░░░░░░ 18:00 到期       │    │
│  │ 剩余: 03:42:15                               │    │
│  └──────────────────────────────────────────────┘    │
│                                                      │
│  [+ 添加计划] [编辑] [保存]                          │
└──────────────────────────────────────────────────────┘
```

---

## 5. 审计日志导出 (GAP-U19)

### 5.1 后端现状
- `queryAuditLog(workspaceDir, options)`: 按 sessionId / entry_id / 日期范围查询
- `exportAuditLog(records, format)`: JSON / CSV 格式化
- `ops.log`: 操作日志，含风险分级 (low/medium/high)
- `classifyOpRisk()`: 工具 + 参数 → 风险等级

### 5.2 需新增后端

**新增 RPC: `security.audit.query`**
```typescript
interface AuditQueryRequest {
  source: 'memory' | 'ops' | 'both';
  sessionId?: string;
  riskLevel?: 'low' | 'medium' | 'high';
  after?: string;            // ISO 日期
  before?: string;
  limit?: number;            // 默认 100
}
interface AuditQueryResponse {
  records: Array<{
    type: 'memory_write' | 'tool_execution';
    timestamp: string;
    sessionId: string;
    details: Record<string, unknown>;
    riskLevel?: string;
  }>;
  totalCount: number;
}
```

**新增 RPC: `security.audit.export`**
```typescript
interface AuditExportRequest {
  source: 'memory' | 'ops' | 'both';
  format: 'json' | 'csv';
  after?: string;
  before?: string;
  riskLevel?: string;
}
interface AuditExportResponse {
  data: string;
  recordCount: number;
  format: string;
}
```

### 5.3 前端设计

**审计日志面板:**
```
┌─ Audit Log ──────────────────────────────────────────┐
│                                                       │
│ 源: [☑ Memory Writes] [☑ Tool Ops]                  │
│ 风险: [All ▾]  日期: [2026-03-01] ~ [2026-03-23]    │
│ Session: [All ▾]                                      │
│                                                       │
│ ┌─────────────────────────────────────────────────┐  │
│ │ Time        │ Type     │ Risk │ Session │ Detail │  │
│ │ 14:02:11    │ tool_op  │ 🟡   │ main   │ write..│  │
│ │ 14:01:45    │ mem_wr   │ 🟢   │ main   │ fact:..│  │
│ │ 13:58:22    │ tool_op  │ 🔴   │ dev-01 │ rm -rf.│  │
│ │ 13:55:01    │ tool_op  │ 🟢   │ main   │ read ..│  │
│ └─────────────────────────────────────────────────┘  │
│                                                       │
│ Total: 1,247 records  │ High: 3  Med: 89  Low: 1,155│
│                                                       │
│ [📥 导出 JSON] [📥 导出 CSV]                        │
└───────────────────────────────────────────────────────┘
```

---

## 6. 内核完整性检查 (GAP-U20)

### 6.1 后端现状
- 无专用完整性校验机制
- 配置文件热重载有审计日志

### 6.2 需新增后端

**新增 RPC: `security.integrity.check`**
```typescript
interface IntegrityCheckResponse {
  status: 'healthy' | 'warning' | 'critical';
  checks: Array<{
    name: string;
    status: 'pass' | 'warn' | 'fail';
    message: string;
  }>;
  timestamp: string;
}
```

**检查项:**
1. **配置文件完整性**: `rzeclaw.json` 是否被意外修改 (与启动时 hash 对比)
2. **流程库完整性**: 流程文件 hash 校验
3. **Skills 完整性**: 技能脚本是否被篡改
4. **依赖完整性**: node_modules 关键包版本校验
5. **权限策略一致性**: 运行时策略 vs 配置文件

### 6.3 前端设计

```
┌─ System Integrity ──────────────── Last: 14:30 ──┐
│                                                   │
│ Overall: ● HEALTHY                                │
│                                                   │
│ ✓ Config file integrity         PASS             │
│ ✓ Flow library integrity        PASS             │
│ ⚠ Skills integrity              WARN             │
│   └ 1 skill modified since startup               │
│ ✓ Dependency versions           PASS             │
│ ✓ Permission policy sync        PASS             │
│                                                   │
│                          [🔄 Re-check]           │
└───────────────────────────────────────────────────┘
```

---

## 7. i18n 键

```json
{
  "security.rules.title": "危险命令规则",
  "security.rules.builtin": "内置规则",
  "security.rules.custom": "自定义规则",
  "security.rules.addRule": "添加规则",
  "security.rules.pattern": "正则模式",
  "security.rules.description": "描述",
  "security.rules.enabled": "启用",
  "security.rules.mode": "模式",
  "security.rules.mode.block": "阻止",
  "security.rules.mode.confirm": "确认",
  "security.rules.mode.dryRun": "仅模拟",
  "security.rules.test": "测试规则",
  "security.rules.testResult": "匹配规则 #{id} - 模式: {mode}",
  "security.rules.noMatch": "未匹配任何规则",
  "security.rules.invalidPattern": "无效正则: {pattern}",
  "security.rules.save": "保存规则",
  "security.rules.reset": "重置",
  "security.scopes.title": "权限作用域",
  "security.scopes.policy": "策略",
  "security.scopes.sessionGrant": "会话授权",
  "security.scopes.scheduled": "计划授权",
  "security.scopes.managePolicies": "管理策略",
  "security.scheduled.title": "计划授权",
  "security.scheduled.active": "活跃",
  "security.scheduled.inactive": "未激活",
  "security.scheduled.expiresIn": "剩余 {time}",
  "security.scheduled.startsIn": "{time} 后开始",
  "security.scheduled.addSchedule": "添加计划",
  "security.audit.title": "审计日志",
  "security.audit.source.memory": "记忆写入",
  "security.audit.source.ops": "工具操作",
  "security.audit.riskLevel": "风险等级",
  "security.audit.dateRange": "日期范围",
  "security.audit.exportJson": "导出 JSON",
  "security.audit.exportCsv": "导出 CSV",
  "security.audit.totalRecords": "总记录: {count}",
  "security.audit.riskBreakdown": "高: {high}  中: {medium}  低: {low}",
  "security.integrity.title": "系统完整性",
  "security.integrity.healthy": "健康",
  "security.integrity.warning": "警告",
  "security.integrity.critical": "严重",
  "security.integrity.pass": "通过",
  "security.integrity.warn": "警告",
  "security.integrity.fail": "失败",
  "security.integrity.recheck": "重新检查",
  "security.integrity.configFile": "配置文件完整性",
  "security.integrity.flowLibrary": "流程库完整性",
  "security.integrity.skills": "技能完整性",
  "security.integrity.dependencies": "依赖版本",
  "security.integrity.policySync": "权限策略一致性"
}
```
