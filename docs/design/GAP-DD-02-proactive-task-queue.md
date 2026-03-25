# GAP-DD-02: 主动建议与任务队列 / Proactive & Task Queue System

> **覆盖 GAP**: GAP-B05, GAP-B06, GAP-B10
> **影响屏幕**: Screen 01 (Chat), Screen 17 (Task Queue & Proactive Hub)
> **优先级**: P1
> **关联工单**: P2-14, P2-16, P5-09, P8-09

---

## 1. 功能概述

1. **主动建议面板** — 后端 `proactive.suggest` RPC 完整，需 UI 展示
2. **任务队列管理** — 后端 `task.getResult` / `task.listBySession` 完整，需 UI 展示
3. **操作撤销** — 后端 `undo_last` 工具完整，需 UI 触发入口

---

## 2. 主动建议面板 (GAP-B10)

### 2.1 后端现状
- RPC `proactive.suggest`: 参数 `{ trigger: "timer"|"event"|"on_open"|"explicit" }`
- 返回建议列表（基于 canvas 状态、记忆模式、行为模式推断）
- 内部使用 `readTasks()` / `writeTasks()` 管理建议任务

### 2.2 前端设计 — Chat 浮窗

**位置**: Screen 01 Chat 右下角，可折叠浮窗

```
┌─ ✨ Proactive Insights ──── [−] [✕] ─┐
│                                        │
│ ⏱ Timer │ 📡 Event │ ⚡ Explicit       │ ← 触发源指示
│                                        │
│ ┌──────────────────────────────────┐   │
│ │ 💡 优化向量索引                    │   │
│ │ 检测到 flows/motivation 集合      │   │
│ │ 最近 14% 延迟上升，建议重建索引     │   │
│ │ 置信度: ████████░░ 82%           │   │
│ │ 来源: pattern_detected            │   │
│ │              [忽略] [应用 ▶]      │   │
│ └──────────────────────────────────┘   │
│ ┌──────────────────────────────────┐   │
│ │ 💡 完成待定步骤                    │   │
│ │ Canvas Step 3 "集成测试" 已就绪    │   │
│ │ 置信度: ████████████ 96%         │   │
│ │ 来源: canvas_sync                 │   │
│ │              [忽略] [应用 ▶]      │   │
│ └──────────────────────────────────┘   │
│                                        │
│ 🔄 获取建议  最后刷新: 2 分钟前        │
└────────────────────────────────────────┘
```

**交互:**
- "获取建议" → 调用 `proactive.suggest({ trigger: 'explicit' })`
- "应用" → 将建议内容作为 chat 消息发送 (自动填入输入框或直接发送)
- "忽略" → 从列表移除 (前端本地)
- 折叠/展开 → 记住状态到 localStorage
- 浮窗可拖拽调整位置

**数据模型:**
```typescript
interface ProactiveSuggestion {
  id: string;
  title: string;
  description: string;
  confidence: number;        // 0-1
  source: 'canvas_sync' | 'pattern_detected' | 'memory_insight' | 'timer';
  triggerType: 'timer' | 'event' | 'on_open' | 'explicit';
  actionMessage?: string;    // 如果有，可直接作为 chat 消息
}
```

### 2.3 前端设计 — Screen 17 完整页面

Screen 17 (Task Queue & Proactive Hub) 中的 Proactive 面板是 Chat 浮窗的扩展版本:
- 显示所有建议（不限数量）
- 历史建议记录
- 建议统计 (应用率、成功率)
- 触发配置（定时间隔、事件类型）

### 2.4 i18n 键

```json
{
  "proactive.title": "主动洞察",
  "proactive.getSuggestions": "获取建议",
  "proactive.lastRefresh": "最后刷新: {time}",
  "proactive.apply": "应用",
  "proactive.dismiss": "忽略",
  "proactive.confidence": "置信度",
  "proactive.source.canvas_sync": "画布同步",
  "proactive.source.pattern_detected": "模式检测",
  "proactive.source.memory_insight": "记忆洞察",
  "proactive.source.timer": "定时触发",
  "proactive.trigger.timer": "定时",
  "proactive.trigger.event": "事件",
  "proactive.trigger.on_open": "启动时",
  "proactive.trigger.explicit": "手动",
  "proactive.noSuggestions": "暂无建议",
  "proactive.applying": "正在应用..."
}
```

---

## 3. 任务队列管理 (GAP-B05)

### 3.1 后端现状
- RPC `task.getResult`: 参数 `{ correlationId: string }`
- 返回: `{ status: "running"|"completed"|"failed"|"not_found"|"expired", content?, error?, completedAt? }`
- RPC `task.listBySession`: 参数 `{ sessionId?, limit? }`
- 返回: `{ tasks: Array<TaskMeta> }`
- 内部: 任务通过 correlationId 追踪，结果保留 `retentionMinutes` 分钟

### 3.2 前端设计 — Screen 17 主面板

**任务卡片结构:**
```
┌─ Task Card ───────────────────────────────────────┐
│ 🔑 corr-8a2f-4b1c           chat           ⏱ 2m 34s │
│ Session: main                                      │
│ ████████████░░░░░░░░ 62%                           │
│ Status: ● RUNNING                   [取消]         │
└───────────────────────────────────────────────────┘
```

**筛选状态:**
```typescript
type TaskStatus = 'running' | 'completed' | 'failed' | 'expired';

interface TaskFilter {
  status: TaskStatus | 'all';
}
```

**轮询策略:**
- Running 状态任务: 每 2 秒轮询 `task.getResult`
- 页面可见时: 每 10 秒刷新 `task.listBySession`
- 页面不可见时: 停止轮询

**操作:**
| 操作 | 条件 | 实现 |
|------|------|------|
| 查看结果 | status=completed | 弹窗显示 `content` |
| 取消任务 | status=running | 需新增 `task.cancel` RPC (P2) |
| 清除过期 | status=expired | 前端过滤 + 可选批量清理 |
| 重试 | status=failed | 重新发送原始消息 |

### 3.3 需新增后端

**task.cancel RPC (可选, P2):**
```typescript
interface TaskCancelRequest {
  correlationId: string;
}
interface TaskCancelResponse {
  ok: boolean;
  reason?: string;  // "not_found" | "already_completed"
}
```

### 3.4 i18n 键

```json
{
  "tasks.title": "任务队列",
  "tasks.active": "{count} 个活跃",
  "tasks.filter.all": "全部",
  "tasks.filter.running": "运行中",
  "tasks.filter.completed": "已完成",
  "tasks.filter.failed": "失败",
  "tasks.filter.expired": "已过期",
  "tasks.viewResult": "查看结果",
  "tasks.cancel": "取消",
  "tasks.retry": "重试",
  "tasks.clearExpired": "清除过期",
  "tasks.duration": "耗时",
  "tasks.session": "会话",
  "tasks.type.chat": "聊天",
  "tasks.type.flow": "流程执行",
  "tasks.type.exploration": "探索",
  "tasks.type.retrospective": "回顾",
  "tasks.retention": "结果保留 {minutes} 分钟",
  "tasks.metrics.total": "今日总数",
  "tasks.metrics.successRate": "成功率",
  "tasks.metrics.avgDuration": "平均耗时",
  "tasks.metrics.activeSessions": "活跃会话"
}
```

---

## 4. 操作撤销 (GAP-B06)

### 4.1 后端现状
- 工具 `undo_last`: 基于 op-log 撤销上一个文件操作
- 依赖 `readLastUndoableEntry()` 获取可撤销操作
- 支持撤销的操作类型: write, edit (有原始内容记录的操作)

### 4.2 前端设计

**UI 元素:**
- **位置**: Chat 输入工具栏，Send 按钮左侧
- **外观**: `undo` Material Icon
- **状态**:
  - 有可撤销操作: 图标 `on-surface`，可点击
  - 无可撤销操作: 图标 `on-surface-variant/30`，disabled
  - 撤销执行中: 旋转动画

**交互:**
```
用户点击 Undo
  → 调用 tools.call({ name: 'undo_last', args: {} })
  → 成功: toast "已撤销: {操作描述}"
  → 失败: toast "没有可撤销的操作"
```

**何时启用/禁用:**
- 每次 AI 执行工具操作后，检查是否有可撤销项 → 启用按钮
- 撤销后 → 禁用按钮
- 新会话开始 → 禁用按钮

### 4.3 i18n 键

```json
{
  "chat.undo.button": "撤销",
  "chat.undo.success": "已撤销: {description}",
  "chat.undo.noUndoable": "没有可撤销的操作",
  "chat.undo.failed": "撤销失败: {error}"
}
```
