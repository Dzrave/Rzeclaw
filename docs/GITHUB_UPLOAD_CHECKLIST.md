# 上传至 GitHub 前检查清单

在上传本仓库到 GitHub 前，建议确认以下内容已就绪并已提交。

---

## 必须包含（已实现）

| 项 | 说明 |
|----|------|
| **.gitignore** | 已创建，忽略 `node_modules/`、`dist/`、`.env`、`workspace/`、`.rzeclaw/`、常见 IDE/OS 文件，避免提交依赖与敏感信息。 |
| **LICENSE** | 已添加 MIT 许可证。 |
| **README.md** | 已包含一条龙安装与启动说明、配置要点、工具列表及文档链接。 |
| **.env.example** | 已存在，提供 `ANTHROPIC_API_KEY` 占位，供用户复制为 `.env`。 |
| **rzeclaw.example.json** | 已添加，最小配置示例（model、workspace、port、apiKeyEnv），供用户复制为 `rzeclaw.json`。 |
| **一条龙脚本** | `scripts/setup.ps1`（Windows）、`scripts/setup.sh`（macOS/Linux），执行安装 → 构建 → 可选复制 .env / rzeclaw.json。 |
| **npm run setup** | 已添加，等同于 `npm install && npm run build`。 |

---

## 建议检查

| 项 | 说明 |
|----|------|
| **不要提交** | 确保未提交 `.env`、真实 API Key、`dist/`（可构建）、`node_modules/`。.gitignore 已覆盖。 |
| **仓库描述** | 在 GitHub 仓库设置中填写简短描述与 Topics（如 ai, assistant, claude, automation）。 |
| **README 中的 clone URL** | 已设置为 `https://github.com/Dzrave/Rzeclaw`。 |

---

## 可选（按需）

| 项 | 说明 |
|----|------|
| **GitHub Actions** | 可在 `.github/workflows/ci.yml` 增加 `npm run build` 或 `npm test` 的 CI。 |
| **SECURITY.md** | 若接受安全披露，可添加安全策略说明。 |
| **CONTRIBUTING.md** | 若开放贡献，可补充开发与提交流程。 |

---

上传后，新用户可按 README「一条龙安装与配置、启动」执行脚本或 `npm run setup`，配置 API Key 后即可运行 `node rzeclaw.mjs agent "..."` 或 `node rzeclaw.mjs gateway`。
