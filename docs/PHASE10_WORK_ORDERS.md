# Phase 10：蜂群角色与多上下文工单

基于《蜂群角色与多上下文设计》进行工单拆解。**实现前需确认该设计文档。**

---

## 一、工单列表

| 工单 ID | 名称 | 依赖 | 范围 | 验收标准 |
|---------|------|------|------|----------|
| **WO-1001** | 配置中角色与 system 片段定义 | 无 | config.roles 或独立 roles 配置：dev、knowledge、pm、general 的 system 文本片段；加载与默认值。 | 可配置并读取各角色描述。 |
| **WO-1002** | Session 增加 sessionType 字段 | Phase 6/7 | Gateway 与 Session 类型增加 sessionType（dev|knowledge|pm|general）；session.getOrCreate 接受 params.sessionType 并持久化。 | 会话带类型并可传入。 |
| **WO-1003** | runAgentLoop 按 sessionType 注入角色片段 | WO-1001, WO-1002 | 根据 sessionType 追加对应 roles[sessionType] 到 systemPrompt；未传或 general 时不追加或追加通用描述。 | 不同会话类型得到不同角色提示。 |
| **WO-1004** | 快照与 session.list 返回 sessionType | WO-1002 | writeSnapshot/readSnapshot 含 sessionType；session.list 返回每条的 sessionType；终端可展示类型标签。 | 恢复与列表展示类型。 |
| **WO-1005** | session.list 按 workspace 过滤或分组 | 现有 session.list | session.list(workspace?, limit?) 已支持 workspace；返回结构可增加按 workspace 分组（或终端侧分组）；文档说明。 | 可按工作区查看会话。 |
| **WO-1006** | 终端：创建会话时选择会话类型 | Phase 7 | 新建会话时选择「开发/知识库/PM/通用」；调用 session.getOrCreate 时传入 sessionType。 | 用户可选类型并生效。 |
| **WO-1007** | 终端：会话列表与恢复展示 sessionType | WO-1004, Phase 7 | 会话列表项展示类型标签；恢复后当前会话类型与画布/提议一致。 | UI 与数据一致。 |
| **WO-1008** | 文档：角色与多上下文使用说明 | WO-1001～1005 | 说明 sessionType、roles 配置、多 workspace 使用方式；CONFIG_REFERENCE 补充 roles。 | 配置与用法可查。 |
| **WO-1009** | 蜂群管理角色与多层级配置 | 无 | config.roles.swarm_manager 与 config.swarm（teams: { id, name, workspaces? }[], defaultTeamId）；加载与默认值。 | 可配置蜂群管理角色与团队列表。 |
| **WO-1010** | swarm_manager 注入团队范围 | WO-1001/1009, WO-1003 | runAgentLoop 收到 sessionType=swarm_manager 且 teamId 时，从 config.swarm.teams 取团队信息并注入「当前协调团队：name，工作区：workspaces」。 | 蜂群管理会话可带协调范围。 |
| **WO-1011** | 终端：蜂群管理与团队选择 | WO-1006/1007, WO-1009 | 会话类型增加「蜂群管理」；若配置 swarm.teams 则可选团队下拉；getOrCreate 传 sessionType、teamId。 | 用户可选蜂群管理并可选团队。 |

---

## 二、建议实现顺序

WO-1001 → WO-1002 → WO-1003 → WO-1004 → WO-1005 → WO-1009 → WO-1010 → WO-1006 → WO-1007 → WO-1011 → WO-1008

---

## 三、依赖关系

- WO-1001 独立；WO-1002 依赖 Gateway/Session 现有结构；WO-1003 依赖 1001、1002；WO-1004 依赖 1002；WO-1005 依赖现有 list。  
- WO-1009 独立（与 1001 一起扩展 config）；WO-1010 依赖 1001/1009、1003；WO-1011 依赖 1006、1007、1009。  
- WO-1006、WO-1007 依赖 Phase 7 终端与 WO-1002、1004。

---

*实现时以 SWARM_ROLES_AND_CONTEXTS_DESIGN.md 与本文档为准。*
