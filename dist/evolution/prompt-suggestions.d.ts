/**
 * WO-405: 会话结束或定期，让模型输出「若改进 system/工具描述，建议…」的文本，追加到 workspace/.rzeclaw/prompt_suggestions.md，不自动应用。
 */
import type { RzeclawConfig } from "../config.js";
/**
 * 根据会话摘要让模型生成改进建议并追加到 workspace/.rzeclaw/prompt_suggestions.md。
 * 不修改实际 prompt；仅写入建议供人工采纳。
 */
export declare function writePromptSuggestions(params: {
    config: RzeclawConfig;
    workspaceDir: string;
    sessionId: string;
    summary: string;
}): Promise<void>;
