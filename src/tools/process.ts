import type { ToolDef, ToolResult } from "./types.js";

export const processTool: ToolDef = {
  name: "process",
  description: "List or kill processes. action: 'list' (show running processes) or 'kill' with pid.",
  usageHint:
    "Use when: listing running processes or terminating one by pid. For kill always pass a positive integer pid.",
  examples: [
    { action: "list" },
    { action: "kill", pid: 12345 },
  ],
  inputSchema: {
    type: "object",
    properties: {
      action: { type: "string", description: "list | kill" },
      pid: { type: "number", description: "Process ID (required for kill)" },
    },
    required: ["action"],
  },
  async handler(args, cwd): Promise<ToolResult> {
    const action = args.action as string;
    if (action === "list") {
      const { spawn } = await import("node:child_process");
      const { bashTool } = await import("./bash.js");
      return bashTool.handler(
        { command: process.platform === "win32" ? "tasklist" : "ps aux" },
        cwd
      );
    }
    if (action === "kill") {
      const pid = args.pid;
      if (typeof pid !== "number" || !Number.isInteger(pid) || pid < 1) {
        return {
        ok: false,
        error: "kill requires a positive integer pid",
        code: "PID_INVALID",
        suggestion: "Use action: 'list' to get PIDs, then pass one as pid for action: 'kill'.",
      };
      }
      try {
        process.kill(pid, "SIGTERM");
        return { ok: true, content: `Sent SIGTERM to pid ${pid}` };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, error: msg };
      }
    }
    return {
      ok: false,
      error: "action must be list or kill",
      code: "ACTION_INVALID",
      suggestion: "Use action: 'list' to list processes or action: 'kill' with pid to terminate.",
    };
  },
};
