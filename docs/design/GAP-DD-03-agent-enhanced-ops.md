# GAP-DD-03: 智能体增强操作 / Agent Enhanced Operations

> **覆盖 GAP**: GAP-B12, GAP-B13, GAP-B19, GAP-B20, GAP-U08, GAP-U09, GAP-U10, GAP-U11, GAP-U12
> **影响屏幕**: Screen 05 (Agent v2), Screen 18 (Event Bus Monitor)
> **优先级**: P1-P2
> **关联工单**: P3-13~P3-17, P8-16

---

## 1. 功能概述

1. **团队 CRUD** — 后端仅有 `swarm.getTeams` 读取，需增删改查
2. **路由规则管理** — 后端 `config.agents.routes` 需 UI 管理
3. **事件总线监控** — 后端 `event-bus/` 完整实现，需 UI 可视化
4. **委派链路追踪** — 后端 `collaboration/` 完整实现，需 UI 展示
5. **Token 消耗追踪** — 后端 Agent 实例无 Token 计数

---

## 2. 团队 CRUD (GAP-B12)

### 2.1 需新增后端 RPC

```typescript
// swarm.createTeam
interface CreateTeamRequest {
  teamId: string;
  name: string;
  description?: string;
  agentIds: string[];          // 蓝图 ID 列表
  defaultAgentId?: string;
}
interface CreateTeamResponse {
  ok: boolean;
  teamId: string;
}

// swarm.updateTeam
interface UpdateTeamRequest {
  teamId: string;
  name?: string;
  description?: string;
  agentIds?: string[];
  defaultAgentId?: string;
}

// swarm.deleteTeam
interface DeleteTeamRequest {
  teamId: string;
}
interface DeleteTeamResponse {
  ok: boolean;
  reason?: string;  // "in_use" 如果有活跃实例
}
```

**实现**: 修改运行时 config 中的 `swarm.teams` 数组并持久化到配置文件。

### 2.2 前端设计

**新建团队表单 (内联):**
```
┌─ + New Team ──────────────────────────────────┐
│ Team ID:   [core-research-v2          ]       │
│ Name:      [Core Research Team        ]       │
│ Agents:    [☑ Analyst] [☑ Researcher] [☐ Critic] │
│ Default:   [Analyst ▾]                        │
│                       [取消] [创建团队]        │
└───────────────────────────────────────────────┘
```

**团队卡片增强:**
```
┌─ Core Dev Swarm ──────────── [✏️] [🗑️] ─┐
│ 3 Agents │ IDE, Bash, MCP │ ● Active    │
└───────────────────────────────────────────┘
```

---

## 3. 路由规则管理 (GAP-B13)

### 3.1 后端现状
- 配置项 `agents.routes`: `Array<{ hint: string, agentId: string }>`
- 用于 intent → agent 映射

### 3.2 需新增后端 RPC

```typescript
// agents.routes.list
interface AgentRoutesListResponse {
  routes: Array<{
    hint: string;
    agentId: string;
    priority?: number;
  }>;
}

// agents.routes.update
interface AgentRoutesUpdateRequest {
  routes: Array<{
    hint: string;
    agentId: string;
    priority?: number;
  }>;
}
```

### 3.3 前端设计

**路由规则表:**
```
┌─ Agent Routing Rules ─────────────────── [+ Add Rule] ─┐
│ # │ Intent Pattern       │ Target Agent  │ Priority │   │
│ 1 │ analyze*             │ Analyst    ▾  │ 100      │ 🗑 │
│ 2 │ research*            │ Researcher ▾  │ 90       │ 🗑 │
│ 3 │ review*              │ Critic     ▾  │ 80       │ 🗑 │
│ 4 │ [new rule...]        │ [select]   ▾  │ [0  ]    │   │
└───────────────────────────────────────────────────────┘
```

---

## 4. 事件总线监控 (GAP-B19)

### 4.1 后端现状
- 8 个事件主题: `chat.request`, `chat.response`, `chat.stream`, `task.status`, `task.plan_ready`, `delegate.request`, `delegate.result`, `swarm.broadcast`, `pipeline.stage_done`
- 事件通过内存发布/订阅

### 4.2 需新增后端

**新增 RPC: `eventbus.subscribe`** (WebSocket 推送)
```typescript
// 客户端订阅事件流
interface EventBusSubscribeRequest {
  topics?: string[];    // 为空则订阅全部
  sessionId?: string;   // 过滤特定会话
}

// 服务端推送事件 (通过 WebSocket stream)
interface EventBusEvent {
  topic: string;
  correlationId?: string;
  payload: unknown;     // 截断/摘要版
  timestamp: number;
}
```

**实现方案:**
1. Gateway 在事件总线注册监听器
2. 通过 WebSocket `{ stream: "eventbus", event: EventBusEvent }` 推送
3. 前端按 topic 着色展示
4. 支持 topic 过滤、暂停/恢复

### 4.3 前端设计 (Screen 18)

**事件流终端:**
```
┌─ Event Bus Monitor ─── ● LIVE 42 msg/s ── [⏸ Pause] ─┐
│                                                        │
│ [chat.request] [chat.response] [delegate.*] [swarm.*]  │ ← 过滤器
│                                                        │
│ [14:02:11.234] chat.request   corr-8a2f │ {"message... │
│ [14:02:11.890] chat.response  corr-8a2f │ {"content... │
│ [14:02:12.001] delegate.req   corr-9b3g │ {"source":...│
│ [14:02:12.456] pipeline.done  corr-9b3g │ {"stage":1.. │
│ [14:02:12.789] swarm.broad    team-core │ {"type":"c.. │
│ ...                                                    │
└────────────────────────────────────────────────────────┘
```

**topic 颜色映射:**
| Topic | 颜色 | 标签 |
|-------|------|------|
| chat.request | `primary` | REQ |
| chat.response | `secondary` | RES |
| chat.stream | `primary/50` | STRM |
| delegate.request | `tertiary` | DLGT |
| delegate.result | `#4CAF50` | DLGT_R |
| swarm.broadcast | `#9C27B0` | SWARM |
| pipeline.stage_done | `#FF9800` | PIPE |
| task.status | `#FFC107` | TASK |

### 4.4 i18n 键

```json
{
  "eventbus.title": "事件总线监控",
  "eventbus.live": "实时",
  "eventbus.paused": "已暂停",
  "eventbus.msgRate": "{rate} 消息/秒",
  "eventbus.pause": "暂停",
  "eventbus.resume": "恢复",
  "eventbus.filter": "筛选主题",
  "eventbus.totalToday": "今日事件总数",
  "eventbus.clear": "清空日志"
}
```

---

## 5. 委派链路追踪 (GAP-B20)

### 5.1 后端现状
- `collaboration/delegation.ts`: `requestDelegation()`, `subscribeToDelegateRequest()`
- 委派事件: `delegate.request` → 处理 → `delegate.result`
- 每个委派有唯一 delegationId

### 5.2 需新增后端

**新增 RPC: `delegation.list`**
```typescript
interface DelegationListRequest {
  sessionId?: string;
  status?: 'pending' | 'in_progress' | 'completed' | 'failed';
  limit?: number;
}

interface DelegationEntry {
  delegationId: string;
  sourceAgentId: string;
  targetAgentId: string;
  requestMessage: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  result?: string;
  latencyMs?: number;
  createdAt: number;
  completedAt?: number;
}

interface DelegationListResponse {
  delegations: DelegationEntry[];
}
```

### 5.3 前端设计 (Screen 18)

**委派链可视化:**
```
┌─ Active Delegations (3) ──────────────────────────┐
│                                                    │
│  🔵 Analyst_01  ──request──▶  🟢 Researcher_X     │
│  │ "查找最新的 RFC 文档..."                        │
│  │ Status: ● IN_PROGRESS    Latency: 1.2s         │
│  │                                                 │
│  🔵 Architect_01 ──request──▶  🟡 Critic_Alpha    │
│  │ "评审系统架构方案..."                            │
│  │ Status: ● COMPLETED ✓    Latency: 3.4s         │
│                                                    │
│ ▸ 委派历史 (最近 5 条)                             │
└────────────────────────────────────────────────────┘
```

---

## 6. Token 消耗追踪 (GAP-U12)

### 6.1 需新增后端

**在 Agent 实例上累加 Token 计数:**

```typescript
// 修改 agents/instances.ts 中的 AgentInstance 接口
interface AgentInstance {
  // ...现有字段
  tokenUsage: {
    input: number;
    output: number;
    total: number;
  };
}
```

**实现:**
- 在 `runAgentLoop` 每次 LLM 调用后，累加到对应 Agent 实例的 `tokenUsage`
- `agents.list` RPC 返回中包含 `tokenUsage`

### 6.2 前端设计

在 Agent 实例配置面板中:
```
Token 用量: ████████░░░░░░░ 1.2M / 5M (24%)
  输入: 820K │ 输出: 380K
```

### 6.3 i18n 键

```json
{
  "agents.team.create": "新建团队",
  "agents.team.edit": "编辑团队",
  "agents.team.delete": "删除团队",
  "agents.team.deleteConfirm": "确定删除团队 {name} 吗？",
  "agents.team.inUse": "团队有活跃实例，无法删除",
  "agents.routing.title": "路由规则",
  "agents.routing.addRule": "添加规则",
  "agents.routing.intentPattern": "意图模式",
  "agents.routing.targetAgent": "目标智能体",
  "agents.routing.priority": "优先级",
  "agents.token.usage": "Token 用量",
  "agents.token.input": "输入",
  "agents.token.output": "输出",
  "agents.delegation.title": "活跃委派",
  "agents.delegation.history": "委派历史",
  "agents.delegation.source": "委派方",
  "agents.delegation.target": "接收方",
  "agents.delegation.status": "状态"
}
```
