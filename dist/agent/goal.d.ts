/**
 * WO-401: 目标锚定。从首条用户消息抽取或截取「主要目标」，供每轮注入上下文。
 */
/**
 * 从首条用户消息得到当前会话目标（短句）。规则：取原文前 MAX_GOAL_LEN 字，避免过长。
 */
export declare function extractSessionGoal(firstUserMessage: string): string;
