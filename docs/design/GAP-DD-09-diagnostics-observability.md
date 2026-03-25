# GAP-DD-09: 诊断与可观测性 / Diagnostics & Observability

> **覆盖 GAP**: GAP-B05, GAP-B26, GAP-U25, GAP-U27, GAP-U28, GAP-B18
> **影响屏幕**: Screen 08 (Security & Permission Audit), Screen 17 (Task Queue & Proactive Hub)
> **优先级**: P1-P2
> **关联工单**: P7-01~P7-08

---

## 1. 功能概述

1. **环境信息展示** — 后端 `env_summary` 工具完整，需 UI 展示
2. **诊断报告生成** — 后端 `diagnostic.report` RPC 完整，需 UI 展示与触发
3. **日志/指标导出** — 后端 `ops.log` + `sessions.jsonl` + `turns` 完整，需 UI 导出
4. **记忆吞吐量** — 后端有 L1 写入统计，需聚合可视化
5. **缓冲区利用率** — 后端 `today-buffer.ts` 完整，需可视化
6. **自我改进建议** — 后端 `suggestions.ts` 规则引擎完整，需 UI 展示

---

## 2. 环境信息展示 (GAP-B26)

### 2.1 后端现状
- `env_summary` 工具: 返回 `workspace`, `cwd`, `platform`
- 配置中有: `model`, `port`, `workspace`, gateway host, 各模块 enabled 状态

### 2.2 需新增后端

**新增 RPC: `diagnostic.environment`**
```typescript
interface EnvironmentInfoResponse {
  runtime: {
    platform: string;        // win32 / darwin / linux
    nodeVersion: string;
    workspace: string;
    cwd: string;
    uptime: number;          // 秒
  };
  config: {
    model: string;
    port: number;
    gatewayHost: string;
    modulesEnabled: {
      skills: boolean;
      mcp: boolean;
      flows: boolean;
      vectorEmbedding: boolean;
      evolution: boolean;
      heartbeat: boolean;
      hotReload: boolean;
      exploration: boolean;
    };
  };
  connections: {
    websocketClients: number;
    mcpServers: number;
    activeSession: string;
  };
}
```

### 2.3 前端设计

**环境概览卡片:**
```
┌─ System Environment ──────────────────────────────────┐
│                                                        │
│ Platform: Windows 11  │  Node: v20.11.0               │
│ Workspace: E:\Rzeclaw │  Uptime: 2h 34m               │
│ Model: anthropic/claude-sonnet-4-20250514                │
│ Gateway: ws://localhost:9999                            │
│                                                        │
│ ┌─ Modules ────────────────────────────────────────┐  │
│ │ ● Skills  ● Flows  ● RAG  ● Evolution           │  │
│ │ ● MCP     ● Heartbeat  ○ Hot Reload              │  │
│ │ ● Exploration  ● Event Bus                       │  │
│ └──────────────────────────────────────────────────┘  │
│                                                        │
│ Connections: 2 WS clients  │  3 MCP servers           │
└────────────────────────────────────────────────────────┘
```

---

## 3. 诊断报告 (GAP-B18)

### 3.1 后端现状
- `diagnostic.report` RPC: `{ workspace?, days? }`
- 返回: `DiagnosticReport` (sessions/memory/heartbeat 统计)
- `generateSuggestions(report)`: 规则化建议 (高失败率/无心跳/无记忆写入)
- 输出: `.rzeclaw/diagnostics/report_YYYY-MM-DD.json` + `.rzeclaw/self_improvement_suggestions.md`

### 3.2 前端设计

**诊断报告面板:**
```
┌─ Diagnostic Report ──── Period: Last [7] days ───────┐
│                                                       │
│  [📊 Generate Report]   Last: 2026-03-22 14:30       │
│                                                       │
│ ┌─ Sessions ─────────────────────────────────────┐   │
│ │ Total Sessions: 45                              │   │
│ │ Total Tool Calls: 1,247                         │   │
│ │ Tool Failures: 89 (7.1%)                        │   │
│ │ Total Turns: 312                                │   │
│ │                                                 │   │
│ │ Failure Rate: ██████░░░░ 7.1%                  │   │
│ │ (⚠ 高于 5% 阈值)                               │   │
│ └─────────────────────────────────────────────────┘   │
│ ┌─ Memory ───────────────────────────────────────┐   │
│ │ L1 Entries Written: 234                         │   │
│ │ Audit Writes: 1,247                             │   │
│ └─────────────────────────────────────────────────┘   │
│ ┌─ Heartbeat ────────────────────────────────────┐   │
│ │ Total Runs: 168  │  Executed: 165  │  Errors: 3│   │
│ │ Last Run: 2026-03-22 14:00                      │   │
│ └─────────────────────────────────────────────────┘   │
│                                                       │
│ ┌─ Improvement Suggestions ──────────────────────┐   │
│ │ ⚠ 工具失败率 7.1% 超过阈值 (5%)，建议检查     │   │
│ │   常见失败工具并修复相关流程                     │   │
│ │ ✓ 心跳执行正常                                  │   │
│ │ ✓ 记忆写入正常                                  │   │
│ └─────────────────────────────────────────────────┘   │
│                                                       │
│ [📥 导出报告 JSON] [📥 导出建议 MD]                  │
└───────────────────────────────────────────────────────┘
```

---

## 4. 日志与指标导出 (GAP-U25)

### 4.1 后端现状
- `ops.log`: 操作日志 (tool/args/result/risk_level/session)
- `sessions.jsonl`: 会话指标 (tool_call_count/failure_count/turns)
- Turn 日志: TurnLogEntry (per-turn 结构化日志)
- 无统一导出 RPC

### 4.2 需新增后端

**新增 RPC: `diagnostic.export`**
```typescript
interface DiagnosticExportRequest {
  type: 'ops_log' | 'session_metrics' | 'turn_logs' | 'all';
  format: 'json' | 'csv';
  after?: string;            // ISO 日期
  before?: string;
  sessionId?: string;
  limit?: number;            // 默认 1000
}
interface DiagnosticExportResponse {
  data: string;
  recordCount: number;
  type: string;
  format: string;
}
```

### 4.3 前端设计

**导出面板:**
```
┌─ Export Diagnostics ──────────────────────────────────┐
│                                                       │
│ Type: [☑ Ops Log] [☑ Sessions] [☐ Turn Logs]        │
│ Format: ● JSON  ○ CSV                                │
│ Date: [2026-03-01] ~ [2026-03-23]                    │
│ Session: [All ▾]                                      │
│ Limit: [1000]                                         │
│                                                       │
│              [📥 导出]                                │
└───────────────────────────────────────────────────────┘
```

---

## 5. 记忆吞吐量 (GAP-U27)

### 5.1 后端现状
- 每次 chat 后调用 `flushToL1()` 写入记忆
- `promoteL1ToL2()` 在 chat 后自动执行
- `archiveCold()` 按日期自动归档
- 无聚合吞吐统计

### 5.2 需新增后端

**扩展 `memory.stats` RPC (GAP-DD-05 §2):**
```typescript
// 在 MemoryStatsResponse 中追加
interface MemoryThroughput {
  today: {
    l1Writes: number;
    l2Promotions: number;
    coldArchived: number;
    purged: number;
  };
  last7Days: Array<{
    date: string;
    l1Writes: number;
    l2Promotions: number;
    coldArchived: number;
  }>;
}
```

### 5.3 前端设计

**吞吐量趋势图:**
```
┌─ Memory Throughput ─── Last 7 Days ──────────────────┐
│                                                       │
│  40│  ██                                              │
│  30│  ██ ██       ██                                  │
│  20│  ██ ██ ██    ██ ██                               │
│  10│  ██ ██ ██ ██ ██ ██ ██                            │
│   0│──────────────────────                            │
│     3/17 3/18 3/19 3/20 3/21 3/22 3/23               │
│                                                       │
│  ■ L1 Writes  ■ L2 Promotions  ■ Cold Archived      │
│                                                       │
│  Today: 34 writes │ 28 promotions │ 0 archived       │
└───────────────────────────────────────────────────────┘
```

---

## 6. 缓冲区利用率 (GAP-U28)

### 6.1 后端现状
- `today-buffer.ts`: 日缓冲区 (`today_buffer_{date}.jsonl`)
- `appendToTodayBuffer()`: 追加会话摘要
- `readTodayBuffer()`: 读取指定日期缓冲
- 滚动窗口折叠: `runFoldForDate()` 消费缓冲区

### 6.2 需新增后端

**扩展 `memory.stats` RPC:**
```typescript
// 在 MemoryStatsResponse 中追加
interface BufferUtilization {
  todayBuffer: {
    entryCount: number;
    sessions: string[];     // 产生缓冲的会话 ID
    fileSizeBytes: number;
    oldestEntry?: string;   // ISO 时间
    newestEntry?: string;
  };
  pendingFold: boolean;     // 是否有未折叠的缓冲
  lastFoldDate?: string;
}
```

### 6.3 前端设计

**缓冲区状态卡:**
```
┌─ Today Buffer ─── 2026-03-23 ────────────────────────┐
│                                                       │
│  Entries: 12 │ Size: 4.2 KB │ Sessions: 3            │
│  Oldest: 08:15 │ Newest: 14:22                        │
│                                                       │
│  Buffer Fill: ████████░░░░░░░░░░░░ 40%              │
│                                                       │
│  Last Fold: 2026-03-22 08:00                          │
│  Pending Fold: ● Yes                                  │
│                                                       │
│  [🔄 Fold Now]                                        │
└───────────────────────────────────────────────────────┘
```

---

## 7. i18n 键

```json
{
  "diagnostic.env.title": "系统环境",
  "diagnostic.env.platform": "平台",
  "diagnostic.env.nodeVersion": "Node 版本",
  "diagnostic.env.workspace": "工作区",
  "diagnostic.env.uptime": "运行时间",
  "diagnostic.env.model": "模型",
  "diagnostic.env.gateway": "网关",
  "diagnostic.env.modules": "模块状态",
  "diagnostic.env.connections": "连接",
  "diagnostic.env.wsClients": "{count} 个 WS 客户端",
  "diagnostic.env.mcpServers": "{count} 个 MCP 服务器",
  "diagnostic.report.title": "诊断报告",
  "diagnostic.report.generate": "生成报告",
  "diagnostic.report.period": "周期",
  "diagnostic.report.lastGenerated": "上次生成",
  "diagnostic.report.sessions": "会话统计",
  "diagnostic.report.totalSessions": "总会话数",
  "diagnostic.report.toolCalls": "工具调用",
  "diagnostic.report.toolFailures": "工具失败",
  "diagnostic.report.failureRate": "失败率",
  "diagnostic.report.totalTurns": "总轮次",
  "diagnostic.report.memory": "记忆统计",
  "diagnostic.report.heartbeat": "心跳统计",
  "diagnostic.report.suggestions": "改进建议",
  "diagnostic.report.exportJson": "导出报告 JSON",
  "diagnostic.report.exportMd": "导出建议 MD",
  "diagnostic.export.title": "导出诊断数据",
  "diagnostic.export.type.opsLog": "操作日志",
  "diagnostic.export.type.sessions": "会话指标",
  "diagnostic.export.type.turnLogs": "轮次日志",
  "diagnostic.export.type.all": "全部",
  "diagnostic.export.format": "格式",
  "diagnostic.export.dateRange": "日期范围",
  "diagnostic.export.limit": "限制条数",
  "diagnostic.export.download": "导出",
  "diagnostic.throughput.title": "记忆吞吐量",
  "diagnostic.throughput.l1Writes": "L1 写入",
  "diagnostic.throughput.l2Promotions": "L2 提升",
  "diagnostic.throughput.coldArchived": "冷归档",
  "diagnostic.throughput.today": "今日",
  "diagnostic.throughput.last7Days": "最近 7 天",
  "diagnostic.buffer.title": "今日缓冲区",
  "diagnostic.buffer.entries": "条目数",
  "diagnostic.buffer.size": "大小",
  "diagnostic.buffer.sessions": "会话数",
  "diagnostic.buffer.fill": "缓冲区填充",
  "diagnostic.buffer.lastFold": "上次折叠",
  "diagnostic.buffer.pendingFold": "待折叠",
  "diagnostic.buffer.foldNow": "立即折叠"
}
```
