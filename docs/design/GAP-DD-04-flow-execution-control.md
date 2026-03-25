# GAP-DD-04: 流程执行控制 / Flow Execution Control

> **覆盖 GAP**: GAP-U35, GAP-U36, GAP-U37, GAP-U38, GAP-B24
> **影响屏幕**: Screen 15 (Flow Execution Monitor), Screen 11 (Flows & Skills Library)
> **优先级**: P1-P2
> **关联工单**: P4-07~P4-10, P5-11, P5-12

---

## 1. 功能概述

1. **流程暂停/中止** — 后端无显式 pause/abort，需新增控制机制
2. **BT 注入终端** — 后端有完整 BT 引擎，需实时编辑/注入 UI
3. **实时状态推送** — 后端 BT/FSM 执行无实时状态推送，需新增 WebSocket 推送
4. **AI 流程生成** — 后端 `flow-from-llm.ts` 完整实现，需 UI 触发入口
5. **流程拓扑自迭代** — 后端 `topology-iterate.ts` 完整，需 UI 展示编辑操作

---

## 2. 流程暂停/中止 (GAP-U35)

### 2.1 后端现状
- BT 引擎 (`engine-bt.ts`): Sequence/Selector 逐节点执行，无中断点
- FSM 引擎 (`engine-fsm.ts`): 状态循环执行，最多 100 步
- 超时控制: `runToolWithTimeout()` 单工具级别超时 (默认 60s)
- 确认机制: `scope="confirm"` 工具返回 `REQUIRES_CONFIRMATION` 暂停流程

### 2.2 需新增后端

**执行控制信号:**
```typescript
// 新增: flows/control.ts
interface FlowExecutionControl {
  correlationId: string;
  signal: 'pause' | 'resume' | 'abort';
}

// 全局控制信号映射
const activeFlowControls = new Map<string, FlowExecutionControl>();

// 在 BT/FSM 引擎每步执行前检查
function checkFlowControl(correlationId: string): 'continue' | 'paused' | 'aborted';
```

**新增 RPC: `flows.control`**
```typescript
interface FlowControlRequest {
  correlationId: string;
  action: 'pause' | 'resume' | 'abort';
}
interface FlowControlResponse {
  ok: boolean;
  status: 'paused' | 'running' | 'aborted' | 'not_found';
}
```

**实现方案:**
1. 在 `runBTNode()` 和 `runFSM()` 的每步循环开头插入 `checkFlowControl(correlationId)`
2. `pause` → 进入 `await` 等待 `resume` 信号 (Promise-based)
3. `abort` → 抛出 `FlowAbortedError`，上层 catch 并记录 outcome
4. 通过 `correlationId` 关联执行实例

### 2.3 前端设计 (Screen 15)

**执行控制栏:**
```
┌─ Flow: data-pipeline-v3 ─── ● RUNNING ──────────────┐
│                                                       │
│  Step 3/7: extract_data          ⏱ 12.4s             │
│  ████████████░░░░░░░░ 43%                             │
│                                                       │
│  [⏸ Pause]  [⏹ Abort]  [📋 View Log]                │
└───────────────────────────────────────────────────────┘

// 暂停状态:
┌─ Flow: data-pipeline-v3 ─── ⏸ PAUSED ───────────────┐
│                                                       │
│  Step 3/7: extract_data (暂停于此步)                   │
│  ████████████░░░░░░░░ 43%                             │
│                                                       │
│  [▶ Resume]  [⏹ Abort]  [📋 View Log]                │
└───────────────────────────────────────────────────────┘
```

---

## 3. BT 注入终端 (GAP-U36)

### 3.1 后端现状
- `applyEditOps()` 支持 5 种结构编辑: insertNode, removeNode, replaceSubtree, reorderChildren, wrapWithDecorator
- `createFlow()` / `replaceFlow()` 支持 CRUD
- BT 节点类型: Sequence, Selector, Fallback, Action, Condition, FSM, LLM

### 3.2 需新增后端

**新增 RPC: `flows.editOps`**
```typescript
interface FlowEditOpsRequest {
  flowId: string;
  ops: EditOp[];  // 复用现有 EditOp 类型
}
interface FlowEditOpsResponse {
  ok: boolean;
  flowId: string;
  nodeCount: number;  // 编辑后节点数
  error?: string;
}
```

**新增 RPC: `flows.getTree`**
```typescript
interface FlowGetTreeRequest {
  flowId: string;
}
interface FlowGetTreeResponse {
  flowId: string;
  type: 'bt' | 'fsm';
  tree: BTFlowDef | FSMFlowDef;
}
```

### 3.3 前端设计 (Screen 15)

**BT 树可视化 + 编辑面板:**
```
┌─ Behavior Tree: data-pipeline-v3 ──── [+ Node] [💾 Save] ─┐
│                                                             │
│  ┌─ Sequence (root) ────────────────────────┐              │
│  │  ┌─ Action: validate_input ──────────┐   │              │
│  │  │  tool: read                        │   │              │
│  │  │  args: { path: "{{params.file}}" } │   │              │
│  │  └────────────────────────────────────┘   │              │
│  │  ┌─ Selector ────────────────────────┐   │              │
│  │  │  ┌─ Action: extract_data ─────┐   │   │              │
│  │  │  │  tool: bash  ● RUNNING     │   │   │              │
│  │  │  └────────────────────────────┘   │   │              │
│  │  │  ┌─ LLM (fallback) ──────────┐   │   │              │
│  │  │  │  ⚡ last resort            │   │   │              │
│  │  │  └────────────────────────────┘   │   │              │
│  │  └────────────────────────────────────┘   │              │
│  └───────────────────────────────────────────┘              │
│                                                             │
│ ┌─ Edit Operations ─────────────────────────────┐          │
│ │ > insertNode: parent=root, index=2            │          │
│ │   type=Action, tool=write, args={...}         │          │
│ │                            [Apply] [Cancel]   │          │
│ └────────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────┘
```

**节点右键菜单:**
- 插入子节点 (Insert Child)
- 删除节点 (Remove)
- 替换子树 (Replace Subtree)
- 重排子节点 (Reorder)
- 包装装饰器 (Wrap with Decorator)

---

## 4. 实时状态推送 (GAP-U37)

### 4.1 后端现状
- BT/FSM 引擎执行后只返回最终结果
- 事件总线有 `pipeline.stage_done` 主题但未用于实时节点进度
- WebSocket 已有 streaming 支持 (`chat.stream`)

### 4.2 需新增后端

**新增事件主题: `flow.node_progress`**
```typescript
interface FlowNodeProgressEvent {
  correlationId: string;
  flowId: string;
  nodeIndex: number;
  totalNodes: number;
  nodeType: string;     // "Action" | "Condition" | "Sequence" | ...
  nodeName?: string;    // Action 节点的 tool 名称
  status: 'entering' | 'executing' | 'success' | 'failure' | 'skipped';
  resultSummary?: string;
  elapsedMs: number;
  timestamp: number;
}
```

**新增 RPC: `flows.subscribe`** (WebSocket 推送)
```typescript
interface FlowSubscribeRequest {
  correlationId?: string;  // 特定执行实例，为空则订阅全部
}
// 服务端推送: { stream: "flow_progress", event: FlowNodeProgressEvent }
```

**实现方案:**
1. 在 `runBTNode()` 每个节点执行前后发布 `flow.node_progress` 事件
2. 在 `runFSM()` 每次状态转换时发布事件
3. Gateway 注册监听器，通过 WebSocket 推送给订阅客户端
4. 前端根据 `correlationId` 过滤并实时更新节点状态

---

## 5. AI 流程生成 (GAP-B24)

### 5.1 后端现状
- `isExplicitGenerateFlowRequest()`: 检测 "做一个流程/工作流" 等关键词
- `runLLMGenerateFlow()`: LLM 生成 `{ intent, steps[], hint }`
- `specFromGenerateRequest()`: 转换为 BT Sequence 流程
- `createFlow()`: 持久化到 `libraryPath/flowId.json`
- 配置: `flows.generateFlow.enabled`, `triggerOnNoMatch`

### 5.2 前端设计 (Screen 11)

**AI 生成入口:**
```
┌─ Flows Library ──────────── [+ New Flow] [🤖 AI Generate] ─┐
│                                                              │
│ ┌─ AI Flow Generator ──────────────────────────────────┐    │
│ │ 描述你想要的工作流:                                     │    │
│ │ ┌─────────────────────────────────────────────────┐  │    │
│ │ │ 每天检查代码仓库，运行测试，如果失败则发送通知     │  │    │
│ │ └─────────────────────────────────────────────────┘  │    │
│ │                                                      │    │
│ │ 高级选项:                                            │    │
│ │  路由提示 (hint): [daily-ci-check    ]               │    │
│ │  流程 ID:         [daily_ci_check_v1 ]               │    │
│ │                                                      │    │
│ │                     [取消] [🤖 生成流程]              │    │
│ └──────────────────────────────────────────────────────┘    │
│                                                              │
│ ┌─ 生成预览 ──────────────────────────────────────────┐    │
│ │ Intent: 每日CI检查                                   │    │
│ │ Steps:                                               │    │
│ │   1. 检查代码仓库更新                                │    │
│ │   2. 运行测试套件                                    │    │
│ │   3. 判断测试结果                                    │    │
│ │   4. 发送通知 (失败时)                               │    │
│ │                                                      │    │
│ │ BT 结构: Sequence → 4 Action nodes                  │    │
│ │                   [修改] [保存到库]                   │    │
│ └──────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

---

## 6. 流程拓扑自迭代 (GAP-U38)

### 6.1 后端现状
- `runTopologyIteration()`: LLM 生成 EditOp[] 修改 BT 结构
- 支持: insertNode, removeNode, replaceSubtree, reorderChildren, wrapWithDecorator
- 失败替换: 失败率 ≥ 50% 或连续 3 次失败时触发
- `flows.scanFailureReplacement` RPC 已存在

### 6.2 前端设计 (Screen 15)

**拓扑迭代面板:**
```
┌─ Topology Evolution ─────────────────────────────────┐
│                                                       │
│ Flow: data-pipeline-v3                                │
│ Success Rate: ██████░░░░ 60% (6/10)                  │
│ Consecutive Failures: 2                               │
│ Status: ⚠ 接近替换阈值                               │
│                                                       │
│ ┌─ Suggested Edits ─────────────────────────────┐    │
│ │ 1. insertNode: 在 extract_data 前添加          │    │
│ │    validate_format (Condition)                  │    │
│ │ 2. wrapWithDecorator: extract_data 添加         │    │
│ │    retry(maxRetries=3)                          │    │
│ │ 3. removeNode: deprecated_transform             │    │
│ └────────────────────────────────────────────────┘    │
│                                                       │
│ [预览变更]  [应用全部]  [选择性应用]                   │
└───────────────────────────────────────────────────────┘
```

---

## 7. i18n 键

```json
{
  "flows.control.pause": "暂停",
  "flows.control.resume": "恢复",
  "flows.control.abort": "中止",
  "flows.control.abortConfirm": "确定中止流程 {flowId} 吗？",
  "flows.control.paused": "已暂停",
  "flows.control.running": "运行中",
  "flows.control.aborted": "已中止",
  "flows.control.viewLog": "查看日志",
  "flows.control.step": "步骤 {current}/{total}",
  "flows.control.elapsed": "耗时",
  "flows.bt.title": "行为树",
  "flows.bt.insertNode": "插入节点",
  "flows.bt.removeNode": "删除节点",
  "flows.bt.replaceSubtree": "替换子树",
  "flows.bt.reorderChildren": "重排子节点",
  "flows.bt.wrapDecorator": "包装装饰器",
  "flows.bt.apply": "应用",
  "flows.bt.save": "保存",
  "flows.bt.nodeType": "节点类型",
  "flows.generate.title": "AI 生成流程",
  "flows.generate.describe": "描述你想要的工作流",
  "flows.generate.hint": "路由提示",
  "flows.generate.flowId": "流程 ID",
  "flows.generate.generate": "生成流程",
  "flows.generate.preview": "生成预览",
  "flows.generate.saveToLibrary": "保存到库",
  "flows.generate.modify": "修改",
  "flows.evolution.title": "拓扑演化",
  "flows.evolution.successRate": "成功率",
  "flows.evolution.consecutiveFailures": "连续失败",
  "flows.evolution.nearThreshold": "接近替换阈值",
  "flows.evolution.suggestedEdits": "建议编辑",
  "flows.evolution.previewChanges": "预览变更",
  "flows.evolution.applyAll": "应用全部",
  "flows.evolution.selectiveApply": "选择性应用",
  "flows.subscribe.connected": "已连接流程监控",
  "flows.subscribe.disconnected": "流程监控断开"
}
```
