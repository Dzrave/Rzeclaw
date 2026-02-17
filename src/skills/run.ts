/**
 * WO-607: Skill 执行器。
 * 执行 script 类 Skill：cwd 限定为 workspace，子进程运行，返回 stdout/err 或 ToolResult。
 */

import { spawn } from "node:child_process";
import { join } from "node:path";
import type { ToolResult } from "../tools/types.js";

/**
 * 执行技能脚本。优先使用 skill.scriptResolvedPath（已限定在 workspace 内），否则用 scriptPath 相对 workspace。
 */
export async function runSkillScript(
  scriptPath: string,
  args: Record<string, unknown>,
  workspaceRoot: string,
  resolvedPath?: string
): Promise<ToolResult> {
  const pathToRun = resolvedPath ?? (scriptPath.startsWith("/") || /^[A-Za-z]:/.test(scriptPath) ? scriptPath : join(workspaceRoot, scriptPath));

  return new Promise((resolve) => {
    const argsArray = stringifyArgs(args);
    const child = spawn("node", [pathToRun, ...argsArray], {
      cwd: workspaceRoot,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (c) => { stdout += c; });
    child.stderr?.on("data", (c) => { stderr += c; });
    child.on("error", (err) => {
      resolve({
        ok: false,
        error: err.message,
        code: "SKILL_ERROR",
        suggestion: "Check script path and permissions.",
      });
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ ok: true, content: stdout.trim() || "(no output)" });
      } else {
        resolve({
          ok: false,
          error: stderr.trim() || stdout.trim() || `Exit code ${code}`,
          code: "SKILL_EXIT",
          suggestion: "Check script logic and arguments.",
        });
      }
    });
  });
}

function stringifyArgs(args: Record<string, unknown>): string[] {
  const arr: string[] = [];
  for (const [k, v] of Object.entries(args)) {
    if (v === undefined || v === null) continue;
    arr.push(`--${k}=${String(v)}`);
  }
  return arr;
}
