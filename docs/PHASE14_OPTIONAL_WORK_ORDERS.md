# Phase 14 可选阶段 — 工单（安全隐私增强、配置热重载、任务解耦）

本文档为**可选阶段**的工单拆解：**安全与隐私增强**（SECURITY_PRIVACY_ENHANCEMENT_DESIGN.md）、**配置热重载**（CONFIG_HOT_RELOAD_DESIGN.md）、**任务与 Gateway 解耦**（TASK_GATEWAY_DECOUPLING_DESIGN.md）。与 Phase 14A/B/C 无强依赖，可按需与资源排期实施；任务解耦建议在 14A（Event Bus/执行层独立）后实施更顺。

**IDE Phase E**：设计规范见 `IDE_OPERATION_PHASE_E_DESIGN.md`；实现状态见 `IDE_OPERATION_IMPLEMENTATION_PLAN.md`（WO-IDE-011～016 已实现），本可选工单不包含 IDE Phase E 新项。

---

## 一、安全与隐私增强（WO-1501～1519）

设计依据：`docs/SECURITY_PRIVACY_ENHANCEMENT_DESIGN.md`。

| 工单 ID | 名称 | 依赖 | 范围 | 验收标准 |
|---------|------|------|------|----------|
| **WO-1501** | 风险等级分类函数 | 无 | 实现 classifyOpRisk(entry)：根据 tool、args、result 摘要返回 low/medium/high；规则与设计 §2.1 一致 | 给定 op 条目能返回合理 risk_level |
| **WO-1502** | appendOpLog 写入 risk_level | WO-1501 | 在 appendOpLog 写入 ops.log 时调用 classifyOpRisk，将 risk_level 写入该条 op 的扩展字段；格式与现有 ops 兼容 | ops.log 条目含 risk_level |
| **WO-1503** | 配置 postActionReview | 无 | config.security.postActionReview：enableRiskClassification、highRiskSuggestReviewOnSessionEnd；loadConfig 解析 | 配置可读，为 false 时可跳过分类或会话结束提示 |
| **WO-1504** | self-check 近期高风险检查 | WO-1502 | self-check 新增项：读 ops.log 最近 N 条，过滤 risk_level===high；若存在则输出建议文案并可选返回 op 摘要 | 存在高风险时 self-check 给出建议 |
| **WO-1505** | 会话结束高风险建议（可选） | WO-1502, WO-1503 | Gateway/CLI 会话结束时若启用 highRiskSuggestReviewOnSessionEnd，扫描本会话 ops，若有 high 则返回 highRiskOpsSuggestedReview: true 或提示 | 客户端可据此提示用户 |
| **WO-1506** | 权限域与默认策略类型 | 无 | 定义 scope 枚举与 security.permissionScopes 类型（allow/confirm/deny）；工具与 scope 映射表（代码或配置） | 可配置各 scope 默认行为 |
| **WO-1507** | sessionGrants 与会话授权 | WO-1506 | 运行时 sessionGrants（按 sessionId 的 Set&lt;scope&gt;）；确认时若用户选「本次会话」则 sessionGrants.add(scope)；执行前检查 sessionGrants 放行 | 本次会话授权后同 scope 不再确认 |
| **WO-1508** | scheduledGrants 与定时校验 | WO-1506 | config.security.scheduledGrants：scope、window（如 "09:00-18:00"）；工具执行前若未在 sessionGrants 且为 confirm，检查当前时间是否在 window 内 | 定时窗口内自动放行 |
| **WO-1509** | confirmPolicy 与 scope 兼容 | WO-1506 | 先查 scope 策略，再查 confirmPolicy.tools；若 tools 列表存在则该工具强制 confirm；文档说明映射 | 现有 confirm 行为保留且与 scope 一致 |
| **WO-1510** | 隐私会话工具限制 | 无 | config.security.privacySessionToolPolicy：allow_all/read_only/none；隐私会话下若 read_only 则 write/edit/bash/process 等拒绝并返回明确错误 | 隐私模式可限制为只读或禁止工具 |
| **WO-1511** | 隐私隔离存储（可选） | 无 | 隐私会话内 L1 写入到临时/隔离路径；会话结束或 N 天后清理；不参与全局 retrieve | 可选启用时隐私内容隔离 |
| **WO-1512** | ops.log 隐私会话脱敏 | 无 | 隐私会话下根据 opsLogPrivacySessionPolicy：omit 不写 ops，redact 则 args/result_summary 脱敏后写 | 隐私会话 ops 不泄露敏感 |
| **WO-1513** | 导出与检索隐私标记检查 | 无 | audit-export、metrics-export、replay 等导出时检查隐私标记；隐私会话相关记录不导出或脱敏 | 导出不含隐私原始内容 |
| **WO-1514** | 端到端 privacy 传递 | WO-1510～1513 | 确保 sessionFlags.privacy 在 Gateway、执行层、记忆管道、快照、ops 全链路可读；各写入/导出点统一检查 | 隐私策略全链路生效 |
| **WO-1515** | CONFIG_REFERENCE 安全隐私增强 | WO-1503～1514 | 文档：postActionReview、permissionScopes、sessionGrants、scheduledGrants、privacySessionToolPolicy、opsLogPrivacySessionPolicy 等 | 配置与用法可查 |

**建议实现顺序**：1501 → 1502 → 1503 → 1504 → 1505（可选）→ 1506 → 1507 → 1508 → 1509 → 1510 → 1511（可选）→ 1512 → 1513 → 1514 → 1515。

---

## 二、配置热重载（WO-1520～1539）

设计依据：`docs/CONFIG_HOT_RELOAD_DESIGN.md`。

| 工单 ID | 名称 | 依赖 | 范围 | 验收标准 |
|---------|------|------|------|----------|
| **WO-1520** | 可重载项白名单 | 无 | 在代码或配置中明确「可热重载」配置键列表（llm、flows、memory、evolution 等）；「不可重载」为 port、workspace、gateway.host 等 | 清单与设计 §2 一致 |
| **WO-1521** | reloadConfig 实现 | WO-1520 | 实现 reloadConfig()：读配置文件、解析为 newConfig；仅将可重载部分浅替换到当前 config；保留 port/workspace 等；失败则不替换并返回错误 | 调用后 config 可更新且不破坏不可重载项 |
| **WO-1522** | 并发与单请求内一致 | WO-1521 | 重载时短临界区或单次引用替换；文档约定「单次请求内 config 不变」；所有读 config 处持引用 | 无「读到一半新一半旧」 |
| **WO-1523** | Gateway 方法 config.reload | WO-1521 | Gateway 新增 method config.reload（无参）；调用 reloadConfig()；返回 { ok, message? }；需认证 | 通过 WS 可触发重载 |
| **WO-1524** | 热重载审计（可选） | WO-1523 | 重载成功时写一条审计记录（who、when、reason: "hot_reload"） | 可追溯重载事件 |
| **WO-1525** | hotReload 配置项 | 无 | config.hotReload：intervalSeconds（0=不轮询）、allowExplicitReload；loadConfig 解析 | 可关闭显式重载或启用轮询 |
| **WO-1526** | 定时轮询 mtime（可选） | WO-1521, WO-1525 | 若 intervalSeconds>0，定时检查配置文件 mtime，变更则调用 reloadConfig()；间隔不少于 10 秒 | 改文件后自动重载 |
| **WO-1527** | CONFIG_REFERENCE 热重载 | WO-1520～1526 | 文档：可重载/不可重载清单、config.reload 用法、hotReload 配置 | 配置与用法可查 |

**建议实现顺序**：1520 → 1521 → 1522 → 1523 → 1524（可选）→ 1525 → 1526（可选）→ 1527。

---

## 三、任务与 Gateway 解耦（WO-1540～1569）

设计依据：`docs/TASK_GATEWAY_DECOUPLING_DESIGN.md`。建议在 Phase 14A 完成「执行层订阅 request、发布 response」后实施，以便任务在执行层独立运行。

| 工单 ID | 名称 | 依赖 | 范围 | 验收标准 |
|---------|------|------|------|----------|
| **WO-1540** | 任务状态与结果类型 | 无 | 定义任务状态枚举（pending/running/completed/failed/cancelled/timeout）与结果结构（status、content、error、citedMemoryIds、completedAt） | 类型可被存储与查询使用 |
| **WO-1541** | 执行层任务入队与状态 | 14A 或等效 | 收到 chat.request 后创建任务记录（correlationId、status=pending）；执行时 status=running；完成后 completed/failed | 任务有完整状态流转 |
| **WO-1542** | 结果存储与过期 | WO-1540, WO-1541 | 任务 completed/failed 时写入结果存储（内存 Map 或 workspace/.rzeclaw/task_results/<correlationId>.json）；expiresAt=now+retentionMinutes | 结果可查且会过期 |
| **WO-1543** | 发布 response 后写入存储 | WO-1542 | 执行层发布 chat.response 后同步将结果写入结果存储；订阅者断开时仍可从存储拉取 | 断连后结果不丢 |
| **WO-1544** | 查询接口 task.getResult | WO-1542 | 接口：params.correlationId；返回 status、content、error、citedMemoryIds、completedAt；若过期返回已过期或删除 | 按 correlationId 可查状态与结果 |
| **WO-1545** | 查询接口 task.listBySession（可选） | WO-1542 | 接口：params.sessionId、limit；返回该 session 最近 N 条任务的 correlationId、status、completedAt | 会话维度可列未取回任务 |
| **WO-1546** | Gateway 代理 task.getResult | 14A, WO-1544 | Gateway 收到 method task.getResult 时转发到执行层查询接口（或通过 Bus admin topic），将结果返回客户端 | 客户端经 Gateway 可查任务 |
| **WO-1547** | 过期清理定时任务 | WO-1542 | 周期性清理结果存储中 expiresAt 已过的记录；可配置间隔 | 存储不无限增长 |
| **WO-1548** | 配置 taskExecution / taskResults | 无 | config.taskExecution.mode（in_process/worker）、config.taskResults.retentionMinutes；loadConfig 解析 | 可配置解耦模式与保留时长 |
| **WO-1549** | 任务创建/完成审计（可选） | WO-1541～1543 | 任务创建、完成、失败时写审计（correlationId、sessionId、status、duration） | 可追溯任务生命周期 |
| **WO-1550** | CONFIG_REFERENCE 任务解耦 | WO-1548 | 文档：taskExecution、taskResults、task.getResult、task.listBySession 用法 | 配置与用法可查 |

**建议实现顺序**：1540 → 1541 → 1542 → 1543 → 1544 → 1545（可选）→ 1546 → 1547 → 1548 → 1549（可选）→ 1550。

---

## 四、执行顺序总表（可选阶段）

| 块 | 建议顺序 |
|------|----------|
| **安全隐私** | 1501 → 1502 → 1503 → 1504 → 1505 → 1506 → 1507 → 1508 → 1509 → 1510 → 1511 → 1512 → 1513 → 1514 → 1515 |
| **配置热重载** | 1520 → 1521 → 1522 → 1523 → 1524 → 1525 → 1526 → 1527 |
| **任务解耦** | 1540 → 1541 → 1542 → 1543 → 1544 → 1545 → 1546 → 1547 → 1548 → 1549 → 1550 |

三块之间无强依赖，可并行或按需择一实施；任务解耦建议在 14A 后做。

---

## 五、设计文档索引

| 块 | 设计文档 |
|------|----------|
| 安全隐私增强 | `docs/SECURITY_PRIVACY_ENHANCEMENT_DESIGN.md` |
| 配置热重载 | `docs/CONFIG_HOT_RELOAD_DESIGN.md` |
| 任务解耦 | `docs/TASK_GATEWAY_DECOUPLING_DESIGN.md` |
| 总计划 | `docs/PHASE14_IMPLEMENTATION_PLAN.md` |

---

*实现时以各设计文档与本文档为准。*
