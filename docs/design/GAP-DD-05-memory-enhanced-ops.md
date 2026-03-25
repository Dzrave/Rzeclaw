# GAP-DD-05: 记忆增强操作 / Memory Enhanced Operations

> **覆盖 GAP**: GAP-U26, GAP-U27, GAP-U28, GAP-U29, GAP-U30, GAP-U31, GAP-U32, GAP-U33, GAP-U34, GAP-B16
> **影响屏幕**: Screen 14 (Memory & Retrospective)
> **优先级**: P1-P2
> **关联工单**: P5-01~P5-08, P6-09~P6-12

---

## 1. 功能概述

1. **记忆容量统计** — 后端有 L1/L2/Cold 存储，无聚合统计 RPC
2. **L1→L2 折叠操作** — 后端 `promoteL1ToL2()` 已实现，需 UI 触发
3. **冷归档操作** — 后端 `archiveCold()` 已实现，需 UI 触发与可视化
4. **记忆导出** — 后端 `exportAuditLog()` 已实现，需扩展到记忆条目导出
5. **记忆清除** — 后端 `update_validity()` 可标记，需批量清除 UI
6. **效率评分** — 后端有 `taskRelevanceScore()`，需聚合展示
7. **漂移追踪** — 后端有 `supersedes_id` / `contradicted` 机制，需可视化
8. **Rolling Ledger 可视化** — 后端 5 天滚动窗口，需 UI 展示
9. **Today Buffer 管理** — 后端 `today-buffer.ts` 完整，需 UI 展示

---

## 2. 记忆容量统计 (GAP-U26)

### 2.1 需新增后端

**新增 RPC: `memory.stats`**
```typescript
interface MemoryStatsRequest {
  workspaceId?: string;
}
interface MemoryStatsResponse {
  l1: {
    entryCount: number;
    activeCount: number;
    supersededCount: number;
    contradictedCount: number;
    fileSizeBytes: number;
  };
  l2: {
    entryCount: number;
    fileSizeBytes: number;
  };
  cold: {
    entryCount: number;
    fileSizeBytes: number;
  };
  todayBuffer: {
    entryCount: number;
    date: string;
  };
  rollingLedger: {
    dayCount: number;
    oldestDate?: string;
    newestDate?: string;
  };
  contentTypeBreakdown: Record<string, number>;  // fact: 120, summary: 45, ...
  totalEntries: number;
  totalSizeBytes: number;
}
```

### 2.2 前端设计

**容量概览卡片:**
```
┌─ Memory Capacity ──────────────────────────────────────┐
│                                                         │
│  L1 (Hot)    ████████████████░░░░ 820 条  │ 2.4 MB     │
│  L2 (Warm)   ██████░░░░░░░░░░░░░ 310 条  │ 0.9 MB     │
│  Cold        ████████████░░░░░░░ 1.2K 条  │ 3.8 MB     │
│                                                         │
│  总计: 2,330 条  │  7.1 MB                              │
│                                                         │
│  ┌─ 类型分布 ─────────────────────────────────────┐    │
│  │ fact ████████████ 52%                           │    │
│  │ summary ██████ 26%                              │    │
│  │ preference ███ 12%                              │    │
│  │ task_outcome ██ 8%                              │    │
│  │ tool_experience █ 2%                            │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  [📊 刷新统计]  [📤 导出]  [🧹 清理]                   │
└─────────────────────────────────────────────────────────┘
```

---

## 3. L1→L2 折叠 (GAP-U27)

### 3.1 后端现状
- `promoteL1ToL2(store, { created_after, limit })`: 去重提升
- 返回: `{ promoted: number; skipped: number }`
- 在 chat 执行后自动触发 (created_after: now - 120s)

### 3.2 需新增后端

**新增 RPC: `memory.promote`**
```typescript
interface MemoryPromoteRequest {
  dryRun?: boolean;          // 预览模式，不实际执行
  created_after?: string;    // ISO 日期，默认全部 L1
  limit?: number;            // 默认 1000
}
interface MemoryPromoteResponse {
  promoted: number;
  skipped: number;           // 重复跳过
  dryRunResults?: Array<{
    id: string;
    content: string;
    isDuplicate: boolean;
  }>;
}
```

### 3.3 前端设计

**折叠操作面板:**
```
┌─ L1 → L2 Promotion ──────────────────────────┐
│                                                │
│ L1 待提升: 245 条 (自动去重已跳过 89 条)       │
│                                                │
│ ○ 全部提升  ● 仅最近 7 天  ○ 自定义日期范围    │
│                                                │
│ [预览 (Dry Run)]                               │
│                                                │
│ ┌─ 预览结果 ──────────────────────────────┐   │
│ │ ✓ 将提升: 156 条                        │   │
│ │ ✗ 重复跳过: 89 条                       │   │
│ │                                          │   │
│ │ 示例:                                   │   │
│ │  ✓ "用户偏好使用 TypeScript..."          │   │
│ │  ✗ "项目使用 Node.js..." (已存在)       │   │
│ └──────────────────────────────────────────┘   │
│                                                │
│                    [取消] [执行提升]            │
└────────────────────────────────────────────────┘
```

---

## 4. 冷归档 (GAP-U28)

### 4.1 后端现状
- `archiveCold(workspaceDir, workspaceId, coldAfterDays)`: 按日期切分
- 返回移动条目数
- 配置: `memory.coldAfterDays`

### 4.2 需新增后端

**新增 RPC: `memory.archiveCold`**
```typescript
interface MemoryArchiveColdRequest {
  dryRun?: boolean;
  coldAfterDays?: number;    // 覆盖配置值
}
interface MemoryArchiveColdResponse {
  movedCount: number;
  cutoffDate: string;
  dryRunEntries?: Array<{
    id: string;
    content: string;
    created_at: string;
  }>;
}
```

### 4.3 前端设计

```
┌─ Cold Archive ───────────────────────────────┐
│                                               │
│ 阈值: 超过 [30] 天的条目将被归档             │
│ 当前符合条件: 487 条                          │
│                                               │
│ 冷存储现有: 1,234 条 (3.8 MB)                │
│ 最旧条目: 2025-08-14                          │
│                                               │
│          [预览] [执行归档]                     │
└───────────────────────────────────────────────┘
```

---

## 5. 记忆导出 (GAP-U29)

### 5.1 后端现状
- `exportAuditLog(records, format)`: 支持 JSON/CSV 导出审计日志
- 记忆条目本身无导出 RPC

### 5.2 需新增后端

**新增 RPC: `memory.export`**
```typescript
interface MemoryExportRequest {
  layers?: ('L1' | 'L2' | 'cold')[];  // 默认全部
  contentTypes?: string[];              // 过滤类型
  validity?: string;                    // 默认 "active"
  format: 'json' | 'csv' | 'jsonl';
  includeProvenance?: boolean;          // 包含来源信息
}
interface MemoryExportResponse {
  data: string;            // 编码后的导出数据
  entryCount: number;
  format: string;
  exportedAt: string;
}
```

### 5.3 前端设计

**导出对话框:**
```
┌─ Export Memory ──────────────────────────────┐
│                                               │
│ 层级: [☑ L1] [☑ L2] [☐ Cold]               │
│ 类型: [☑ All] 或 [☑ fact] [☑ summary] ...   │
│ 状态: [☑ Active] [☐ Superseded]              │
│ 格式: ○ JSON  ● CSV  ○ JSONL                 │
│ [☑] 包含来源信息 (provenance)                │
│                                               │
│ 预计导出: ~1,130 条                           │
│                                               │
│              [取消] [📥 下载导出]              │
└───────────────────────────────────────────────┘
```

---

## 6. 记忆清除 (GAP-U30)

### 6.1 后端现状
- `update_validity(id, validity)`: 单条标记为 superseded/contradicted
- 无批量清除接口

### 6.2 需新增后端

**新增 RPC: `memory.purge`**
```typescript
interface MemoryPurgeRequest {
  target: 'superseded' | 'contradicted' | 'cold_older_than';
  olderThanDays?: number;      // 仅 cold_older_than 时使用
  dryRun?: boolean;
}
interface MemoryPurgeResponse {
  purgedCount: number;
  freedBytes: number;
  dryRunEntries?: Array<{
    id: string;
    content: string;
    validity: string;
    created_at: string;
  }>;
}
```

### 6.3 前端设计

```
┌─ Purge Memory ─── ⚠ 不可逆操作 ─────────────┐
│                                               │
│ 清除目标:                                     │
│ ○ 已取代的条目 (superseded): 67 条            │
│ ○ 已矛盾的条目 (contradicted): 23 条         │
│ ● 冷存储中超过 [90] 天: 312 条               │
│                                               │
│ ⚠ 此操作将永久删除条目，无法恢复             │
│                                               │
│          [预览] [确认清除 (error)]             │
└───────────────────────────────────────────────┘
```

---

## 7. Rolling Ledger 可视化 (GAP-B16)

### 7.1 后端现状
- `readRollingLedger(workspaceDir)`: 读取 5 天滚动窗口
- 结构: `{ memory_window, current_focus, rolling_ledger: DayEntry[] }`
- `DayEntry`: `{ day, date, summary, pending_tasks? }`

### 7.2 需新增后端

**新增 RPC: `memory.rollingLedger`**
```typescript
interface RollingLedgerRequest {
  workspace?: string;
}
interface RollingLedgerResponse {
  memoryWindow: string;
  currentFocus?: string;
  ledger: Array<{
    day: string;
    date: string;
    summary: string;
    pendingTasks: string[];
  }>;
  lastFoldDate?: string;
  nextScheduledFold?: string;
}
```

### 7.3 前端设计

**Rolling Ledger 时间线:**
```
┌─ Rolling Ledger (5-Day Window) ──── [🔄 Fold Now] ─┐
│                                                      │
│  Current Focus: 优化 RAG 检索精度，重构事件总线...    │
│                                                      │
│  ┌─ Yesterday (2026-03-22) ──────────────────────┐  │
│  │ 完成事件总线监控 UI 设计，修复 WebSocket...    │  │
│  │ 📌 待办: 测试事件推送性能                      │  │
│  └───────────────────────────────────────────────┘  │
│  ┌─ Day -2 (2026-03-21) ─────────────────────────┐  │
│  │ 实现记忆导出功能，优化 L2 去重算法...          │  │
│  └───────────────────────────────────────────────┘  │
│  ┌─ Day -3 (2026-03-20) ─────────────────────────┐  │
│  │ 安全审计规则扩展，添加自定义正则...             │  │
│  └───────────────────────────────────────────────┘  │
│  ┌─ Day -4 (2026-03-19) ─────────────────────────┐  │
│  │ 流程路由优化，成功率排序...                     │  │
│  └───────────────────────────────────────────────┘  │
│  ┌─ Day -5 (2026-03-18) ─ [即将被淘汰] ─────────┐  │
│  │ 初始化项目结构，配置基础框架...                 │  │
│  └───────────────────────────────────────────────┘  │
│                                                      │
│  Last Fold: 2026-03-22 08:00  │  Next: 2026-03-23   │
└──────────────────────────────────────────────────────┘
```

---

## 8. 效率评分与漂移追踪 (GAP-U31, GAP-U32)

### 8.1 后端现状
- `taskRelevanceScore()`: 基于 token 重叠的相关度评分
- `supersedes_id`: 条目替代关系
- `validity`: active / superseded / contradicted

### 8.2 需新增后端

**新增 RPC: `memory.driftReport`**
```typescript
interface MemoryDriftReportRequest {
  days?: number;  // 默认 30
}
interface MemoryDriftReportResponse {
  supersededChains: Array<{
    currentId: string;
    currentContent: string;
    previousVersions: Array<{
      id: string;
      content: string;
      created_at: string;
    }>;
  }>;
  contradictionCount: number;
  driftScore: number;          // 0-1, 漂移程度
  avgRelevanceScore: number;   // 最近查询的平均相关度
}
```

### 8.3 前端设计

```
┌─ Memory Health ──────────────────────────────────────┐
│                                                       │
│  Drift Score: ██░░░░░░░░ 18%  (低漂移 ✓)            │
│  Avg Relevance: ████████░░ 82%                       │
│  Contradictions: 23 条                                │
│  Supersession Chains: 12                              │
│                                                       │
│  ┌─ 最近漂移 ──────────────────────────────────┐     │
│  │ "项目使用 React" → "项目迁移到 Vue 3"       │     │
│  │   变更时间: 2026-03-15                       │     │
│  │ "部署到 AWS" → "迁移到 GCP"                 │     │
│  │   变更时间: 2026-03-10                       │     │
│  └──────────────────────────────────────────────┘     │
└───────────────────────────────────────────────────────┘
```

---

## 9. i18n 键

```json
{
  "memory.stats.title": "记忆容量",
  "memory.stats.l1": "L1 (热存储)",
  "memory.stats.l2": "L2 (温存储)",
  "memory.stats.cold": "冷存储",
  "memory.stats.total": "总计",
  "memory.stats.entries": "{count} 条",
  "memory.stats.refresh": "刷新统计",
  "memory.stats.typeBreakdown": "类型分布",
  "memory.promote.title": "L1 → L2 提升",
  "memory.promote.pending": "待提升: {count} 条",
  "memory.promote.skipped": "重复跳过: {count} 条",
  "memory.promote.dryRun": "预览 (Dry Run)",
  "memory.promote.execute": "执行提升",
  "memory.promote.all": "全部提升",
  "memory.promote.recent": "仅最近 {days} 天",
  "memory.archive.title": "冷归档",
  "memory.archive.threshold": "阈值: 超过 {days} 天",
  "memory.archive.eligible": "符合条件: {count} 条",
  "memory.archive.preview": "预览",
  "memory.archive.execute": "执行归档",
  "memory.export.title": "导出记忆",
  "memory.export.layers": "层级",
  "memory.export.types": "类型",
  "memory.export.format": "格式",
  "memory.export.includeProvenance": "包含来源信息",
  "memory.export.estimated": "预计导出: ~{count} 条",
  "memory.export.download": "下载导出",
  "memory.purge.title": "清除记忆",
  "memory.purge.warning": "此操作将永久删除条目，无法恢复",
  "memory.purge.superseded": "已取代的条目",
  "memory.purge.contradicted": "已矛盾的条目",
  "memory.purge.coldOlderThan": "冷存储中超过 {days} 天",
  "memory.purge.confirm": "确认清除",
  "memory.purge.preview": "预览",
  "memory.ledger.title": "滚动记忆窗口",
  "memory.ledger.currentFocus": "当前焦点",
  "memory.ledger.pendingTasks": "待办事项",
  "memory.ledger.foldNow": "立即折叠",
  "memory.ledger.lastFold": "上次折叠",
  "memory.ledger.nextFold": "下次折叠",
  "memory.ledger.aboutToExpire": "即将被淘汰",
  "memory.health.title": "记忆健康",
  "memory.health.driftScore": "漂移分数",
  "memory.health.lowDrift": "低漂移",
  "memory.health.highDrift": "高漂移",
  "memory.health.avgRelevance": "平均相关度",
  "memory.health.contradictions": "矛盾条目",
  "memory.health.supersessionChains": "替代链",
  "memory.health.recentDrift": "最近漂移"
}
```
