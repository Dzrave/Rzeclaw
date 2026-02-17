# 自检、修复与卸载说明

本文档说明如何通过自检发现因本体使用导致的错误，如何用修复命令还原环境，以及如何卸载并选择保留或移除本地资料与配置。

---

## 一、自检（self-check）

在**项目根目录**执行：

```bash
node rzeclaw.mjs self-check
```

### 检查项

| 项 | 说明 |
|----|------|
| **node** | Node 版本是否 ≥18。 |
| **package.json** | 当前目录是否为项目根（存在 package.json）。 |
| **deps** | node_modules 是否存在且含关键依赖（如 @anthropic-ai/sdk）。 |
| **build** | 是否已构建（存在 dist/index.js）。 |
| **config** | 配置是否可加载（rzeclaw.json 等）。 |
| **llm** | LLM 是否就绪（API Key 或 Ollama 可用）。 |
| **workspace** | 工作区目录是否可写或可创建。 |

输出中会标出 `[OK]` / `[FAIL]`，并对失败项给出**修复建议**。

### 选项

- **`--repair`**：若存在失败项，自动执行修复（`npm install`、`npm run build`）。可与下面两项组合。
- **`--reset-config`**：修复时从 `rzeclaw.example.json` 覆盖恢复 `rzeclaw.json`。
- **`--reset-env`**：修复时从 `.env.example` 覆盖恢复 `.env`。
- **`-j, --json`**：输出 JSON 格式结果，便于脚本解析。

### 示例

```bash
# 仅自检
node rzeclaw.mjs self-check

# 自检并自动修复（不恢复配置）
node rzeclaw.mjs self-check --repair

# 自检并修复，同时恢复示例配置与 .env
node rzeclaw.mjs self-check --repair --reset-config --reset-env

# JSON 输出
node rzeclaw.mjs self-check --json
```

---

## 二、修复（repair）

仅执行修复步骤，不先做自检：

```bash
node rzeclaw.mjs repair
```

### 默认行为

- 执行 `npm install`
- 执行 `npm run build`

### 选项

- **`--reset-config`**：从 `rzeclaw.example.json` 覆盖写出 `rzeclaw.json`。
- **`--reset-env`**：从 `.env.example` 覆盖写出 `.env`。
- **`--no-install`**：跳过 `npm install`。
- **`--no-build`**：跳过 `npm run build`。

### 示例

```bash
# 仅重装依赖并重新构建
node rzeclaw.mjs repair

# 并恢复示例配置（会覆盖现有 rzeclaw.json）
node rzeclaw.mjs repair --reset-config

# 只重新构建，不执行 install
node rzeclaw.mjs repair --no-install
```

---

## 三、卸载（uninstall）

在**项目根目录**执行：

```bash
node rzeclaw.mjs uninstall
```

### 默认行为（保留本地资料与配置）

- **始终移除**：`node_modules/`、`dist/`
- **默认保留**：
  - 工作区目录（config 中的 workspace）
  - `rzeclaw.json`、`.rzeclaw.json`
  - `.env`
  - 工作区内的 `.rzeclaw` 目录（记忆、快照、画布等）

即：只卸掉「可再通过 `npm run setup` 恢复」的部分，不删你的配置和数据。

### 可选移除（需显式指定）

| 选项 | 说明 |
|------|------|
| **`--remove-config`** | 同时删除 `rzeclaw.json`、`.rzeclaw.json`。 |
| **`--remove-env`** | 同时删除 `.env`。 |
| **`--remove-rzeclaw-data`** | 同时删除工作区内的 `.rzeclaw` 目录（记忆、快照等）。 |
| **`--remove-workspace`** | 同时删除整个工作区目录（**慎用**，会删掉工作区内所有文件）。 |

### 其它选项

- **`-y, --yes`**：不二次确认，直接执行（当前实现中卸载本身无交互，此选项预留）。
- **`-j, --json`**：不实际删除，仅输出将要执行的操作（会移除/保留的项及错误信息）的 JSON。

### 示例

```bash
# 仅移除 node_modules 和 dist，保留配置与数据
node rzeclaw.mjs uninstall

# 同时移除配置与 .env，仍保留工作区及 .rzeclaw 数据
node rzeclaw.mjs uninstall --remove-config --remove-env

# 彻底清理：再移除工作区内的 .rzeclaw 与整个工作区目录
node rzeclaw.mjs uninstall --remove-config --remove-env --remove-rzeclaw-data --remove-workspace

# 仅查看将执行的操作（不删除）
node rzeclaw.mjs uninstall --json
```

---

## 四、使用流程建议

1. **使用异常时**：先执行 `node rzeclaw.mjs self-check` 查看哪一项失败，再按提示执行 `repair` 或 `self-check --repair`。
2. **需要还原到干净环境**：`node rzeclaw.mjs repair --reset-config --reset-env`（会覆盖现有配置与 .env，注意备份）。
3. **要卸载但保留配置与数据**：`node rzeclaw.mjs uninstall`；之后若要再用，在项目根执行 `npm run setup` 即可。
4. **要完全移除并清空本地数据**：按需加上 `--remove-config`、`--remove-env`、`--remove-rzeclaw-data`、`--remove-workspace`。

---

## 五、发现高风险操作后的纠正（WO-SEC-014）

当自检出现「最近 30 条操作中存在高风险记录」时，可按以下步骤纠正或核查：

1. **检查工作区**：确认 workspace 内文件与目录是否符合预期，有无被误删或误改。
2. **撤销最近一次可撤销操作**：若该操作为 write/edit 等且支持撤销，可运行  
   `node rzeclaw.mjs agent "请执行 undo_last 撤销上一步操作"`，或由 Gateway 发送相同意图的 chat 消息。
3. **重放操作（仅作核查）**：通过 `replay_ops`（若已注入工具）可查看最近 N 条操作记录，便于核对是否为本意。
4. **调整安全配置**：若确认为误拦，可调整 `security.dangerousCommands.mode`、`security.processKillRequireConfirm` 或 `security.permissionScopes`，详见 `docs/SECURITY_AND_PRIVACY_DESIGN.md`。
