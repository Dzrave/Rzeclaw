# GAP-DD-01: 隐私与会话增强 / Privacy & Session Enhancement

> **覆盖 GAP**: GAP-B01, GAP-B02, GAP-B03, GAP-B25, GAP-U01
> **影响屏幕**: Screen 01 (Chat)
> **优先级**: P0-P1
> **关联工单**: P2-11, P2-12, P2-13, P2-15, P8-09

---

## 1. 功能概述

本设计覆盖聊天界面中 5 项缺失功能:
1. **隐私会话模式** — 后端已完整实现 (WO-SEC-006)，需前端开关与状态指示
2. **会话快照保存** — RPC `session.saveSnapshot` 已存在，需 UI 按钮
3. **作用域授权弹窗** — RPC `scope.grantSession` 已存在，需交互式确认 UI
4. **会话类型选择器** — 后端 5 种类型已支持，需 UI 选择器
5. **文件附件上传** — 后端无此功能，需新增完整链路

---

## 2. 隐私会话模式 (GAP-B01)

### 2.1 后端现状
- `chat` RPC 支持 `privacy: boolean` 参数
- 隐私会话特性: 无 L1 写入、无持久快照、隔离存储、ops.log 脱敏/省略
- 配置项: `security.privacySessionToolPolicy` (allow_all | read_only | none)
- 配置项: `security.opsLogPrivacySessionPolicy` (omit | redact)
- 隐私隔离存储保留天数: `security.privacyIsolationRetentionDays`

### 2.2 前端设计

**UI 元素:**
```
┌─ Chat Input Toolbar ──────────────────────────────┐
│ [📎 Attach] [📊 Dataset] [...] [🔒 Privacy] [↩ Undo] [▶ Send] │
└───────────────────────────────────────────────────┘
```

- **位置**: 聊天输入工具栏，Send 按钮左侧
- **外观**: 盾牌/锁图标按钮 (`shield` Material Icon)
- **状态**:
  - 未激活: 图标颜色 `on-surface-variant`，无边框
  - 激活: 图标颜色 `error`，背景 `error/10`，边框 `error/30`
- **激活后效果**:
  - 会话标题旁显示 `PRIVATE` 红色徽章 (badge)
  - 工具栏底部出现警告条: "⚠ Privacy Mode: 消息不会被持久化到长期记忆"
  - 该警告条背景色 `error/5`，文字 `error-dim`

**交互流程:**
```
用户点击 Privacy 图标
  → 如果当前会话非隐私:
    → 显示确认弹窗:
      标题: "启用隐私模式"
      说明: "启用后，本次会话的消息将不会写入长期记忆（L1/L2），
             操作日志将被脱敏处理。此操作不可在会话中途撤销。"
      选项: [取消] [启用隐私模式 (error color)]
    → 确认后: 设置 sessionPrivacy = true
    → 后续所有 chat RPC 调用自动附加 privacy: true
  → 如果已是隐私会话:
    → 显示 toast: "隐私模式已激活，无法在当前会话中关闭"
```

**数据流:**
```typescript
// 前端状态
interface SessionState {
  sessionId: string;
  privacy: boolean;  // 新增
  // ...
}

// chat RPC 调用
gateway.call('chat', {
  message: userInput,
  sessionId: currentSession.sessionId,
  privacy: currentSession.privacy,  // 新增
  sessionType: currentSession.type,
});
```

### 2.3 i18n 键

```json
{
  "chat.privacy.toggle": "隐私模式",
  "chat.privacy.badge": "私密",
  "chat.privacy.confirmTitle": "启用隐私模式",
  "chat.privacy.confirmDesc": "启用后，本次会话的消息将不会写入长期记忆（L1/L2），操作日志将被脱敏处理。此操作不可在会话中途撤销。",
  "chat.privacy.confirmButton": "启用隐私模式",
  "chat.privacy.alreadyActive": "隐私模式已激活，无法在当前会话中关闭",
  "chat.privacy.warning": "Privacy Mode: 消息不会被持久化到长期记忆"
}
```

---

## 3. 会话快照保存 (GAP-B02)

### 3.1 后端现状
- RPC `session.saveSnapshot` 已实现
- 参数: `{ sessionId?: string, workspace?: string }`
- 返回: `{ sessionId, saved: boolean, reason?: "privacy", highRiskOpsSuggestedReview?: boolean }`

### 3.2 前端设计

**UI 元素:**
- **位置**: 会话标题栏右侧，与会话名称同行
- **外观**: `save` Material Icon，`on-surface-variant` 颜色
- **Hover**: 显示 tooltip "保存快照"
- **点击反馈**: 图标短暂变为 `primary` 色 + 旋转动画 → 成功后变为 `✓` 1.5s → 恢复原状

**交互流程:**
```
用户点击 Save 图标
  → 调用 session.saveSnapshot({ sessionId })
  → 成功: toast 提示 "快照已保存"
  → 隐私会话: toast 提示 "隐私会话无法保存快照" (warning)
  → 高风险操作提示: 弹窗 "本次会话包含高风险操作，建议审查后再保存"
```

### 3.3 i18n 键

```json
{
  "chat.snapshot.save": "保存快照",
  "chat.snapshot.saved": "快照已保存",
  "chat.snapshot.privacyDenied": "隐私会话无法保存快照",
  "chat.snapshot.highRiskWarning": "本次会话包含高风险操作，建议审查后再保存"
}
```

---

## 4. 作用域授权弹窗 (GAP-B03)

### 4.1 后端现状
- RPC `scope.grantSession` 已实现
- 参数: `{ scope: string, sessionId?: string }`
- 返回: `{ ok: boolean, scope: string, sessionId: string }`
- 可用范围: `file_read`, `file_write`, `env_read`, `net_connect`, `process_spawn`

### 4.2 前端设计

**触发场景**: 当 AI 执行工具时，如果工具需要特定权限且当前会话未授权，应从 chat 流的响应中检测到权限需求并弹出确认。

**确认弹窗:**
```
┌─ 权限请求 ────────────────────────────┐
│ 🔑 需要授权: file_write              │
│                                       │
│ 目标: /workspace/src/config.ts        │
│ 操作: 写入文件                        │
│ 风险等级: ⚠ 中                        │
│                                       │
│ ┌─────────────────────────────────┐   │
│ │ 授权有效期                       │   │
│ │ ○ 本次操作  ○ 本次会话  ○ 1小时  │   │
│ └─────────────────────────────────┘   │
│                                       │
│        [拒绝]  [授权 (primary)]       │
└───────────────────────────────────────┘
```

**数据流:**
```typescript
// 授权后调用
gateway.call('scope.grantSession', {
  scope: 'file_write',
  sessionId: currentSession.sessionId,
});
```

### 4.3 i18n 键

```json
{
  "chat.scope.requestTitle": "权限请求",
  "chat.scope.target": "目标",
  "chat.scope.operation": "操作",
  "chat.scope.riskLevel": "风险等级",
  "chat.scope.duration": "授权有效期",
  "chat.scope.thisOperation": "本次操作",
  "chat.scope.thisSession": "本次会话",
  "chat.scope.oneHour": "1小时",
  "chat.scope.deny": "拒绝",
  "chat.scope.grant": "授权"
}
```

---

## 5. 会话类型选择器 (GAP-B25)

### 5.1 后端现状
- `session.getOrCreate` 和 `chat` RPC 均支持 `sessionType` 参数
- 5 种类型: `general`, `dev`, `knowledge`, `pm`, `swarm_manager`
- 每种类型有不同的系统提示词角色片段 (config.roles)

### 5.2 前端设计

**UI 元素:**
- **位置**: 聊天输入框上方，紧贴输入区域
- **外观**: 水平排列的 Pill/Chip 按钮组

```
┌─ Session Type ────────────────────────────────────┐
│ [💬 General] [🔧 Dev] [📚 Knowledge] [📋 PM] [🐝 Swarm] │
└───────────────────────────────────────────────────┘
```

**每种类型:**
| 类型 | 图标 | 选中色 | 说明 |
|------|------|--------|------|
| General | `chat` | `primary` | 通用对话 |
| Dev | `code` | `secondary` | 开发模式 |
| Knowledge | `menu_book` | `tertiary` | 知识咨询 |
| PM | `assignment` | `#4CAF50` | 项目管理 |
| Swarm | `hive` | `#FF9800` | 多智能体 |

**交互:**
- 默认选中 `General`
- 切换类型时: 调用 `session.getOrCreate({ sessionId, sessionType: newType })`
- Swarm 选中时: 自动显示团队选择下拉框 (对接 `swarm.getTeams`)

### 5.3 i18n 键

```json
{
  "chat.sessionType.label": "会话类型",
  "chat.sessionType.general": "通用",
  "chat.sessionType.dev": "开发",
  "chat.sessionType.knowledge": "知识",
  "chat.sessionType.pm": "项目管理",
  "chat.sessionType.swarm": "Swarm 协作",
  "chat.sessionType.teamSelect": "选择团队"
}
```

---

## 6. 文件附件上传 (GAP-U01)

### 6.1 后端需新增

**新增 RPC: `file.upload`**

```typescript
// 请求
interface FileUploadRequest {
  sessionId?: string;     // 默认 "main"
  fileName: string;       // 原始文件名
  content: string;        // Base64 编码内容
  mimeType: string;       // MIME 类型
  maxSizeBytes?: number;  // 默认 10MB
}

// 响应
interface FileUploadResponse {
  fileId: string;         // 唯一 ID
  path: string;           // 服务端暂存路径
  size: number;           // 字节数
  mimeType: string;
}
```

**实现方案:**
1. 接收 Base64 文件 → 解码 → 写入 `{workspace}/.rzeclaw/uploads/{sessionId}/{fileId}_{fileName}`
2. 返回路径后，前端在下一条 chat 消息中注入上下文: `[附件: {fileName} @ {path}]`
3. Agent 可通过 `read` 工具访问该文件
4. 会话结束后清理临时文件 (通过 retention 策略)

**安全限制:**
- 最大文件大小: 10MB (可配置)
- 禁止可执行文件 (.exe, .bat, .sh, .ps1)
- 隐私会话: 上传文件随会话销毁

### 6.2 前端设计

**UI 元素:**
- **Attach 按钮**: `attach_file` Material Icon
- **Dataset 按钮**: `dataset` Material Icon (映射到 RAG 集合选择)
- 点击 Attach → 打开文件选择器 → 显示上传进度 → 完成后在输入框上方显示文件标签

**文件标签:**
```
┌─ Attachments ─────────────────────────────┐
│ [📄 report.pdf (2.1MB) ✕] [📊 data.csv (340KB) ✕] │
└───────────────────────────────────────────┘
┌─ Message Input ───────────────────────────┐
│ 请分析这份报告...                          │
└───────────────────────────────────────────┘
```

### 6.3 i18n 键

```json
{
  "chat.file.attach": "附加文件",
  "chat.file.dataset": "数据集",
  "chat.file.uploading": "上传中...",
  "chat.file.uploaded": "已上传",
  "chat.file.tooLarge": "文件过大（最大 {maxSize}）",
  "chat.file.typeNotAllowed": "不支持的文件类型",
  "chat.file.remove": "移除附件"
}
```

---

## 7. 错误处理

| 场景 | 处理 |
|------|------|
| 隐私模式下保存快照 | Toast warning + 阻止操作 |
| 作用域授权被拒绝 | 通知 AI 权限被拒，AI 调整方案 |
| 文件上传超时 | 显示重试按钮 |
| 文件上传超大小 | 前端拦截，显示大小限制提示 |
| 会话类型切换失败 | Toast error + 回退到原类型 |
| WebSocket 断连时操作 | 禁用所有操作按钮 + 显示重连提示 |
