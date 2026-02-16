/**
 * WO-301: 任务/意图识别。从当前用户消息抽取短句或关键词作为 current_task_hint。
 * 规则（关键词）优先，保证轻量、无额外模型调用。
 */
/**
 * 从当前轮用户消息中抽取任务标签（短句或关键词），用于写入 L1 的 task_hint 与检索时的任务相关度。
 * @param userMessage 当前用户输入
 * @returns 短句或关键词，无匹配时返回消息前 50 字或空串
 */
export declare function extractTaskHint(userMessage: string): string;
