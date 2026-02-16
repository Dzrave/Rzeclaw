/**
 * WO-404: Bootstrap 文档。只读注入到会话上下文；可选追加需用户确认（此处仅实现只读）。
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { RzeclawConfig } from "../config.js";

const DEFAULT_FILENAME = "WORKSPACE_BEST_PRACTICES.md";

/**
 * 读取工作区最佳实践文档内容。若配置了 evolution.bootstrapDocPath 则用该路径（相对 workspace 或绝对），否则用 workspace/WORKSPACE_BEST_PRACTICES.md。
 */
export async function readBootstrapContent(config: RzeclawConfig): Promise<string> {
  const workspace = path.resolve(config.workspace);
  const customPath = config.evolution?.bootstrapDocPath;
  const filePath = customPath
    ? path.isAbsolute(customPath)
      ? customPath
      : path.join(workspace, customPath)
    : path.join(workspace, DEFAULT_FILENAME);
  try {
    const raw = await readFile(filePath, "utf-8");
    return raw.trim();
  } catch {
    return "";
  }
}
