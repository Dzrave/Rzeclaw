# 配置热重载 — 详细设计

本文档为**配置热重载**的详细设计：在**不重启进程**的前提下，使部分或全部 `rzeclaw.json`（或等价配置）的变更在运行中生效，从而减少因「改配置就重启 Gateway」导致的任务中断。

**设计依据**：与「Event Bus 为中枢、Gateway 降为节点」「任务与 Gateway 解耦」等设计配合，执行层或 Gateway 可独立重载配置而不影响对方。**本文档仅做设计**，不包含实施计划与工单。

---

## 一、目标与范围

### 1.1 设计目标

| 目标 | 说明 |
|------|------|
| **按需/定时重载** | 支持通过显式调用（如 Gateway 方法 `config.reload`）或定时轮询配置文件 mtime，重新读取配置文件并更新进程内 config 引用。 |
| **可重载与不可重载** | 明确哪些配置项可热重载、哪些必须重启（如 port、gateway.host）；可重载项更新后，后续请求使用新值。 |
| **一致性** | 重载瞬间的并发请求可约定「以重载完成后的新 config 为准」或「单次请求内 config 不变」；避免同一请求内混用新旧配置。 |
| **与 Event Bus 的衔接** | 若执行层与 Gateway 分离，执行层可独立重载自身使用的 config（如 flows、llm、memory），Gateway 仅负责协议与鉴权，其自身配置可单独重载或重启。 |

### 1.2 范围边界

| 在范围内 | 在范围外 |
|----------|----------|
| 重载触发方式、可重载配置项清单、重载流程与并发约定、与 loadConfig 的复用 | 配置文件的语法校验与迁移（沿用现有 loadConfig）；多文件/多环境配置切换 |
| 执行层与 Gateway 各自的 config 生命周期（单进程 vs 多进程） | 配置中心或远程配置拉取 |

### 1.3 与当前实现的衔接

- **现状**：`loadConfig()` 仅在进程启动时调用一次（如 cli.ts gateway 命令、agent 命令）；之后全进程共用同一 config 对象。
- **目标**：在保持「单次请求内 config 稳定」的前提下，允许在运行中再次调用 loadConfig（或 loadConfig 的子集），并替换进程内持有的 config；或对「可热重载」部分做浅替换（如仅更新 `config.flows`、`config.llm` 等），不替换 port 等需重启才生效的项。

---

## 二、可重载与不可重载配置

### 2.1 建议：必须重启才生效的项

- **port**：WebSocket 监听端口；变更需重新 bind，故不热重载。
- **gateway.host**：同上。
- **workspace**：根路径变更影响所有读写与存储路径；热重载易导致前后请求根路径不一致，建议仅重启生效。
- 其他「进程启动时一次性生效」的底层资源（如日志句柄、监听 socket）依赖的项，均建议不热重载。

### 2.2 建议：可热重载的项

- **llm**（provider、model、apiKeyEnv、baseURL、fallbackProvider）：下次 LLM 调用即用新配置。
- **flows**（enabled、libraryPath、routes、failureReplacement、generateFlow）：下次路由与流程执行即用新配置。
- **memory**、**evolution**、**planning**、**skills**、**mcp**、**heartbeat**、**gateway.auth**（apiKeyEnv 等，不包含 host/port）、**roles**、**swarm**、**knowledge**、**diagnostic**、**vectorEmbedding**、**localModel**、**retrospective**、**ideOperation**、**security**（除与端口/主机绑定外的子项）。
- **contextWindowRounds**、**summaryEveryRounds**、**reflectionToolCallInterval** 等顶层数值：下次会话或下一轮即用新值。

### 2.3 边界情况

- **apiKeyEnv**：热重载后，新请求从**环境变量**读取 API Key；环境变量本身由进程外设置，重载仅改变「读哪个变量名」，不改变变量值。
- **flows.libraryPath**：热重载后，下次 getFlowLibrary 会从新路径读；若新路径无效，则按现有错误处理（如空库或抛错）。

---

## 三、重载触发方式

### 3.1 显式调用

- **Gateway**：新增方法 `config.reload`（无参或 `params: {}`）；调用时执行重载逻辑，返回 `{ ok: boolean, message?: string }`。仅重载「可热重载」部分；若配置文件不存在或解析失败，返回 ok: false 且不替换现有 config。
- **CLI**：不常驻进程，通常无需热重载；若未来有常驻 CLI 服务，可提供相同语义的 API 或信号（如 SIGHUP）触发重载。

### 3.2 定时轮询（可选）

- 配置项如 `config.hotReload?: { intervalSeconds?: number }`；为大于 0 时，后台定时（每 N 秒）检查配置文件 mtime，若变更则执行重载。可选实现，避免频繁读盘；间隔不宜过短（如不少于 10 秒）。

### 3.3 信号（可选）

- 进程监听 SIGHUP 或自定义信号，收到后执行重载；与显式调用逻辑一致。可选实现。

---

## 四、重载流程与并发

### 4.1 流程

1. 读取配置文件（与 loadConfig 相同路径解析）。
2. 解析 JSON 并做与 loadConfig 相同的校验与合并；得到 `newConfig`。
3. 从 `newConfig` 中取出「可热重载」的子集，与当前进程内 `config` 做**浅替换**（如 `config.llm = newConfig.llm`），或整体替换为 newConfig 但保留 port/workspace 等为旧值（二选一，实施时定）。
4. 记录日志（如 "[rzeclaw] config hot-reloaded"）；若有审计需求可写一条审计记录。
5. 返回成功；若任一步失败则不改动现有 config，返回失败及原因。

### 4.2 并发约定

- **单写**：重载过程应为「原子」更新：在替换 config 引用或可重载字段时，使用单次赋值或短临界区，避免「读到一半新一半旧」。
- **读侧**：所有使用 config 的代码在单次请求/单次调用栈内持有对 config 的引用；重载仅影响**之后**新请求读取到的 config。即「单次请求内 config 不变」。
- 若实现为「全量替换 config 对象」，需确保所有模块持有的是「同一引用」且重载时仅替换「根引用」一次；若实现为「按字段替换」，则替换顺序与可见性需一致（如先写 llm 再写 flows）。

---

## 五、与多进程/Event Bus 的衔接

### 5.1 单进程（当前形态）

- Gateway 与执行层在同一进程：一次 `config.reload` 即更新全进程 config；所有后续 chat、flow、工具调用均用新配置。

### 5.2 执行层独立进程（Event Bus 形态）

- **执行层**可单独提供 `config.reload`（通过 Bus 上的 admin topic 或独立 HTTP/本地 socket）；执行层重载后，其使用的 flows、llm、memory 等更新，Gateway 无需重启。
- **Gateway** 若仅做协议与鉴权，其自身配置（如 auth.apiKeyEnv）可单独重载；若 Gateway 进程内也持有 config 副本（如用于 session 列表的 workspace），可同样支持热重载该副本，或由执行层提供「session 列表」等接口，Gateway 不持有关键业务 config。

---

## 六、配置项草案（热重载相关）

```ts
// 可选，位于 config 顶层
hotReload?: {
  /** 定时检查配置文件变更的间隔（秒），0 表示不轮询 */
  intervalSeconds?: number;
  /** 是否允许通过 Gateway 方法 config.reload 触发 */
  allowExplicitReload?: boolean; // 默认 true
};
```

- 若不存在 `hotReload`，建议默认允许显式 reload，不默认轮询。

---

## 七、安全与审计

- **权限**：`config.reload` 应仅允许已认证的客户端（与 chat 等共用 Gateway 鉴权）；若为独立 admin 接口，需单独鉴权或仅本机可调用。
- **审计**：每次成功重载可写一条审计记录（who、when、reason: "hot_reload"），便于追溯配置变更。

---

## 八、小结

| 维度 | 约定 |
|------|------|
| **可重载** | llm、flows、memory、evolution、planning、skills、mcp、heartbeat、gateway.auth、roles、swarm、knowledge、diagnostic、vectorEmbedding、localModel、retrospective、ideOperation、security 等；顶层数值类。 |
| **不可重载** | port、gateway.host、workspace 等需重启生效的项。 |
| **触发** | 显式 config.reload；可选定时轮询或信号。 |
| **并发** | 单次请求内 config 不变；重载为原子或短临界区更新。 |

本文档为详细设计，**不包含实施计划与工单**；实施时需再拆解为「可重载项白名单、loadConfig 复用、reload 入口、并发与审计」等工单并排期。与「任务与 Gateway 解耦」配合可进一步减少重启对任务的影响，见 `TASK_GATEWAY_DECOUPLING_DESIGN.md`。
