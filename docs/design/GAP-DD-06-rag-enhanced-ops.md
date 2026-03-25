# GAP-DD-06: RAG 增强操作 / RAG Enhanced Operations

> **覆盖 GAP**: GAP-U21, GAP-U22, GAP-U23, GAP-U24, GAP-B15
> **影响屏幕**: Screen 12 (RAG Knowledge Nexus)
> **优先级**: P1-P2
> **关联工单**: P5-13~P5-17, P6-13~P6-15

---

## 1. 功能概述

1. **集合 CRUD** — 后端集合通过 config 静态配置，需动态创建/删除 UI
2. **动态连接管理** — 后端 `vectorEmbedding.collections` 无动态注册，需管理 UI
3. **摄入进度跟踪** — 后端 `ingestToCollection()` 无进度回调，需进度展示
4. **Motivation CRUD** — 后端 `motivation.ts` 有完整 CRUD，需 UI 管理
5. **重新索引** — 后端 `reindexCollection()` 已实现，`rag.reindex` RPC 存在，需 UI 触发

---

## 2. 集合 CRUD (GAP-U21)

### 2.1 后端现状
- `vectorEmbedding.collections`: `Record<string, VectorEmbeddingCollectionConfig>`
- 预定义集合: flows, skills, motivation (内置索引)
- 外部集合: 可通过 `ingestToCollection()` 添加文档
- 存储: `workspace/{indexStoragePath}/{collection_name}/vectors.json`

### 2.2 需新增后端

**新增 RPC: `rag.collections.list`**
```typescript
interface RagCollectionsListResponse {
  collections: Array<{
    name: string;
    vectorCount: number;
    fileSizeBytes: number;
    isBuiltin: boolean;     // flows/skills/motivation
    enabled: boolean;
    lastIndexed?: string;   // ISO 日期
  }>;
}
```

**新增 RPC: `rag.collections.create`**
```typescript
interface RagCollectionCreateRequest {
  name: string;               // 集合名称 (a-z0-9_-)
  description?: string;
  pathOverride?: string;      // 自定义存储路径
}
interface RagCollectionCreateResponse {
  ok: boolean;
  name: string;
  error?: string;  // "already_exists" | "invalid_name"
}
```

**新增 RPC: `rag.collections.delete`**
```typescript
interface RagCollectionDeleteRequest {
  name: string;
}
interface RagCollectionDeleteResponse {
  ok: boolean;
  deletedVectors: number;
  error?: string;  // "builtin_protected" | "not_found"
}
```

**实现方案:**
1. 动态集合注册到运行时 config 的 `vectorEmbedding.collections`
2. 持久化: 写入 `.rzeclaw/rag/custom_collections.json`
3. 启动时合并内置 + 自定义集合
4. 内置集合 (flows/skills/motivation) 禁止删除

### 2.3 前端设计

**集合管理面板:**
```
┌─ RAG Collections ───────────── [+ New Collection] ─┐
│                                                     │
│ ┌─ flows (内置) ──── 42 vectors ── 128 KB ──────┐ │
│ │ ● Enabled  │  Last indexed: 2026-03-22 14:30  │ │
│ │                            [🔄 Reindex]       │ │
│ └───────────────────────────────────────────────┘ │
│ ┌─ skills (内置) ─── 18 vectors ── 56 KB ──────┐ │
│ │ ● Enabled  │  Last indexed: 2026-03-22 14:30  │ │
│ │                            [🔄 Reindex]       │ │
│ └───────────────────────────────────────────────┘ │
│ ┌─ motivation (内置) ─ 8 vectors ── 24 KB ─────┐ │
│ │ ● Enabled  │  Last indexed: 2026-03-22 14:30  │ │
│ │                            [🔄 Reindex]       │ │
│ └───────────────────────────────────────────────┘ │
│ ┌─ project-docs ──── 156 vectors ── 480 KB ────┐ │
│ │ ● Enabled  │  Last indexed: 2026-03-21 09:15  │ │
│ │              [🔄 Reindex] [📤 Ingest] [🗑]   │ │
│ └───────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

**新建集合对话框:**
```
┌─ Create Collection ──────────────────────────┐
│                                               │
│ Name:         [api-documentation     ]       │
│ Description:  [API 参考文档集合       ]       │
│ Path (可选):  [                      ]       │
│                                               │
│            [取消] [创建集合]                   │
└───────────────────────────────────────────────┘
```

---

## 3. 文档摄入与进度 (GAP-U22, GAP-U23)

### 3.1 后端现状
- `ingestToCollection(config, workspace, collection, documents[])`: 批量嵌入 + 写入
- `documents`: `Array<{ id, text, metadata? }>`
- 无进度回调，同步执行

### 3.2 需新增后端

**新增 RPC: `rag.ingest`**
```typescript
interface RagIngestRequest {
  collection: string;
  documents: Array<{
    id: string;
    text: string;
    metadata?: Record<string, unknown>;
  }>;
}
interface RagIngestResponse {
  ok: boolean;
  indexed: number;
  errors: string[];
  correlationId: string;   // 用于进度追踪
}
```

**新增事件: `rag.ingest_progress`** (WebSocket 推送)
```typescript
interface RagIngestProgressEvent {
  correlationId: string;
  collection: string;
  total: number;
  processed: number;
  percentage: number;
  currentDocument?: string;
  status: 'processing' | 'embedding' | 'writing' | 'completed' | 'failed';
  error?: string;
}
```

**实现方案:**
1. 摄入任务拆分为批次 (每批 10 个文档)
2. 每批完成后发布 `rag.ingest_progress` 事件
3. 前端通过 WebSocket 订阅进度更新
4. 支持从文件上传 (复用 `file.upload` RPC)

### 3.3 前端设计

**摄入面板:**
```
┌─ Ingest Documents ─── Collection: project-docs ──┐
│                                                   │
│ 源: ○ 直接输入  ● 文件上传  ○ 目录扫描          │
│                                                   │
│ ┌─ 已选文件 ──────────────────────────────┐      │
│ │ [📄 api-v2.md (12KB) ✕]                │      │
│ │ [📄 guide.md (8KB) ✕]                  │      │
│ │ [📄 changelog.md (4KB) ✕]              │      │
│ └──────────────────────────────────────────┘      │
│                                                   │
│ [+ 添加文件]                                      │
│                                                   │
│ ┌─ 摄入进度 ──────────────────────────────┐      │
│ │ ████████████████░░░░ 78% (7/9 docs)    │      │
│ │ 当前: embedding api-v2.md chunk 3/5    │      │
│ │ 耗时: 4.2s  │  预计剩余: 1.1s          │      │
│ └──────────────────────────────────────────┘      │
│                                                   │
│                [取消] [开始摄入]                   │
└───────────────────────────────────────────────────┘
```

---

## 4. Motivation CRUD (GAP-U24)

### 4.1 后端现状
- `MotivationEntry`: `{ id, motivation_cluster[], description, translated, context_requirement?, confidence_default?, updated_at? }`
- `MotivationTranslated`: `{ state: "ROUTE_TO_LOCAL_FLOW" | "ESCALATE_TO_CLOUD" | "NO_ACTION" | "UNKNOWN"; flowId?, params?, events? }`
- `readMotivationEntries()` / `writeMotivationEntries()` / `addMotivationEntry()`
- Motivation 匹配阈值: `vectorEmbedding.motivationThreshold`

### 4.2 需新增后端

**新增 RPC: `rag.motivation.list`**
```typescript
interface MotivationListResponse {
  entries: MotivationEntry[];
  threshold: number;
}
```

**新增 RPC: `rag.motivation.create`**
```typescript
interface MotivationCreateRequest {
  motivation_cluster: string[];
  description: string;
  translated: MotivationTranslated;
  context_requirement?: string;
  confidence_default?: number;
}
interface MotivationCreateResponse {
  ok: boolean;
  id: string;
}
```

**新增 RPC: `rag.motivation.update`**
```typescript
interface MotivationUpdateRequest {
  id: string;
  motivation_cluster?: string[];
  description?: string;
  translated?: MotivationTranslated;
  context_requirement?: string;
  confidence_default?: number;
}
```

**新增 RPC: `rag.motivation.delete`**
```typescript
interface MotivationDeleteRequest {
  id: string;
}
```

### 4.3 前端设计

**Motivation 管理表:**
```
┌─ Motivation Entries ──────────── [+ Add Entry] ──────┐
│                                                       │
│ ┌─────────────────────────────────────────────────┐  │
│ │ ID: mot-001                                      │  │
│ │ Clusters: ["代码审查", "review", "检查代码"]    │  │
│ │ Description: 用户请求代码审查时触发本地流程      │  │
│ │ Action: ROUTE_TO_LOCAL_FLOW → code_review_v2     │  │
│ │ Confidence: 0.85                                 │  │
│ │                              [✏️ Edit] [🗑 Delete]│  │
│ └─────────────────────────────────────────────────┘  │
│ ┌─────────────────────────────────────────────────┐  │
│ │ ID: mot-002                                      │  │
│ │ Clusters: ["复杂问题", "深度分析"]              │  │
│ │ Description: 需要深度推理的问题上报云端          │  │
│ │ Action: ESCALATE_TO_CLOUD                        │  │
│ │ Confidence: 0.90                                 │  │
│ │                              [✏️ Edit] [🗑 Delete]│  │
│ └─────────────────────────────────────────────────┘  │
│                                                       │
│ Matching Threshold: [0.75] ← 可调整                  │
└───────────────────────────────────────────────────────┘
```

**新建/编辑 Motivation 对话框:**
```
┌─ Create Motivation Entry ────────────────────────────┐
│                                                       │
│ Clusters (逗号分隔):                                  │
│ [代码审查, review, code review, 检查代码]            │
│                                                       │
│ Description:                                          │
│ [用户请求代码审查时，路由到本地代码审查流程]          │
│                                                       │
│ Action:                                               │
│ [ROUTE_TO_LOCAL_FLOW ▾]                              │
│                                                       │
│ Target Flow: [code_review_v2 ▾]                      │
│ Context Requirement: [需要提供文件路径           ]    │
│ Default Confidence: [0.85]                            │
│                                                       │
│                   [取消] [保存]                        │
└───────────────────────────────────────────────────────┘
```

---

## 5. 重新索引 (GAP-B15)

### 5.1 后端现状
- `rag.reindex` RPC: `{ collection: "flows"|"skills"|"motivation", libraryPath? }`
- 返回: `{ indexed: number; errors: string[] }`
- 支持热重载后重新索引

### 5.2 前端设计

**重新索引按钮** (集成在集合卡片中):
- 点击 [🔄 Reindex] → 确认对话框 → 调用 `rag.reindex`
- 执行中: 按钮显示旋转动画
- 完成: toast "已索引 {indexed} 个向量"
- 错误: toast 显示 errors 列表

---

## 6. i18n 键

```json
{
  "rag.collections.title": "RAG 集合",
  "rag.collections.create": "新建集合",
  "rag.collections.delete": "删除集合",
  "rag.collections.deleteConfirm": "确定删除集合 {name} 吗？所有向量数据将被删除。",
  "rag.collections.builtinProtected": "内置集合无法删除",
  "rag.collections.name": "集合名称",
  "rag.collections.description": "描述",
  "rag.collections.vectorCount": "{count} 个向量",
  "rag.collections.lastIndexed": "上次索引: {time}",
  "rag.collections.enabled": "已启用",
  "rag.collections.builtin": "内置",
  "rag.reindex.button": "重新索引",
  "rag.reindex.confirm": "确定重新索引集合 {name} 吗？",
  "rag.reindex.success": "已索引 {count} 个向量",
  "rag.reindex.error": "索引错误: {errors}",
  "rag.ingest.title": "文档摄入",
  "rag.ingest.source.direct": "直接输入",
  "rag.ingest.source.file": "文件上传",
  "rag.ingest.source.directory": "目录扫描",
  "rag.ingest.addFiles": "添加文件",
  "rag.ingest.start": "开始摄入",
  "rag.ingest.progress": "{percentage}% ({processed}/{total} 文档)",
  "rag.ingest.embedding": "正在嵌入 {document}",
  "rag.ingest.completed": "摄入完成: {count} 个文档",
  "rag.ingest.failed": "摄入失败: {error}",
  "rag.motivation.title": "Motivation 条目",
  "rag.motivation.create": "添加条目",
  "rag.motivation.edit": "编辑条目",
  "rag.motivation.delete": "删除条目",
  "rag.motivation.clusters": "聚类关键词",
  "rag.motivation.description": "描述",
  "rag.motivation.action": "动作",
  "rag.motivation.targetFlow": "目标流程",
  "rag.motivation.confidence": "置信度",
  "rag.motivation.contextRequirement": "上下文要求",
  "rag.motivation.threshold": "匹配阈值",
  "rag.motivation.action.routeLocal": "路由到本地流程",
  "rag.motivation.action.escalateCloud": "上报云端",
  "rag.motivation.action.noAction": "无操作",
  "rag.motivation.action.unknown": "未知"
}
```
