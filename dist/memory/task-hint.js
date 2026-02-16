/**
 * WO-301: 任务/意图识别。从当前用户消息抽取短句或关键词作为 current_task_hint。
 * 规则（关键词）优先，保证轻量、无额外模型调用。
 */
const TASK_KEYWORDS = [
    { keywords: ["写文档", "文档", "写 readme", "写 md"], hint: "写文档" },
    { keywords: ["修 bug", "修bug", "修复", "fix", "debug", "调试"], hint: "修 bug / 调试" },
    { keywords: ["运行", "执行", "跑", "run", "bash", "命令"], hint: "运行命令" },
    { keywords: ["编辑", "改文件", "修改", "edit"], hint: "编辑文件" },
    { keywords: ["读文件", "看文件", "读取", "read", "打开文件"], hint: "读文件" },
    { keywords: ["新建", "创建文件", "写文件", "write"], hint: "创建/写文件" },
    { keywords: ["查", "搜索", "找", "search", "grep"], hint: "搜索/查找" },
    { keywords: ["解释", "说明", "什么是", "为什么"], hint: "解释/说明" },
    { keywords: ["总结", "归纳", "概括"], hint: "总结" },
    { keywords: ["配置", "设置", "config", "安装"], hint: "配置/安装" },
];
function normalize(s) {
    return s.replace(/\s+/g, " ").trim().toLowerCase();
}
/**
 * 从当前轮用户消息中抽取任务标签（短句或关键词），用于写入 L1 的 task_hint 与检索时的任务相关度。
 * @param userMessage 当前用户输入
 * @returns 短句或关键词，无匹配时返回消息前 50 字或空串
 */
export function extractTaskHint(userMessage) {
    const raw = (userMessage ?? "").trim();
    if (!raw)
        return "";
    const normalized = normalize(raw);
    for (const { keywords, hint } of TASK_KEYWORDS) {
        if (keywords.some((kw) => normalized.includes(normalize(kw))))
            return hint;
    }
    // 无关键词匹配时：取前若干字作为弱 hint（避免过长）
    const maxLen = 50;
    return raw.length <= maxLen ? raw : raw.slice(0, maxLen) + "…";
}
