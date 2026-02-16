/**
 * WO-404: Bootstrap 文档。只读注入到会话上下文；可选追加需用户确认（此处仅实现只读）。
 */
import type { RzeclawConfig } from "../config.js";
/**
 * 读取工作区最佳实践文档内容。若配置了 evolution.bootstrapDocPath 则用该路径（相对 workspace 或绝对），否则用 workspace/WORKSPACE_BEST_PRACTICES.md。
 */
export declare function readBootstrapContent(config: RzeclawConfig): Promise<string>;
