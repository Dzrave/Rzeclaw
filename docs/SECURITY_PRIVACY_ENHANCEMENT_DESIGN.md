# 安全与隐私增强 — 详细设计

本文档针对**当前尚未实现**的安全与隐私能力做详细设计：**事后检查与纠正**、**临时/定时权限开通**、**隐私沙盒**、**端到端隐私标记**。与现有已实现的危险命令策略、process kill 保护、confirmPolicy、sanitizeForMemory 等衔接，形成完整闭环。

**设计依据**：`docs/SECURITY_AND_PRIVACY_DESIGN.md`（原则一/二/三、差距与目标设计）、`docs/SECURITY_PRIVACY_IMPLEMENTATION_PLAN.md`（已实现工单）。**本文档仅做设计**，不包含实施计划与工单。

---

## 一、目标与范围

### 1.1 设计目标

| 能力 | 目标 |
|------|------|
| **事后检查与纠正** | 执行后对 ops.log/工具结果做「风险等级」标记；self-check 或会话结束时扫描近期高风险操作并给出纠正建议（如 undo_last、检查工作区）；可选告警或提示。 |
| **临时/定时开通** | 权限域（scope）上支持「本次会话授权」「仅此次」「定时窗口」；减少重复确认的同时保持最小权限。 |
| **隐私沙盒** | 隐私会话内不写 L1、不落盘快照（或隔离存储且可销毁）；可选禁止 write/edit/bash 等可外泄工具；全链路识别 sessionFlags.privacy。 |
| **端到端标记** | 从用户标记隐私或规则/模型检测隐私意图起，到存储、检索、导出全程携带隐私标记并统一策略（不写记忆、脱敏、不导出原始内容）。 |

### 1.2 范围边界

| 在范围内 | 在范围外 |
|----------|----------|
| 风险等级定义、标记时机、self-check 纠正入口、与 undo_last/replay 的衔接 | 具体 UI 文案与交互（由前端/终端实现） |
| 权限域与 sessionGrants/scheduledGrants 的数据结构与校验逻辑 | 多租户或跨用户权限（单用户单机场景） |
| 隐私会话的入口、策略、生命周期与存储隔离 | 端到端加密传输（本设计为「标记+策略」，不涉及传输加密） |
| 导出/检索时的脱敏规则与隐私标记检查 | 第三方审计格式的标准化 |

### 1.3 与现有实现的衔接

- **已有**：`security.dangerousCommands`、`security.processKillRequireConfirm`、`security.protectedPids`、`ideOperation.confirmPolicy`、`sanitizeForMemory`（L1 写入前）、WO-SEC-006 的 `sessionFlags.privacy`（不写 L1、不持久化快照）。
- **本设计**：在已有基础上增加「执行后风险标记」「纠正入口」「权限域与会话/定时授权」「隐私会话下工具限制与全面脱敏」「端到端 privacy 标记的贯穿与导出过滤」。

---

## 二、事后检查与纠正

### 2.1 风险等级定义

- **low**：只读、查询、env_summary 等无副作用操作。  
- **medium**：write/edit 在 workspace 内、bash 执行非危险命令；或已通过危险命令策略放行。  
- **high**：危险命令执行（即便经确认）、process kill、跨 workspace 或系统级操作、L2/L3 敏感操作；或 ops 条目被标记为「需人工复查」。

建议在 **appendOpLog** 写入每条 ops 时，同步或异步调用 **classifyOpRisk(entry)**，将结果写入条目：`risk_level: "low" | "medium" | "high"`。分类规则可复用现有 `classifyOpRisk`（若已有）或新增：根据 tool 类型、args（如 path、command）、result 摘要综合判断。

### 2.2 标记时机与存储

- **时机**：每次工具调用完成后、在 appendOpLog 写入 `ops.log` 之前或之后，计算 risk_level 并写入该条 op 的扩展字段（如 `risk_level`）。  
- **存储**：与现有 ops.log 格式兼容，单行 JSON 增加可选字段 `risk_level`；不单独建表。

### 2.3 纠正入口

- **self-check**：新增检查项「近期高风险操作」：读取 workspace/.rzeclaw/ops.log 最近 N 条（如 20），过滤 `risk_level === "high"`；若存在，则 self-check 输出建议文案（如「存在高风险操作，建议检查工作区或执行 undo_last」）并可选返回这些 op_id 或摘要。  
- **会话结束**：Gateway/CLI 在会话结束且 memory 写入后，可选扫描本会话产生的 ops，若存在 high 则向客户端返回 `highRiskOpsSuggestedReview: true` 或简短提示，由前端决定是否弹窗。  
- **与 undo_last / replay_ops**：不自动执行；仅提示用户可参考文档使用 undo_last 或检查 ops.log；必要时在文档中说明「高风险操作后建议先 self-check 或人工确认再继续」。

### 2.4 配置建议

- `security.postActionReview?: { enableRiskClassification?: boolean; highRiskSuggestReviewOnSessionEnd?: boolean }`。  
- 为 false 时不做风险分类或不在会话结束时建议复查；默认可为 true。

---

## 三、临时/定时权限开通

### 3.1 权限域（Scope）与默认策略

- **权限域**：与现有设计一致，定义 `file_read`、`file_write`、`bash`、`process_kill`、`ui_automation`、`keymouse` 等；工具与 scope 映射：write/edit → file_write，bash → bash，process kill → process_kill，ui_* → ui_automation，keymouse → keymouse。  
- **默认策略**：`security.permissionScopes` 为各 scope 指定 `allow | confirm | deny`；与现有 `confirmPolicy` 兼容：若某工具属于 scope 且 scope 为 confirm，则执行前需确认（或会话/临时授权后放行）。

### 3.2 会话级授权（临时开通）

- **语义**：用户在一次确认中选择「本次会话允许 [scope]」，则该会话内所有同 scope 的工具调用不再弹确认，直到会话结束（断开/关闭）。  
- **存储**：`security.sessionGrants` 仅内存、不落盘；结构可为 `Set<string>`（已授权 scope）或 `Record<sessionId, Set<string>>`，由 Gateway 或执行层在会话上下文中维护。  
- **交互**：当某工具因 scope 策略为 confirm 需要确认时，返回 `REQUIRES_CONFIRMATION` 且可选带 `scope`；客户端可提供「仅此次」「本次会话」「长期」三种选项；选「本次会话」则服务端在该会话上记录 sessionGrants.add(scope)，后续同 scope 直接放行。

### 3.3 定时开通

- **语义**：配置项如 `security.scheduledGrants: [ { scope: "file_write", window: "09:00-18:00" } ]` 表示在每天 9:00–18:00 内，该 scope 视为已授权（不弹确认）。  
- **校验**：在工具执行前、若未在 sessionGrants 中且策略为 confirm，再检查当前时间是否落在某条 scheduledGrants 的 window 内；若在则放行。window 格式可为 "HH:mm-HH:mm" 或 cron 表达式，实施时定一种即可。  
- **存储**：仅配置层，无运行时持久化。

### 3.4 与 confirmPolicy 的兼容

- 现有 `ideOperation.confirmPolicy.tools` 可映射为：列表中的工具名对应 scope 的 confirm 行为；或保留 tools 白名单，与 scope 并存（先查 tools 再查 scope）。建议：**统一以 scope 为主**，工具与 scope 映射表维护在代码或配置中；confirmPolicy.tools 作为遗留兼容，若存在则该工具强制 confirm。

---

## 四、隐私沙盒

### 4.1 入口与标记

- **入口**：用户通过 Gateway 参数 `privacy: true` 或 CLI `--privacy` 发起隐私会话；或由模型/规则检测到用户表述（如「以下内容保密」）后，服务端将会话标记为隐私并回复确认。  
- **标记**：`sessionFlags.privacy === true` 贯穿全链路；已在 WO-SEC-006 中实现「不写 L1、不持久化快照」。本设计在现有基础上扩展「工具限制」与「全面脱敏」。

### 4.2 隐私会话内策略

- **记忆**：不写入 L1（已实现）；不参与 L2 提升；可选「隐私隔离存储」：写入到仅本会话可读的临时存储，会话结束即销毁或保留 N 天可配置。  
- **快照**：不持久化到普通 snapshots 目录（已实现）；若需「隐私会话可恢复」，可写入加密或临时目录并在会话结束或 N 天后清理。  
- **工具限制（可选）**：配置项 `security.privacySessionToolPolicy?: "allow_all" | "read_only" | "none"`。  
  - **read_only**：仅允许 read、env_summary、tools.list 等只读工具；write/edit/bash/process 等拒绝并返回「隐私模式下不允许该操作」。  
  - **none**：仅允许对话，不允许任何工具调用。  
  - **allow_all**：与现有一致，仅不写记忆与快照。  
- **ops.log**：隐私会话内的工具调用是否写入 ops.log 可配置；若写入，则 args/result_summary 必须经脱敏（见下）。

### 4.3 生命周期

- 会话结束（WS 断开、CLI 进程退出、或显式 session 结束）：清理 sessionGrants（若按会话）、销毁隐私隔离存储（若存在）、可选清理临时快照。  
- 可选「保留 N 天」：隐私隔离存储或临时快照在 N 天后由定时任务删除；不参与全局检索与导出。

---

## 五、端到端隐私标记与全面脱敏

### 5.1 端到端标记

- **起点**：用户显式设置 `privacy: true` 或规则/模型检测到隐私意图并将会话标记为隐私。  
- **传递**：所有后续逻辑（Gateway、Agent、记忆管道、快照、ops、导出）均能访问「当前会话是否隐私」；建议通过 `sessionFlags.privacy` 或请求上下文的 `isPrivacySession` 传递。  
- **效果**：存储与导出逻辑统一检查该标记并应用隐私策略（不写 L1、不写快照或写隔离区、ops 脱敏、导出过滤）。

### 5.2 全面脱敏

- **ops.log**：写入前对 `args`、`result_summary` 做与 `sanitizeForMemory` 同规则的脱敏（如 API key、password、绝对路径替换为占位符）；若整条含敏感则可选不写或只写 tool 名与 risk_level。隐私会话下建议强制脱敏或仅写最小必要字段。  
- **audit 导出**：audit-export 时对每条记录的敏感字段做脱敏或过滤；若记录关联隐私会话，可整条不导出或只导出时间与操作类型。  
- **快照**：隐私会话不写普通快照或写加密/临时区；session.list 不返回隐私会话的详情或标记为「隐私会话」。  
- **单条敏感标记（可选）**：对单条消息或工具结果打 `contains_sensitive`，用于「是否写入 L1」「是否写入 ops 详细内容」；可由规则或模型在返回前打标，实施时可选。

### 5.3 配置建议

- `security.privacySessionToolPolicy`：见上。  
- `security.privacyIsolationRetentionDays?: number`：隐私隔离存储保留天数，0 表示会话结束即销毁。  
- `security.opsLogPrivacySessionPolicy?: "omit" | "redact"`：隐私会话下 ops 不写或脱敏后写。

---

## 六、与现有配置与代码的衔接

### 6.1 配置扩展

- 在 `RzeclawConfig.security` 下增加：  
  - `postActionReview?: { enableRiskClassification?: boolean; highRiskSuggestReviewOnSessionEnd?: boolean }`  
  - `sessionGrants`：仅文档说明为运行时内存，不落盘。  
  - `scheduledGrants?: Array<{ scope: string; window: string }>`  
  - `privacySessionToolPolicy?: "allow_all" | "read_only" | "none"`  
  - `privacyIsolationRetentionDays?: number`  
  - `opsLogPrivacySessionPolicy?: "omit" | "redact"`  

### 6.2 调用点

- **appendOpLog**：写入前或后调用 risk 分类，写入 risk_level；若为隐私会话且 opsLogPrivacySessionPolicy 为 omit 则不写，为 redact 则脱敏后写。  
- **工具执行前**：检查 sessionFlags.privacy + privacySessionToolPolicy，若为 read_only 且工具非只读则拒绝；检查 sessionGrants 与 scheduledGrants 决定是否需确认。  
- **会话结束**：若启用 highRiskSuggestReviewOnSessionEnd，扫描本会话 ops 的 risk_level，若有 high 则返回建议；清理隐私隔离存储与临时快照（若存在）。  
- **self-check**：新增「近期高风险操作」检查项，读 ops.log 最近 N 条并过滤 high，输出建议。  
- **audit-export / 其他导出**：根据隐私标记与脱敏规则过滤或脱敏后再输出。

---

## 七、小结

| 能力 | 要点 |
|------|------|
| **事后检查与纠正** | risk_level 在 appendOpLog 时写入；self-check 与可选会话结束提示扫描 high 并建议复查/undo；不自动执行纠正。 |
| **临时/定时开通** | sessionGrants（内存）实现「本次会话」授权；scheduledGrants 实现定时窗口；与 permissionScopes、confirmPolicy 兼容。 |
| **隐私沙盒** | sessionFlags.privacy 贯穿；可选 read_only/none 限制工具；隐私隔离存储与临时快照可配置保留与清理。 |
| **端到端标记** | 从入口到存储/导出统一检查 privacy；ops/audit/快照脱敏或省略；可选单条 contains_sensitive。 |

本文档为详细设计，**不包含实施计划与工单**；实施时需再拆解为工单并排期。已有安全与隐私实现见 `SECURITY_AND_PRIVACY_DESIGN.md` 与 `SECURITY_PRIVACY_IMPLEMENTATION_PLAN.md`。
