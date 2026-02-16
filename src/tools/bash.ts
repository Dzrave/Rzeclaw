import { spawn } from "node:child_process";
import path from "node:path";
import type { ToolDef, ToolResult } from "./types.js";

const IS_WIN = process.platform === "win32";
const SHELL = IS_WIN ? "cmd.exe" : "/bin/bash";
const SHELL_ARGS = IS_WIN ? ["/c"] : ["-c"];

export const bashTool: ToolDef = {
  name: "bash",
  description: "Run a bash (or cmd on Windows) command in the workspace. Use for running scripts, listing files, etc.",
  inputSchema: {
    type: "object",
    properties: {
      command: { type: "string", description: "Shell command to run" },
    },
    required: ["command"],
  },
  async handler(args, cwd): Promise<ToolResult> {
    const command = args.command as string;
    if (typeof command !== "string" || !command.trim()) {
      return { ok: false, error: "Missing or empty command" };
    }

    return new Promise((resolve) => {
      const child = spawn(SHELL, [...SHELL_ARGS, command.trim()], {
        cwd: path.resolve(cwd),
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (d) => { stdout += d.toString(); });
      child.stderr?.on("data", (d) => { stderr += d.toString(); });

      child.on("error", (err) => {
        resolve({ ok: false, error: err.message });
      });

      child.on("close", (code, signal) => {
        const out = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
        const status = signal ? `exit signal ${signal}` : `exit code ${code}`;
        const content = out ? `${out}\n[${status}]` : `[${status}]`;
        resolve({ ok: true, content });
      });
    });
  },
};
