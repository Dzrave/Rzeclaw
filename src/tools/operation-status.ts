/**
 * WO-IDE-015: operation_status — 查询异步操作的状态（如 bash async 启动的后台命令）。
 */

import type { ToolDef, ToolResult } from "./types.js";
import { getAsyncStatus } from "./async-ops.js";

export const operationStatusTool: ToolDef = {
  name: "operation_status",
  description:
    "Check the status of an async operation started with bash { async: true }. Returns running: true or running: false with exitCode, stdout, stderr.",
  usageHint: "Use when: you started a long command with bash { command: \"...\", async: true } and need to check if it finished.",
  inputSchema: {
    type: "object",
    properties: {
      asyncHandle: { type: "string", description: "Handle returned by bash when async: true" },
    },
    required: ["asyncHandle"],
  },
  async handler(args, _cwd): Promise<ToolResult> {
    const handle = typeof args.asyncHandle === "string" ? args.asyncHandle.trim() : "";
    if (!handle) {
      return { ok: false, error: "asyncHandle is required", code: "INVALID_ARGS" };
    }
    const status = getAsyncStatus(handle);
    if (!status) {
      return { ok: false, error: `No async operation found for handle: ${handle}`, code: "NOT_FOUND" };
    }
    if (status.running) {
      return { ok: true, content: `Running: ${status.command ?? "(unknown)"}. Poll again later.` };
    }
    const out = [status.stdout, status.stderr].filter(Boolean).join("\n");
    const exit = status.exitCode !== undefined ? `exit code ${status.exitCode}` : "exited";
    return {
      ok: true,
      content: out ? `${out}\n[${exit}]` : `[${exit}]`,
    };
  },
};
