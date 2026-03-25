# GAP-DD-08: 技能与 MCP 管理 / Skills & MCP Management

> **覆盖 GAP**: GAP-B22, GAP-B23, GAP-B14, GAP-B24
> **影响屏幕**: Screen 11 (Flows & Skills Library)
> **优先级**: P1-P2
> **关联工单**: P4-01~P4-06, P5-09~P5-12

---

## 1. 功能概述

1. **自定义技能 CRUD** — 后端 `skills/` 完整实现 (加载/运行/转工具)，需 UI 管理
2. **MCP 服务器管理** — 后端 `mcp/` 完整实现 (连接/列出/调用)，需 UI 配置
3. **流程路由配置** — 后端 `flows.routes` 完整实现，需 UI 管理 (区别于 GAP-DD-03 的 Agent 路由)
4. **AI 流程生成** — 后端 `flow-from-llm.ts` 完整，需 UI (与 GAP-DD-04 §5 互补)

---

## 2. 自定义技能 CRUD (GAP-B22)

### 2.1 后端现状
- `Skill`: `{ name, description, inputSchema, scriptPath, scriptResolvedPath?, usageHint? }`
- `loadSkillsFromDir(workspaceRoot, dir?)`: 从 `.rzeclaw/skills/` 加载 JSON 定义
- `runSkillScript(scriptPath, args, workspaceRoot)`: Node 子进程执行脚本
- `skillsToToolDefs(skills)`: 转换为 ToolDef[] 供 Agent 使用
- 配置: `skills.enabled`, `skills.dir`

### 2.2 需新增后端

**新增 RPC: `skills.list`**
```typescript
interface SkillsListResponse {
  skills: Array<{
    name: string;
    description: string;
    inputSchema: SkillInputSchema;
    scriptPath: string;
    usageHint?: string;
    isEvolved: boolean;     // 来自 evolved_skills 目录
    fileSize: number;
  }>;
  dir: string;
  enabled: boolean;
}
```

**新增 RPC: `skills.create`**
```typescript
interface SkillCreateRequest {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
  script: string;            // 脚本内容
  scriptExtension?: string;  // 默认 ".js"
  usageHint?: string;
}
interface SkillCreateResponse {
  ok: boolean;
  name: string;
  scriptPath: string;
  error?: string;  // "already_exists" | "invalid_schema" | "script_error"
}
```

**新增 RPC: `skills.update`**
```typescript
interface SkillUpdateRequest {
  name: string;
  description?: string;
  inputSchema?: SkillInputSchema;
  script?: string;
  usageHint?: string;
}
```

**新增 RPC: `skills.delete`**
```typescript
interface SkillDeleteRequest {
  name: string;
}
interface SkillDeleteResponse {
  ok: boolean;
  error?: string;  // "not_found" | "evolved_protected"
}
```

**新增 RPC: `skills.test`**
```typescript
interface SkillTestRequest {
  name: string;
  args: Record<string, unknown>;
}
interface SkillTestResponse {
  ok: boolean;
  output: string;
  exitCode: number;
  durationMs: number;
  error?: string;
}
```

**实现方案:**
1. 创建: 写入 JSON 定义 + 脚本文件到 `skills.dir`
2. 更新: 覆写 JSON + 脚本
3. 删除: 移除 JSON + 脚本文件
4. 测试: 调用 `runSkillScript()` 并捕获输出
5. 热重载: 修改后自动 `loadSkillsFromDir()` 刷新

### 2.3 前端设计

**技能库面板:**
```
┌─ Skills Library ────────────── [+ New Skill] ────────┐
│                                                       │
│ [🔧 Custom (5)] [🧬 Evolved (3)] [All (8)]          │
│                                                       │
│ ┌─ git-commit-helper ────────────────────────────┐   │
│ │ Description: 自动生成 Git commit 消息          │   │
│ │ Input: { message: string, type: string }       │   │
│ │ Script: git-commit-helper.js (2.1 KB)          │   │
│ │ Hint: "commit", "提交"                         │   │
│ │                  [🧪 Test] [✏️ Edit] [🗑]      │   │
│ └────────────────────────────────────────────────┘   │
│ ┌─ code-formatter ───────────── 🧬 Evolved ─────┐   │
│ │ Description: 代码格式化工具                     │   │
│ │ Input: { filePath: string, style: string }     │   │
│ │ Script: evolved_skills/code-formatter.js       │   │
│ │                           [🧪 Test] [👁 View]  │   │
│ └────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────┘
```

**新建/编辑技能:**
```
┌─ Create Skill ───────────────────────────────────────┐
│                                                       │
│ Name:        [data-validator             ]           │
│ Description: [验证数据格式是否符合 schema ]           │
│ Usage Hint:  [validate, 验证, check       ]           │
│                                                       │
│ ┌─ Input Schema ─────────────────────────────────┐   │
│ │ { "type": "object",                            │   │
│ │   "properties": {                              │   │
│ │     "filePath": { "type": "string",            │   │
│ │       "description": "文件路径" },             │   │
│ │     "schemaName": { "type": "string" }         │   │
│ │   },                                           │   │
│ │   "required": ["filePath"]                     │   │
│ │ }                                              │   │
│ └────────────────────────────────────────────────┘   │
│                                                       │
│ ┌─ Script (JavaScript) ─────────────────────────┐   │
│ │ const fs = require('fs');                       │   │
│ │ const { filePath, schemaName } = JSON.parse(   │   │
│ │   process.argv[2]                              │   │
│ │ );                                             │   │
│ │ // validation logic...                         │   │
│ │ console.log(JSON.stringify({ valid: true }));   │   │
│ └────────────────────────────────────────────────┘   │
│                                                       │
│              [取消] [🧪 测试运行] [💾 保存]          │
└───────────────────────────────────────────────────────┘
```

---

## 3. MCP 服务器管理 (GAP-B23)

### 3.1 后端现状
- `McpServerEntry`: `{ name, command, args? }`
- `connectAndListTools(server)`: StdioClientTransport 连接，缓存工具列表
- `callMcpTool(server, toolName, args)`: 调用工具
- `mcpToolsToToolDefs()`: 转 ToolDef[] (前缀 `mcp_<serverName>_`)
- 配置: `mcp.enabled`, `mcp.servers[]`

### 3.2 需新增后端

**新增 RPC: `mcp.servers.list`**
```typescript
interface McpServersListResponse {
  servers: Array<{
    name: string;
    command: string;
    args: string[];
    status: 'connected' | 'disconnected' | 'error';
    toolCount: number;
    tools?: Array<{
      name: string;
      description?: string;
    }>;
    lastConnected?: string;
    error?: string;
  }>;
  enabled: boolean;
}
```

**新增 RPC: `mcp.servers.add`**
```typescript
interface McpServerAddRequest {
  name: string;
  command: string;
  args?: string[];
}
interface McpServerAddResponse {
  ok: boolean;
  name: string;
  toolCount: number;
  error?: string;  // "already_exists" | "connection_failed"
}
```

**新增 RPC: `mcp.servers.remove`**
```typescript
interface McpServerRemoveRequest {
  name: string;
}
interface McpServerRemoveResponse {
  ok: boolean;
  error?: string;  // "not_found"
}
```

**新增 RPC: `mcp.servers.reconnect`**
```typescript
interface McpServerReconnectRequest {
  name: string;
}
interface McpServerReconnectResponse {
  ok: boolean;
  toolCount: number;
  error?: string;
}
```

**实现方案:**
1. 持久化到 `.rzeclaw/mcp/servers.json`
2. 启动时合并配置文件 + 持久化的服务器列表
3. 添加时自动尝试连接并列出工具
4. 支持手动重连

### 3.3 前端设计

**MCP 服务器管理面板:**
```
┌─ MCP Servers ──────────────── [+ Add Server] ────────┐
│                                                       │
│ ┌─ local-tools ──── ● Connected ── 5 tools ──────┐  │
│ │ Command: node ./mcp-server/index.js            │  │
│ │ Tools: code_search, file_lint, test_run, ...   │  │
│ │              [🔄 Reconnect] [👁 Tools] [🗑]    │  │
│ └────────────────────────────────────────────────┘  │
│ ┌─ github-mcp ──── ● Connected ── 12 tools ─────┐  │
│ │ Command: npx @github/mcp-server                │  │
│ │ Tools: create_issue, list_prs, review_pr, ...  │  │
│ │              [🔄 Reconnect] [👁 Tools] [🗑]    │  │
│ └────────────────────────────────────────────────┘  │
│ ┌─ db-connector ── 🔴 Error ────────────────────┐  │
│ │ Command: node ./db-mcp/server.js               │  │
│ │ Error: Connection refused (ECONNREFUSED)       │  │
│ │              [🔄 Retry] [🗑]                   │  │
│ └────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────┘
```

**添加 MCP 服务器对话框:**
```
┌─ Add MCP Server ─────────────────────────────────────┐
│                                                       │
│ Name:    [data-analysis-server     ]                 │
│ Command: [node                     ]                 │
│ Args:    [./mcp-servers/data.js    ]                 │
│          [+ Add Arg]                                  │
│                                                       │
│                  [取消] [连接并添加]                   │
└───────────────────────────────────────────────────────┘
```

---

## 4. 流程路由配置 (GAP-B14)

### 4.1 后端现状
- `FlowsRouteEntry`: `{ hint, flowId, slotRules? }`
- `FlowsSlotRule`: `{ name, pattern }` (正则提取参数)
- `matchFlow()`: 消息 hint 匹配 → 按成功率排序
- 配置: `flows.routes[]`

### 4.2 需新增后端

**新增 RPC: `flows.routes.list`**
```typescript
interface FlowRoutesListResponse {
  routes: Array<{
    hint: string;
    flowId: string;
    slotRules: Array<{ name: string; pattern: string }>;
    successRate?: number;      // 来自 meta.json
    lastUsed?: string;
  }>;
}
```

**新增 RPC: `flows.routes.update`**
```typescript
interface FlowRoutesUpdateRequest {
  routes: Array<{
    hint: string;
    flowId: string;
    slotRules?: Array<{ name: string; pattern: string }>;
  }>;
}
interface FlowRoutesUpdateResponse {
  ok: boolean;
  routeCount: number;
}
```

### 4.3 前端设计

**流程路由表:**
```
┌─ Flow Routes ──────────────── [+ Add Route] ─────────┐
│                                                       │
│ # │ Hint Pattern    │ Flow ID          │ Rate │ Used  │
│ 1 │ "运行测试"      │ run_tests_v2     │ 92%  │ 3/22  │
│ 2 │ "部署"          │ deploy_staging   │ 78%  │ 3/20  │
│ 3 │ "代码审查"      │ code_review_v2   │ 85%  │ 3/18  │
│ 4 │ [new hint...]   │ [select flow ▾]  │ —    │ —     │
│                                                       │
│ ┌─ Slot Rules (Route #1) ───────────────────────┐    │
│ │ Slot: testSuite  │ Pattern: /test\s+(\w+)/   │    │
│ │ Slot: verbose    │ Pattern: /(-v|--verbose)/  │    │
│ │                                [+ Add Slot]   │    │
│ └────────────────────────────────────────────────┘    │
│                                                       │
│ ┌─ Test Route ──────────────────────────────────┐    │
│ │ Input: [运行测试 unit -v           ]          │    │
│ │ Match: Route #1 → run_tests_v2               │    │
│ │ Params: { testSuite: "unit", verbose: "-v" } │    │
│ └────────────────────────────────────────────────┘    │
│                                                       │
│                              [重置] [保存路由]        │
└───────────────────────────────────────────────────────┘
```

---

## 5. 工具合并概览 (辅助功能)

### 5.1 后端现状
- `getMergedTools()`: CORE_TOOLS + Skills + evolved_skills + MCP + IDE + replay_ops
- `tools.list` RPC: 返回合并后的工具列表

### 5.2 前端设计

**工具全景面板 (Screen 11 侧栏):**
```
┌─ All Available Tools ─── {totalCount} tools ─────────┐
│                                                       │
│ [Core (8)] [Skills (5)] [Evolved (3)] [MCP (17)] [IDE (3)]│
│                                                       │
│ ┌─ Core Tools ───────────────────────────────────┐   │
│ │ bash, read, write, edit, process, env_summary, │   │
│ │ undo_last, operation_status                    │   │
│ └────────────────────────────────────────────────┘   │
│ ┌─ MCP: local-tools ────────────────────────────┐   │
│ │ mcp_local-tools_code_search                    │   │
│ │ mcp_local-tools_file_lint                      │   │
│ │ mcp_local-tools_test_run                       │   │
│ └────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────┘
```

---

## 6. i18n 键

```json
{
  "skills.title": "技能库",
  "skills.create": "新建技能",
  "skills.edit": "编辑技能",
  "skills.delete": "删除技能",
  "skills.deleteConfirm": "确定删除技能 {name} 吗？",
  "skills.name": "技能名称",
  "skills.description": "描述",
  "skills.inputSchema": "输入模式",
  "skills.script": "脚本",
  "skills.usageHint": "使用提示",
  "skills.test": "测试运行",
  "skills.testResult": "输出: {output}  耗时: {duration}ms",
  "skills.save": "保存",
  "skills.custom": "自定义",
  "skills.evolved": "进化生成",
  "skills.all": "全部",
  "skills.evolvedProtected": "进化生成的技能无法手动删除",
  "mcp.title": "MCP 服务器",
  "mcp.addServer": "添加服务器",
  "mcp.removeServer": "移除服务器",
  "mcp.removeConfirm": "确定移除 MCP 服务器 {name} 吗？",
  "mcp.name": "服务器名称",
  "mcp.command": "命令",
  "mcp.args": "参数",
  "mcp.addArg": "添加参数",
  "mcp.connectAndAdd": "连接并添加",
  "mcp.reconnect": "重新连接",
  "mcp.viewTools": "查看工具",
  "mcp.connected": "已连接",
  "mcp.disconnected": "已断开",
  "mcp.error": "连接错误",
  "mcp.toolCount": "{count} 个工具",
  "flows.routes.title": "流程路由",
  "flows.routes.addRoute": "添加路由",
  "flows.routes.hint": "提示模式",
  "flows.routes.flowId": "流程 ID",
  "flows.routes.successRate": "成功率",
  "flows.routes.lastUsed": "最近使用",
  "flows.routes.slotRules": "参数提取规则",
  "flows.routes.addSlot": "添加参数",
  "flows.routes.testRoute": "测试路由",
  "flows.routes.testMatch": "匹配: {route} → {flowId}",
  "flows.routes.testParams": "参数: {params}",
  "flows.routes.noMatch": "未匹配任何路由",
  "flows.routes.save": "保存路由",
  "tools.overview.title": "可用工具",
  "tools.overview.core": "核心",
  "tools.overview.skills": "技能",
  "tools.overview.evolved": "进化",
  "tools.overview.mcp": "MCP",
  "tools.overview.ide": "IDE"
}
```
