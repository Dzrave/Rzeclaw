# 进化插入树（WO-BT-024）完整设计方案

本文档为 **Phase 13 WO-BT-024「进化插入树」** 的完整设计方案，覆盖整条进化管线：触发、LLM 生成、沙盒验证、工具热注册、插入 BT 左侧与流程库热更新。确保设计无遗漏后再进入工单拆解与实现。

**设计依据**：`BEHAVIOR_TREE_AND_STATE_MACHINE_DESIGN.md` §13.3、§十；`BEHAVIOR_TREE_CONTEXT_AND_SKILL_DESIGN.md` §2.6（进化安全）；`PHASE13_FULL_WORK_ORDERS.md` WO-BT-024。**已实现依赖**：WO-BT-022（黑板）、WO-BT-025（CRUD + applyEditOps）、现有 Skill 与 getMergedTools 体系。

---

## 一、目标与范围

### 1.1 目标

- **业务目标**：当 Agent 或 BT 内 LLM 节点**成功解决一个新问题**时，系统可将该次成功**提炼为可复用能力**：生成可执行脚本并注册为新 Tool，同时将对应 BT Action 节点**插入到指定 flow 的某 Selector 左侧**，使下次同一意图优先走新节点（「肌肉记忆生长」）。
- **非目标**：本设计不覆盖「LLM 触发生成整棵新 flow」（WO-BT-014）、「失败分支替换的自动触发」（WO-BT-018）；与「新 flow 独立入库」（轨迹→FSM/BT）并存，为两种进化产物形态之一。

### 1.2 范围边界

| 在范围内 | 在范围外 |
|----------|----------|
| 触发条件定义与配置 | WO-BT-014（用户说一句话生成新 flow） |
| 一次 LLM 调用产出「脚本 + 节点 JSON + 可选测试」 | 多轮 LLM 对话式提炼 |
| 沙盒内执行测试、通过后才注册与插树 | 未通过时的自动重试上限内可纳入；超出后人工介入为运维策略 |
| 新 Tool 写入进化专用目录并纳入 getMergedTools | 修改现有 CORE_TOOLS 或 MCP |
| 使用 applyEditOps(insertNode) 插入 Selector 左侧 | FSM 的编辑、多 flow 批量插入 |
| 流程库热更新（下次 match 即用新树） | 版本号与回滚策略见 §十，本设计只约定「写入即当前」 |

---

## 二、依赖与术语

### 2.1 已实现依赖

- **WO-BT-022 黑板**：可选将本次成功摘要、涉及工具序列等写入 session blackboard，供生成阶段上下文使用。
- **WO-BT-025**：`createFlow` / `getFlow` / `applyEditOps`（insertNode 等）/ 流程库路径与审计。
- **Skill 体系**：`config.skills`、`loadSkillsFromDir`、`skillsToToolDefs`、`runSkillScript`（Node 子进程、cwd=workspace）；Skill = name + description + inputSchema + scriptPath（相对 skill 目录）。
- **getMergedTools**：CORE_TOOLS + Skill 目录加载的 Tool + MCP + IDE + replay_ops；每次调用从磁盘加载 Skill，无长期内存缓存。

### 2.2 术语

- **进化管线**：从「触发」到「新 Tool 注册 + BT 节点插入」的整条流程。
- **进化产物**：本次管线产出的 (1) 可执行脚本、(2) 技能描述 JSON、(3) 可选测试脚本、(4) BT Action 节点 JSON。
- **目标 flow / 目标 Selector**：要插入新节点的 BT flow 及其中的某个 Selector 节点（插入在其 children 的 position 0）。
- **沙盒**：用于运行「测试脚本」的受限子进程环境（超时、工作目录、可选隔离）。

---

## 三、整体数据流

```
[ 触发 ] → [ 组装输入 ] → [ LLM 生成 ] → [ 解析与校验 ]
                ↓
[ 写入脚本 + 测试到临时/沙盒目录 ] → [ 沙盒执行测试 ]
                ↓ 通过
[ 写入进化 Skill 目录 + 技能 JSON ] → [ getMergedTools 可见 ]
                ↓
[ applyEditOps(flowId, insertNode(parentSelectorId, 0, btNode)) ] → [ 流程库热更新 ]
                ↓
[ 审计记录 ] → 结束
```

- **失败出口**：任一步失败则中止；可选在「LLM 输出非法」「沙盒不通过」时带错误信息重试一次（可配置），仍失败则记录审计并结束，不写入主流程库与主技能目录。

---

## 四、触发条件

### 4.1 何时认为「可触发进化」

满足以下**全部**条件时，才允许进入进化管线（不自动执行，见 4.2）：

1. **配置开启**：`config.evolution?.insertTree?.enabled === true`（或等价配置路径）。
2. **来源合法**：本次成功来自 (a) **runAgentLoop** 的某一轮结束后，或 (b) **BT 内 LLM 节点**执行成功并返回 success。
3. **成功判定**（可配置）：
   - 最后一轮/节点无工具调用失败（或仅允许的轻度失败，如只读类错误）；
   - 可选：op-log 中本轮无「高风险」分类（与现有 `classifyOpRisk` 一致）；
   - 可选：用户在本轮或下一轮内**显式确认**（如 Gateway 下发 `evolution.confirm` 或会话中肯定回复）。

### 4.2 触发方式（谁调用管线）

- **推荐**：**显式触发**，不自动执行。即：满足 4.1 后，系统只做「可进化」标记或建议（如写入黑板 `evolution.suggested = true`、或向客户端返回 `evolutionSuggestion`）；由**调用方**（Gateway 在用户确认后、或 CLI 在某命令后）调用进化管线入口 `runEvolutionInsertTree(params)`。这样避免误触发与资源占用。
- **可选**：配置项 `evolution.insertTree.autoRun?: boolean`；为 true 时在满足 4.1 且无「需用户确认」配置时，在 runAgentLoop 或 BT 执行成功返回后**异步**调用一次管线（不阻塞回复）；否则仅产出建议，由调用方决定是否执行。

### 4.3 配置项草案

```ts
evolution?: {
  insertTree?: {
    enabled?: boolean;
    /** 是否在满足条件时自动跑管线（否则仅建议，由调用方执行） */
    autoRun?: boolean;
    /** 是否要求用户确认后才执行 */
    requireUserConfirmation?: boolean;
    /** 本轮是否允许含「高风险」op 仍触发（默认 false） */
    allowHighRiskOp?: boolean;
    /** 目标 flowId（插入新节点的 BT） */
    targetFlowId: string;
    /** 目标 Selector 的 nodeId（新节点插入其 children[0]）；若为空则用 root（root 须为 Selector/Sequence/Fallback） */
    targetSelectorNodeId?: string;
    /** 进化产物与测试脚本的存放目录，相对 workspace，默认 .rzeclaw/evolved_skills */
    evolvedSkillsDir?: string;
    /** 沙盒执行超时（毫秒） */
    sandboxTimeoutMs?: number;
    /** LLM 生成失败或沙盒不通过时最大重试次数（0=不重试） */
    maxRetries?: number;
  };
};
```

---

## 五、输入上下文（组装给 LLM）

进化管线入口接收「本次成功」的摘要，用于生成脚本与节点。建议包含：

- **会话/轮次摘要**：最近一轮或几轮的用户消息与助手回复摘要（或从黑板取 `sessionSummary` / 关键槽位）。
- **工具调用序列**：本轮（或本轮+前几轮）的 op-log 子集：tool 名、args 摘要、结果 success/failure、content 摘要；用于 LLM 推断「做了什么」并提炼为脚本逻辑。
- **可选**：当前目标 flow 的 root 或目标 Selector 的 JSON 片段（便于生成与现有树一致的 node 风格）。
- **可选**：用户显式给出的「意图标签」或「技能名」（若 Gateway 在确认时带上）。

数据来源：runAgentLoop 或 BT 执行器在「成功结束」时，可由调用方构造并传入 `runEvolutionInsertTree({ context: { sessionSummary, toolOps, targetFlowSlice }, ... })`；或从 session、op-log、黑板中由管线内部聚合（需约定 sessionId / flowId / 时间窗口）。

---

## 六、LLM 生成：输出 Schema 与 Prompt

### 6.1 输出 Schema（严格 JSON）

要求 LLM **只输出一份 JSON**，便于解析与校验。建议结构：

```ts
type EvolutionLLMOutput = {
  /** 新工具名，唯一、符合 [a-z0-9_]+，将作为 skill name 与 BT Action 的 tool */
  toolName: string;
  /** 工具描述，供 Skill description 与 LLM 工具列表 */
  description: string;
  /** 工具参数 schema，与现有 Skill inputSchema 一致 */
  inputSchema: {
    type: "object";
    properties?: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
  /** 可执行脚本正文（Node.js），单文件；将写入 evolved_skills/<toolName>.js */
  script: string;
  /** 可选：单元/验收测试脚本正文（Node.js）；若存在则在沙盒中先执行，exit 0 视为通过 */
  testScript?: string | null;
  /** BT Action 节点，type="Action", tool=<toolName>, args 可为占位或默认 */
  btNode: {
    type: "Action";
    id?: string;
    tool: string;   // 必须 === toolName
    args: Record<string, unknown>;
  };
};
```

- **校验**：toolName 与 btNode.tool 一致；script 非空；inputSchema 合法；btNode 符合现有 BT Action 结构；若提供 testScript 则非空字符串。
- **非法或缺失字段**：视为生成失败，计入重试或直接退出并写审计。

### 6.2 Prompt 设计要点

- **System**：约定「你只输出一份 JSON，无 markdown、无解释；toolName 仅 [a-z0-9_]；script 为可独立运行的 Node.js 脚本，接收参数通过 process.argv 或约定格式；若提供 testScript，则其执行并通过（exit 0）后才会采纳」。
- **User**：注入 5 节的输入上下文（会话摘要、工具序列、可选 targetFlowSlice）；明确「请根据上述成功执行序列，提炼为单一可复用工具：生成 toolName、description、inputSchema、script、可选 testScript、btNode」。
- **输出解析**：与 topology-iterate 类似，先 strip markdown 代码块（若有），再 JSON.parse；校验类型与必填字段。

---

## 七、沙盒与测试执行

### 7.1 沙盒目标

- 运行 **测试脚本**（若有）：在隔离、限时环境中执行，避免生成代码影响主机或挂死。
- 不在此阶段运行「主脚本」的完整业务逻辑（主脚本在注册为 Tool 后由 runSkillScript 按现有逻辑执行）；测试脚本的职责是**验证主脚本在给定输入下可运行且结果可接受**（例如：用 fixture 调用主脚本、断言 exit 0 或 stdout 包含某内容）。

### 7.2 执行环境

- **运行时**：Node.js 子进程（与现有 `runSkillScript` 一致），便于与现有 Skill 统一。
- **工作目录**：建议使用**临时目录**（如 `workspace/.rzeclaw/evolution_sandbox/<runId>/`），在该目录下写入：
  - `script.js`（主脚本）、`test.js`（测试脚本，若有）；
  - 测试脚本内可 `require('./script.js')` 或通过 `child_process.spawn('node', ['script.js', ...])` 调用，由生成约定决定。
- **超时**：`config.evolution.insertTree.sandboxTimeoutMs`（如 30_000），超时则视为测试失败。
- **权限与隔离**：不赋予网络、不扩大文件系统范围（仅限沙盒目录与只读依赖）；若需访问 workspace 只读，可挂载为只读或拷贝必要文件进沙盒（具体可二期细化，首版可仅沙盒目录 + 子进程超时）。

### 7.3 通过标准

- 若 **无 testScript**：可配置为「直接通过」或「要求必须有 testScript 才通过」（推荐：必须有 testScript，与 §2.6 双重生成一致）。
- 若有 **testScript**：在沙盒中执行 `node test.js`（或约定入口），**exit code 0** 且未超时即视为通过；stdout/stderr 可记录到审计，不参与通过判定（除非后续扩展为「需匹配某正则」）。

### 7.4 失败处理

- 测试失败或超时：不写入进化目录、不插树；可选将 stderr/stdout 回传 LLM 做一次重试（maxRetries）；仍失败则写审计并结束。

---

## 八、工具热注册（进化 Skill 的持久化与可见性）

### 8.1 存放位置

- **目录**：`workspace/<evolvedSkillsDir>`，默认 `workspace/.rzeclaw/evolved_skills`。
- **文件**：
  - `<toolName>.js`：主脚本（由 LLM 输出的 script 写入）。
  - `<toolName>.json`：Skill 描述（name、description、inputSchema、scriptPath 指向 `./<toolName>.js`），与现有 Skill 格式兼容，便于用同一套 `loadSkillsFromDir` / `skillsToToolDefs` 加载。

### 8.2 与 getMergedTools 的集成

- **方案**：在 `getMergedTools` 内，除现有 `loadSkillsFromDir(workspace, config.skills.dir)` 外，**再加载** `loadSkillsFromDir(workspace, config.evolution.insertTree.evolvedSkillsDir)`（当 evolution.insertTree.enabled 时），将两组 Skill 合并后一起转为 ToolDef；Tool 名若与 CORE/Skill/MCP 冲突，可加前缀（如 `evolved_<toolName>`）或拒绝写入（推荐：进化工具统一加前缀，避免与既有 skill 重名）。
- **热更新**：getMergedTools 每次调用都会从磁盘读目录，故写入 `evolved_skills` 后，**下一次** getMergedTools（下一次 chat 或 flow 执行）即会包含新 Tool，无需重启进程。

### 8.3 命名与冲突

- **toolName**：LLM 生成 + 校验；写入时若已存在同名 `<toolName>.json`，可覆盖或采用版本后缀（如 `<toolName>_v2.json`），由实现选择；BT 节点中的 `tool` 字段须与最终注册的 tool 名一致（若加前缀则用 `evolved_<toolName>`）。
- **冲突**：若 `evolved_<toolName>` 与现有 CORE/Skill 同名，应在写入前检查并拒绝或换名。

---

## 九、插入树（applyEditOps）

### 9.1 目标节点

- **flowId**：来自配置 `evolution.insertTree.targetFlowId`（必填）。
- **父节点**：若配置了 `targetSelectorNodeId`，则在该 Selector 的 children 的 **position 0** 插入新节点；若未配置，则约定为 **root**（此时 root 须为 Control 类型，否则报错）。

### 9.2 编辑操作

- 单条 EditOp：`insertNode`，参数：
  - `parentNodeId`：root 或配置的 targetSelectorNodeId（需在 BT 中存在且为 Sequence/Selector/Fallback）。
  - `position`：0（最左）。
  - `node`：LLM 输出的 btNode，其中 `tool` 必须为最终注册的 tool 名（含前缀若适用）。
- 调用现有 `applyEditOps(workspace, libraryPath, flowId, [op], { actor: "evolution_insert_tree" })`；成功则流程库已更新，下次 loadFlowLibrary 即得到新树。

### 9.3 校验

- insertNode 前：getFlow 得到当前 BT；校验 parent 存在且为 Control；校验 node.tool 在「当前 getMergedTools 合并后的工具名集合」中存在（即已写入 evolved_skills 并可在同进程下一次 getMergedTools 中看到；若实现上先写 Skill 再 applyEditOps，则插入时工具已存在）。

---

## 十、审计与安全

### 10.1 审计内容

- **进化尝试**：每次调用 `runEvolutionInsertTree` 记录（时间、sessionId/flowId、触发来源、是否通过沙盒、是否执行 insertNode）。
- **成功**：记录 toolName、flowId、parentNodeId、写入的 evolved_skills 路径；可复用 `flows/audit.jsonl` 或单独 `evolution.jsonl`。
- **失败**：记录失败阶段（parse / sandbox / applyEditOps）、错误信息、可选 LLM 重试次数。

### 10.2 安全

- **脚本不执行于主机敏感路径**：沙盒目录与 evolved_skills 均在 workspace 下；runSkillScript 已有 workspace 内路径校验，进化脚本与现有 Skill 同权。
- **危险命令与权限**：进化产出的脚本在被当作 Tool 调用时，与现有 Skill 一样走同一套 dangerous-check、permission、op-log（source 可标为 `evolution` 或 `skill`）。
- **不执行未通过沙盒的代码**：只有沙盒通过后才写入 evolved_skills 并参与 getMergedTools，避免未验证代码进入主工具表。

---

## 十一、接口与调用点

### 11.1 管线入口

- **函数**：`runEvolutionInsertTree(params: RunEvolutionInsertTreeParams): Promise<RunEvolutionInsertTreeResult>`。
- **参数**：config、workspace、libraryPath（flows）、evolution 配置覆盖项、**context**（sessionSummary、toolOps、可选 targetFlowSlice）、可选 sessionId/flowId（审计用）。
- **返回**：`{ success: true, toolName, flowId, appliedCount }` 或 `{ success: false, stage, error }`。

### 11.2 调用点

- **Gateway**：在 chat 处理中，若本轮满足 4.1 且 `requireUserConfirmation` 为 true，可向客户端返回「进化建议」；客户端发送确认（如 `evolution.confirm`）后，Gateway 组装 context 并调用 `runEvolutionInsertTree`，再将结果返回。
- **CLI**：可在某次 agent 运行成功后，提供子命令或参数（如 `--evolution-apply`），从当前 session/op-log 组装 context 并调用管线。
- **异步**：若 `autoRun` 为 true 且无需确认，runAgentLoop 或 BT 执行成功返回后，在**异步任务**中调用 `runEvolutionInsertTree`，不阻塞回复。

---

## 十二、失败与边界

| 阶段 | 失败情形 | 行为 |
|------|----------|------|
| 输入 | context 缺失或 toolOps 为空 | 直接返回 failure，不调 LLM |
| LLM | 输出非 JSON 或缺少必填字段 | 可选重试（maxRetries）；仍失败则返回并审计 |
| 沙盒 | 测试脚本 exit !== 0 或超时 | 可选重试；仍失败则返回，不写 evolved_skills、不插树 |
| 写入 | evolved_skills 写入失败（权限/磁盘） | 返回 failure，审计 |
| 插树 | applyEditOps 失败（如 parent 不存在） | 返回 failure；可选保留已写入的 evolved_skills 供人工处理或回滚 |

---

## 十三、与「新 flow 独立入库」的区分

- **轨迹 → FSM/BT（WO-BT-012/013）**：从 op 序列生成**整棵 flow** 并写入流程库；不产生新 Tool，不修改现有 BT。
- **进化插入树（本设计）**：从单次成功提炼出**一个脚本 + 一个 Action 节点**，脚本作为新 Tool 注册，节点插入**已有** BT 的 Selector 左侧；不创建新 flow。
- 两者可并存：同一会话既可「生成新 flow」也可「插入到现有树」，由配置与触发条件区分。

---

## 十四、配置与实现顺序建议

### 14.1 配置汇总

- `evolution.insertTree.enabled`
- `evolution.insertTree.autoRun`、`requireUserConfirmation`、`allowHighRiskOp`
- `evolution.insertTree.targetFlowId`、`targetSelectorNodeId`
- `evolution.insertTree.evolvedSkillsDir`、`sandboxTimeoutMs`、`maxRetries`

### 14.2 实现顺序（工单拆解建议）

1. **配置与入口**：evolution.insertTree 类型与 loadConfig；`runEvolutionInsertTree` 空壳 + 参数校验 + 审计写入。
2. **输入组装**：从 session/op-log/黑板聚合 context 的辅助函数（可由调用方传入，或由管线内部按约定拉取）。
3. **LLM 生成**：Prompt 构建、单次 LLM 调用、EvolutionLLMOutput 解析与校验。
4. **沙盒**：临时目录创建、script/test 写入、子进程执行与超时、通过/失败判定。
5. **进化 Skill 写入**：evolved_skills 目录、.js + .json 写入、命名与冲突检查。
6. **getMergedTools 集成**：加载 evolved_skills 目录并与现有 Skill 合并（含前缀策略）。
7. **插入树**：applyEditOps(insertNode)、targetFlowId/targetSelectorNodeId 解析、与 9 节一致。
8. **Gateway/CLI 调用点**：满足触发条件时返回建议或调用管线；可选 autoRun 异步调用。

---

## 十五、非目标与后续可选

- **多语言脚本**：首版仅 Node.js；后续可支持 Python 等，需在 Skill/runSkillScript 侧扩展。
- **A/B 或待审核**：新节点先进入「待审核」分支、人工确认后再设为默认，可与流程库版本/分支策略结合，不做首版必选。
- **回滚**：删除 evolved_skills 下某 toolName 的 .js/.json、并对 flow 做 applyEditOps(removeNode) 可回滚单次进化；自动化回滚策略可后续加。

---

*本文档为 WO-BT-024 的完整设计，实现时以本方案与主设计 §13.3、§十 为准；工单拆解可在本设计确认后从 §14.2 细化。*
