/**
 * 卸载与移除：删除 node_modules、dist，并可选择是否保留或移除本地数据与配置。
 */

import { existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadConfig } from "./config.js";

export type UninstallOptions = {
  /** 是否移除工作区目录（config.workspace）内的文件；默认 false = 保留 */
  removeWorkspace?: boolean;
  /** 是否移除 rzeclaw.json / .rzeclaw.json；默认 false = 保留 */
  removeConfig?: boolean;
  /** 是否移除 .env；默认 false = 保留 */
  removeEnv?: boolean;
  /** 是否移除工作区内的 .rzeclaw 目录（记忆、快照、画布等）；默认 false = 保留 */
  removeRzeclawData?: boolean;
  /** 不提示，直接执行 */
  yes?: boolean;
};

export type UninstallResult = {
  removed: string[];
  kept: string[];
  errors: string[];
};

/**
 * 在 projectRoot（通常为 process.cwd()）下执行卸载。
 * 始终移除：node_modules、dist。
 * 根据选项决定是否移除：workspace 目录、配置文件、.env、工作区 .rzeclaw 数据。
 */
export function runUninstall(projectRoot: string, options: UninstallOptions): UninstallResult {
  const removed: string[] = [];
  const kept: string[] = [];
  const errors: string[] = [];

  const safeRemove = (label: string, pathToRemove: string, condition: boolean) => {
    if (!condition) {
      if (existsSync(pathToRemove)) kept.push(label);
      return;
    }
    if (!existsSync(pathToRemove)) return;
    try {
      rmSync(pathToRemove, { recursive: true, force: true });
      removed.push(label);
    } catch (e) {
      errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const safeRemoveFile = (label: string, pathToRemove: string, condition: boolean) => {
    if (!condition) {
      if (existsSync(pathToRemove)) kept.push(label);
      return;
    }
    if (!existsSync(pathToRemove)) return;
    try {
      rmSync(pathToRemove, { force: true });
      removed.push(label);
    } catch (e) {
      errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  let workspacePath: string | undefined;
  try {
    const config = loadConfig();
    workspacePath = resolve(projectRoot, config.workspace);
  } catch {
    workspacePath = join(projectRoot, "workspace");
  }

  safeRemove("node_modules", join(projectRoot, "node_modules"), true);
  safeRemove("dist", join(projectRoot, "dist"), true);
  safeRemoveFile(".env", join(projectRoot, ".env"), options.removeEnv === true);
  safeRemoveFile("rzeclaw.json", join(projectRoot, "rzeclaw.json"), options.removeConfig === true);
  safeRemoveFile(".rzeclaw.json", join(projectRoot, ".rzeclaw.json"), options.removeConfig === true);

  if (options.removeRzeclawData === true && workspacePath) {
    const rzeclawDir = join(workspacePath, ".rzeclaw");
    safeRemove("workspace/.rzeclaw", rzeclawDir, true);
  } else if (existsSync(join(workspacePath ?? "", ".rzeclaw"))) {
    kept.push("workspace/.rzeclaw");
  }

  if (options.removeWorkspace === true && workspacePath && existsSync(workspacePath)) {
    try {
      rmSync(workspacePath, { recursive: true, force: true });
      removed.push("workspace");
    } catch (e) {
      errors.push(`workspace: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else if (workspacePath && existsSync(workspacePath)) {
    kept.push("workspace");
  }

  return { removed, kept, errors };
}
