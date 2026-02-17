/**
 * WO-IDE-015: 异步长时操作状态存储；bash async 与 operation_status 共用。
 */

import type { ChildProcess } from "node:child_process";

export type AsyncOpState = {
  pid: number;
  command: string;
  startTime: number;
  stdout: string;
  stderr: string;
  exitCode?: number;
  signal?: string;
  child?: ChildProcess;
};

const store = new Map<string, AsyncOpState>();

export function registerAsyncBash(
  handle: string,
  child: ChildProcess,
  command: string
): void {
  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (d) => { stdout += d.toString(); });
  child.stderr?.on("data", (d) => { stderr += d.toString(); });
  child.on("close", (code, signal) => {
    const entry = store.get(handle);
    if (entry) {
      entry.exitCode = code ?? undefined;
      entry.signal = signal ?? undefined;
      entry.stdout = stdout;
      entry.stderr = stderr;
      entry.child = undefined;
    }
  });
  store.set(handle, {
    pid: child.pid ?? 0,
    command,
    startTime: Date.now(),
    stdout: "",
    stderr: "",
    child,
  });
}

export function getAsyncStatus(handle: string): { running: boolean; exitCode?: number; stdout?: string; stderr?: string; command?: string } | null {
  const entry = store.get(handle);
  if (!entry) return null;
  if (entry.exitCode !== undefined) {
    return {
      running: false,
      exitCode: entry.exitCode,
      stdout: entry.stdout,
      stderr: entry.stderr,
      command: entry.command,
    };
  }
  return { running: true, command: entry.command };
}
