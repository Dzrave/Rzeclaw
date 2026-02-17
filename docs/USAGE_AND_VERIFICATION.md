# 项目当前可用性与验证指南

本文档说明：**当前实现是否可正常使用**，以及**到智能助手实际验证使用还需哪些落实**。

---

## 一、当前是否可正常使用

**结论：可以。**

在满足以下前提时，项目已具备「正常使用」所需的最小闭环：

| 前提 | 说明 |
|------|------|
| **Node ≥18** | 已满足 package.json engines。 |
| **先构建** | 执行 `npm run build`，生成 `dist/`；`rzeclaw.mjs` 会加载 `dist/index.js`。 |
| **API Key** | 设置 `ANTHROPIC_API_KEY`（或配置 `apiKeyEnv` 指向其它环境变量）。 |
| **工作目录** | 配置 `workspace`（默认 `~/.rzeclaw/workspace`），或使用项目根等已有目录。 |

**两种使用方式均已打通：**

1. **CLI 单次对话**  
   ```bash
   node rzeclaw.mjs agent "列出当前目录下的前 10 个文件"
   ```  
   - 直接调用 `runAgentLoop`，输出流式回复；可选 `-r <sessionId>` 恢复会话。

2. **Gateway + 客户端**  
   ```bash
   node rzeclaw.mjs gateway
   ```  
   - 启动 WebSocket 服务（默认 `ws://127.0.0.1:18789`）；客户端通过 `chat` 方法发消息、收流式回复与工具结果。

因此，**从「发消息 → Agent 推理 → 工具调用 → 返回结果」这条主路径看，已可正常使用**。

---

## 二、与「正常使用」相关的现状说明

| 维度 | 状态 | 说明 |
|------|------|------|
| **核心工具** | ✅ | bash、read、write、edit、process、env_summary、undo_last、operation_status 已实现并注册。 |
| **IDE/PC 操作** | ✅ | 见 `docs/IDE_OPERATION_IMPLEMENTATION_PLAN.md`：L1 巩固、L2（Windows UIA）、Phase E（dry-run、undo、replay、async、keymouse）已实现；需在配置中显式开启 L2/L3。 |
| **配置** | ✅ | `loadConfig()` 支持 rzeclaw.json / .rzeclaw.json / ~/.rzeclaw/config.json；含 ideOperation、gateway、memory、heartbeat 等。 |
| **会话与持久化** | ✅ | Gateway 内存会话；`session.saveSnapshot` / `session.restore`；CLI 支持 `-r` 恢复。 |
| **记忆与知识库** | ✅ | 可选 memory、knowledge 等（见 config 与相关 Phase）。 |
| **终端/客户端** | ⚠️ | 无自带图形终端；需自行用 WS 客户端连 Gateway，或仅用 CLI。 |
| **README** | ⚠️ | 仍以「最小核心」为主，未覆盖当前全部能力（见下节「验证前建议落实」）。 |
| **安全与隐私** | 📋 设计已出 | 见 **`docs/SECURITY_AND_PRIVACY_DESIGN.md`**（三原则、现状、目标设计）与 **`docs/SECURITY_PRIVACY_IMPLEMENTATION_PLAN.md`**（实施计划与工单 WO-SEC-001～014）。 |

---

## 三、到智能助手「实际验证使用」还需落实的内容

以下按**建议优先级**列出，便于你按需实现或验收。

### 3.1 建议优先落实（验证前）

| 项 | 内容 | 目的 |
|----|------|------|
| **1. 一次端到端自测** | 在项目根执行：`npm run build` → `node rzeclaw.mjs agent "用 bash 列出当前目录并读 README.md 前 5 行"`，确认能完成工具调用并返回结果。 | 确认主链路无缺漏、无未捕获异常。 |
| **2. 最小配置与示例** | 在文档或仓库中提供 `rzeclaw.example.json`（含 workspace、port、可选 ideOperation 注释），便于新环境快速配置。 | 降低「跑不起来」的配置成本。 |
| **3. README 与入口文档更新** | 在 README 中补充：当前支持的命令（含 agent/gateway 等）、配置项摘要、指向 `docs/IDE_OPERATION_IMPLEMENTATION_PLAN.md` 与 `docs/USAGE_AND_VERIFICATION.md` 的链接。 | 让「如何跑、如何验证」一目了然。 |

### 3.2 按验证场景可选落实

| 场景 | 建议落实 | 说明 |
|------|----------|------|
| **仅 CLI 验证** | 无需更多实现；按 3.1 做一次自测即可。 | 已具备。 |
| **Gateway + 自制/第三方客户端** | 在文档中写明：Gateway 的 WebSocket 地址、`chat` 的请求/响应格式（含流式 chunk）、可选认证（gateway.auth.apiKeyEnv + params.apiKey）。 | 便于接终端或脚本验证。 |
| **L2 UI 自动化验证（Windows）** | 配置 `ideOperation.uiAutomation: true`、`allowedApps: ["Code", "cmd"]` 等；在文档中写一句「可用 ui_describe 列出窗口、ui_act 点击」的验证步骤。 | 确认 L2 在真实环境可用。 |
| **L3 键鼠验证（Windows）** | 配置 `ideOperation.keyMouse: true` 与 allowedApps；文档中写「先 focus 再 keymouse 发键」的示例。 | 确认 L3 可用且安全策略生效。 |
| **可撤销/重放验证** | 文档中写：先 edit 或 write，再调用 `undo_last`；或调用 `replay_ops` 重放最近 N 条。 | 确认 Phase E 行为符合预期。 |

### 3.3 非必须但可提升「可验证性」

| 项 | 内容 |
|----|------|
| **自动化冒烟测试** | 在 CI 或本地加一条：`node rzeclaw.mjs agent "reply with exactly: OK"`，断言输出包含 "OK"，用于回归。 |
| **Gateway 健康检查** | 若已有 `health` 或类似方法，在文档中写明，便于客户端判断服务就绪。 |
| **操作审计查看** | 说明 `.rzeclaw/ops.log` 与 `audit-export` 的用途，便于验证时核对工具调用与 undo/replay。 |

---

## 四、最小验证步骤（复制即用）

1. **构建与配置**  
   ```bash
   git clone https://github.com/Dzrave/Rzeclaw.git && cd Rzeclaw
   npm install
   npm run build
   set ANTHROPIC_API_KEY=sk-ant-...
   ```

2. **CLI 验证**  
   ```bash
   node rzeclaw.mjs agent "用 bash 执行 dir 或 ls，只输出前 5 行"
   ```  
   预期：Agent 调用 bash，输出中包含命令结果摘要。

3. **（可选）Gateway 验证**  
   - 终端 1：`node rzeclaw.mjs gateway`  
   - 终端 2：用任意 WebSocket 客户端发送：  
     `{"id":"1","method":"chat","params":{"message":"说 hello"}}`  
   预期：收到流式回复与最终 result。

4. **（可选）L2 验证（仅 Windows）**  
   - 在 `rzeclaw.json` 中设置 `"ideOperation": { "uiAutomation": true, "allowedApps": ["Code"] }`。  
   - 再次运行 agent 或 chat，请求：「列出当前打开的窗口」；预期可调用 `ui_describe` 并返回窗口列表。

5. **出现异常时的自检与修复**  
   - 运行 `node rzeclaw.mjs self-check` 检查环境、依赖、构建与配置。  
   - 若存在失败项，可执行 `node rzeclaw.mjs self-check --repair` 自动修复（重装依赖、重新构建）；需要从示例恢复配置时加 `--reset-config` / `--reset-env`。  
   - 若自检报告「最近操作中存在高风险记录」，可按 **`docs/SELF_CHECK_AND_UNINSTALL.md`** 中「发现高风险操作后的纠正」执行 undo_last、检查工作区或调整安全配置。

---

## 五、总结

- **当前项目实现状态可以正常使用**：主链路（配置 → agent/gateway → runAgentLoop → 工具调用 → 审计）已通，核心工具与 IDE/PC 操作（L1/L2/Phase E）已按设计实现。
- **到智能助手实际验证使用**，建议至少落实：**一次端到端自测**、**最小配置示例**、**README/入口文档更新**；其余按验证场景（Gateway 客户端、L2/L3、undo/replay）按需补充文档或自动化测试。  
- 完成上述最小落实后，即可在本地或自托管环境中对智能助手进行实际验证使用。
