# GAP-DD-10: 配置与主题系统 / Configuration & Theme System

> **覆盖 GAP**: GAP-U03, GAP-U04, GAP-U05, GAP-U06, GAP-U07, GAP-B04, GAP-B09, GAP-B11
> **影响屏幕**: Screen 13 (System Settings), Screen 01 (Chat)
> **优先级**: P0-P2
> **关联工单**: P1-01~P1-06, P2-01~P2-05, P8-01~P8-08

---

## 1. 功能概述

1. **主题引擎** — 后端无主题系统，需前端 CSS 变量 + 设计令牌
2. **字体缩放** — 后端无支持，纯前端实现
3. **启动配置** — 后端 `loadConfig()` 完整，需 UI 展示与编辑
4. **热重载管理** — 后端 `reloadConfig()` + `config.reload` RPC 完整，需 UI 触发与状态展示
5. **IDE 自动化配置** — 后端 `ideOperation` 配置完整，需 UI 管理
6. **心跳配置** — 后端 `heartbeat` 配置完整，需 UI 管理

---

## 2. 主题引擎 (GAP-U03)

### 2.1 设计令牌 (从 Stitch 提取)

**颜色系统 (Material Design 3 Dark Theme):**
```css
:root {
  /* Primary */
  --md-sys-color-primary: #a3a6ff;
  --md-sys-color-on-primary: #1a1b4e;
  --md-sys-color-primary-container: #2f3070;
  --md-sys-color-on-primary-container: #c5c6ff;

  /* Secondary */
  --md-sys-color-secondary: #53ddfc;
  --md-sys-color-on-secondary: #003544;
  --md-sys-color-secondary-container: #004d62;
  --md-sys-color-on-secondary-container: #b8eaff;

  /* Tertiary */
  --md-sys-color-tertiary: #ffa5d9;
  --md-sys-color-on-tertiary: #5c1142;
  --md-sys-color-tertiary-container: #7a2959;
  --md-sys-color-on-tertiary-container: #ffd7ec;

  /* Error */
  --md-sys-color-error: #ff6e84;
  --md-sys-color-on-error: #690019;
  --md-sys-color-error-container: #93002a;
  --md-sys-color-on-error-container: #ffdadc;

  /* Surface (Dark) */
  --md-sys-color-surface: #121318;
  --md-sys-color-surface-dim: #121318;
  --md-sys-color-surface-bright: #38393f;
  --md-sys-color-surface-container-lowest: #0d0e13;
  --md-sys-color-surface-container-low: #1a1b21;
  --md-sys-color-surface-container: #1e1f25;
  --md-sys-color-surface-container-high: #282a30;
  --md-sys-color-surface-container-highest: #33353b;
  --md-sys-color-on-surface: #e3e2e9;
  --md-sys-color-on-surface-variant: #c6c5d0;
  --md-sys-color-outline: #908f9a;
  --md-sys-color-outline-variant: #46464f;

  /* Special */
  --md-sys-color-inverse-surface: #e3e2e9;
  --md-sys-color-inverse-on-surface: #2f3036;
  --md-sys-color-inverse-primary: #4749a0;
  --md-sys-color-shadow: #000000;
  --md-sys-color-scrim: #000000;
}
```

**字体系统:**
```css
:root {
  --md-sys-typescale-display-font: 'Manrope', sans-serif;
  --md-sys-typescale-headline-font: 'Manrope', sans-serif;
  --md-sys-typescale-title-font: 'Inter', sans-serif;
  --md-sys-typescale-body-font: 'Inter', sans-serif;
  --md-sys-typescale-label-font: 'Inter', sans-serif;
  --md-sys-typescale-code-font: 'JetBrains Mono', monospace;

  /* Font Scale */
  --font-scale: 1.0;
  --md-sys-typescale-body-medium-size: calc(14px * var(--font-scale));
  --md-sys-typescale-body-large-size: calc(16px * var(--font-scale));
  --md-sys-typescale-title-medium-size: calc(16px * var(--font-scale));
  --md-sys-typescale-title-large-size: calc(22px * var(--font-scale));
  --md-sys-typescale-headline-small-size: calc(24px * var(--font-scale));
  --md-sys-typescale-label-medium-size: calc(12px * var(--font-scale));
}
```

**间距与圆角:**
```css
:root {
  --md-sys-shape-corner-small: 8px;
  --md-sys-shape-corner-medium: 12px;
  --md-sys-shape-corner-large: 16px;
  --md-sys-shape-corner-extra-large: 28px;
  --md-sys-spacing-xs: 4px;
  --md-sys-spacing-sm: 8px;
  --md-sys-spacing-md: 16px;
  --md-sys-spacing-lg: 24px;
  --md-sys-spacing-xl: 32px;
}
```

### 2.2 主题切换 (未来扩展)

**当前**: 仅 Dark 主题 (从 Stitch 设计稿提取)

**预留接口:**
```typescript
interface ThemeConfig {
  mode: 'dark' | 'light' | 'system';
  customColors?: Partial<typeof defaultDarkColors>;
}

// localStorage 持久化
const THEME_STORAGE_KEY = 'rzeclaw-theme';
```

### 2.3 前端实现方案

1. 创建 `src/styles/tokens.css` — CSS 变量定义
2. 创建 `src/styles/theme.ts` — 主题切换逻辑
3. 所有组件使用 CSS 变量而非硬编码颜色
4. Tailwind 配置映射 CSS 变量到 utility classes

---

## 3. 字体缩放 (GAP-U04)

### 3.1 前端设计

**位置**: Settings 页面 → Display 分组

```
┌─ Font Scale ──────────────────────────────────────────┐
│                                                        │
│  Scale: [−] ████████████████░░░░ 100% [+]             │
│                                                        │
│  ┌─ Preview ──────────────────────────────────────┐   │
│  │ Title Text (22px)                               │   │
│  │ Body text looks like this at current scale.    │   │
│  │ const code = "monospace";                       │   │
│  │ Label text (12px)                               │   │
│  └────────────────────────────────────────────────┘   │
│                                                        │
│  预设: [75%] [100%] [125%] [150%]                     │
└────────────────────────────────────────────────────────┘
```

**实现:**
```typescript
// 修改 CSS 变量 --font-scale
function setFontScale(scale: number) {
  document.documentElement.style.setProperty('--font-scale', String(scale));
  localStorage.setItem('rzeclaw-font-scale', String(scale));
}
```

---

## 4. 启动配置 (GAP-B04, GAP-U05)

### 4.1 后端现状
- `loadConfig()`: 从 `rzeclaw.json` 加载
- 支持环境变量 `RZECLAW_CONFIG` 覆盖路径
- 默认值: model="anthropic/claude-sonnet-4-20250514", port=9999, workspace=cwd

### 4.2 需新增后端

**新增 RPC: `config.get`**
```typescript
interface ConfigGetResponse {
  config: Partial<RzeclawConfig>;   // 脱敏版 (隐藏 apiKeyEnv 的值)
  configPath: string;
  reloadableKeys: string[];
  lastReloaded?: string;
}
```

**新增 RPC: `config.update`**
```typescript
interface ConfigUpdateRequest {
  changes: Partial<RzeclawConfig>;  // 仅 RELOADABLE_CONFIG_KEYS
}
interface ConfigUpdateResponse {
  ok: boolean;
  appliedKeys: string[];
  rejectedKeys?: Array<{
    key: string;
    reason: string;  // "not_reloadable" | "invalid_value"
  }>;
}
```

**实现方案:**
1. `config.get` 返回当前配置 (脱敏处理 API 密钥)
2. `config.update` 仅接受 RELOADABLE_CONFIG_KEYS 中的键
3. 更新成功后自动调用 `reloadConfig()` 热应用
4. 写入审计日志

### 4.3 前端设计

**配置编辑器:**
```
┌─ System Configuration ─── rzeclaw.json ──────────────┐
│                                                       │
│ ┌─ Core ──────────────────────────────────────────┐  │
│ │ Model:     [anthropic/claude-sonnet-4-20250514  ▾]  │  │
│ │ Port:      [9999   ] 🔒 不可热重载             │  │
│ │ Workspace: [E:\Rzeclaw] 🔒 不可热重载          │  │
│ └─────────────────────────────────────────────────┘  │
│ ┌─ Memory ────────────────────────────────────────┐  │
│ │ Context Window Rounds: [10  ]                   │  │
│ │ Summary Every Rounds:  [5   ]                   │  │
│ │ Cold After Days:       [30  ]                   │  │
│ │ Rolling Ledger Fold Cron: [0 8      ]           │  │
│ └─────────────────────────────────────────────────┘  │
│ ┌─ Modules Toggle ────────────────────────────────┐  │
│ │ [● Skills] [● Flows] [● MCP] [● RAG]           │  │
│ │ [● Evolution] [● Heartbeat] [○ Hot Reload]      │  │
│ │ [● Exploration] [● Event Bus]                   │  │
│ └─────────────────────────────────────────────────┘  │
│                                                       │
│ Config Path: E:\Rzeclaw\rzeclaw.json                 │
│ Last Reloaded: 2026-03-23 14:30                      │
│                                                       │
│           [重置] [💾 保存并应用]                      │
└───────────────────────────────────────────────────────┘
```

---

## 5. 热重载管理 (GAP-B09)

### 5.1 后端现状
- `config.reload` RPC: 手动触发热重载
- `hotReload.intervalSeconds`: 自动轮询间隔 (0 = 禁用, 最小 10s)
- `hotReload.allowExplicitReload`: 是否允许 RPC 触发
- RELOADABLE_CONFIG_KEYS: 24 个可热重载键
- 审计: `.rzeclaw/hot_reload_audit.log`

### 5.2 前端设计

**热重载状态面板:**
```
┌─ Hot Reload ──────────────────────────────────────────┐
│                                                        │
│ Status: ● 已启用                                       │
│ Poll Interval: [30] 秒                                 │
│ Allow Explicit Reload: [● On]                          │
│                                                        │
│ Reloadable Keys (24):                                  │
│ model, memory, skills, mcp, flows, heartbeat,          │
│ evolution, planning, gateway, roles, swarm, ...        │
│                                                        │
│ Recent Reload History:                                 │
│ ┌──────────────────────────────────────────────────┐  │
│ │ 2026-03-23 14:30 │ explicit │ keys: model, flows│  │
│ │ 2026-03-23 12:00 │ auto     │ keys: memory      │  │
│ │ 2026-03-22 16:45 │ explicit │ keys: skills, mcp │  │
│ └──────────────────────────────────────────────────┘  │
│                                                        │
│ [🔄 Reload Now]                                        │
└────────────────────────────────────────────────────────┘
```

---

## 6. IDE 自动化配置 (GAP-B11)

### 6.1 后端现状
- `ideOperation.uiAutomation`: L2 UI 操作 (ui_describe/ui_act/ui_focus)
- `ideOperation.keyMouse`: L3 键鼠模拟
- `ideOperation.visualClick`: L3 视觉定位点击
- `ideOperation.allowedApps`: 白名单应用列表
- `ideOperation.timeoutMs`: 执行超时
- `ideOperation.confirmPolicy`: 确认策略

### 6.2 前端设计

```
┌─ IDE Automation ──────────────────────────────────────┐
│                                                        │
│ ┌─ L2: UI Automation ────────────────────────────┐   │
│ │ Status: [● Enabled]                             │   │
│ │ Tools: ui_describe, ui_act, ui_focus            │   │
│ └────────────────────────────────────────────────┘   │
│ ┌─ L3: Key & Mouse ─────────────────────────────┐   │
│ │ Status: [○ Disabled]                            │   │
│ │ Visual Click: [○ Disabled]                      │   │
│ └────────────────────────────────────────────────┘   │
│ ┌─ Security ─────────────────────────────────────┐   │
│ │ Allowed Apps: [vscode, chrome, terminal]       │   │
│ │              [+ Add App]                        │   │
│ │ Timeout: [5000] ms                              │   │
│ │ Confirm Policy: [Confirm on First Use ▾]       │   │
│ └────────────────────────────────────────────────┘   │
│                                                        │
│                          [💾 保存]                     │
└────────────────────────────────────────────────────────┘
```

---

## 7. 心跳配置 (GAP-B04)

### 7.1 后端现状
- `heartbeat.intervalMinutes`: 间隔 (0 = 禁用)
- `heartbeat.checklistPath`: 检查清单文件路径
- `heartbeat.checkUseLLM`: 使用 LLM 判断检查结果
- `heartbeat.requireConfirmation`: 执行前需确认
- `heartbeat.tick` RPC: 手动触发心跳

### 7.2 前端设计

```
┌─ Heartbeat Configuration ────────────────────────────┐
│                                                       │
│ Status: [● Enabled]                                   │
│ Interval: [30] minutes                                │
│ Checklist Path: [.rzeclaw/checklist.md      ]        │
│                                                       │
│ ┌─ Advanced ──────────────────────────────────────┐  │
│ │ Use LLM Judgment: [● On]                        │  │
│ │ Require Confirmation: [○ Off]                    │  │
│ └─────────────────────────────────────────────────┘  │
│                                                       │
│ Last Tick: 2026-03-23 14:00                           │
│ Next Tick: 2026-03-23 14:30                           │
│                                                       │
│ [▶ Tick Now] [💾 保存]                               │
└───────────────────────────────────────────────────────┘
```

---

## 8. i18n 键

```json
{
  "settings.theme.title": "主题",
  "settings.theme.dark": "深色",
  "settings.theme.light": "浅色",
  "settings.theme.system": "跟随系统",
  "settings.font.title": "字体缩放",
  "settings.font.scale": "缩放比例",
  "settings.font.preview": "预览",
  "settings.font.preset75": "75%",
  "settings.font.preset100": "100%",
  "settings.font.preset125": "125%",
  "settings.font.preset150": "150%",
  "settings.config.title": "系统配置",
  "settings.config.core": "核心",
  "settings.config.model": "模型",
  "settings.config.port": "端口",
  "settings.config.workspace": "工作区",
  "settings.config.notReloadable": "不可热重载",
  "settings.config.memory": "记忆",
  "settings.config.modules": "模块开关",
  "settings.config.configPath": "配置路径",
  "settings.config.lastReloaded": "上次重载",
  "settings.config.saveApply": "保存并应用",
  "settings.config.reset": "重置",
  "settings.hotReload.title": "热重载",
  "settings.hotReload.enabled": "已启用",
  "settings.hotReload.disabled": "已禁用",
  "settings.hotReload.interval": "轮询间隔",
  "settings.hotReload.allowExplicit": "允许手动触发",
  "settings.hotReload.reloadableKeys": "可重载配置项",
  "settings.hotReload.history": "重载历史",
  "settings.hotReload.reloadNow": "立即重载",
  "settings.hotReload.source.explicit": "手动",
  "settings.hotReload.source.auto": "自动",
  "settings.ide.title": "IDE 自动化",
  "settings.ide.uiAutomation": "UI 自动化",
  "settings.ide.keyMouse": "键鼠模拟",
  "settings.ide.visualClick": "视觉点击",
  "settings.ide.allowedApps": "允许的应用",
  "settings.ide.addApp": "添加应用",
  "settings.ide.timeout": "超时",
  "settings.ide.confirmPolicy": "确认策略",
  "settings.heartbeat.title": "心跳配置",
  "settings.heartbeat.interval": "间隔 (分钟)",
  "settings.heartbeat.checklistPath": "检查清单路径",
  "settings.heartbeat.useLLM": "使用 LLM 判断",
  "settings.heartbeat.requireConfirmation": "执行前确认",
  "settings.heartbeat.lastTick": "上次心跳",
  "settings.heartbeat.nextTick": "下次心跳",
  "settings.heartbeat.tickNow": "立即执行",
  "settings.heartbeat.save": "保存"
}
```
