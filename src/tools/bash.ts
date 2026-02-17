import { spawn } from "node:child_process";
import path from "node:path";
import type { ToolDef, ToolResult } from "./types.js";
import { compressOutput } from "./compress.js";
import { registerAsyncBash } from "./async-ops.js";

const IS_WIN = process.platform === "win32";
const SHELL = IS_WIN ? "cmd.exe" : "/bin/bash";
const SHELL_ARGS = IS_WIN ? ["/c"] : ["-c"];

export const bashTool: ToolDef = {
  name: "bash",
  description: "Run a bash (or cmd on Windows) command in the workspace. Use for running scripts, listing files, IDE CLI (e.g. code, idea), etc.",
  usageHint:
    "Use when: running shell commands, listing dirs (ls/dir), running scripts (e.g. node scripts/foo.js, bash scripts/build.sh), checking versions. IDE: use 'code' (VS Code) or 'idea'/'webstorm' (JetBrains) to open project/file, e.g. 'code .' or 'code path/to/file.ts'. Pitfall: paths are relative to workspace; avoid interactive commands.",
  examples: [
    { command: "ls -la" },
    { command: "node --version" },
    { command: "code ." },
    { command: "node scripts/build.js" },
  ],
  inputSchema: {
    type: "object",
    properties: {
      command: { type: "string", description: "Shell command to run" },
      dryRun: { type: "boolean", description: "If true, only return what would be run without executing (WO-IDE-011)" },
      async: { type: "boolean", description: "If true, start command in background and return asyncHandle for operation_status (WO-IDE-015)" },
    },
    required: ["command"],
  },
  supportsDryRun: true,
  async handler(args, cwd): Promise<ToolResult> {
    const command = args.command as string;
    if (typeof command !== "string" || !command.trim()) {
      return { ok: false, error: "Missing or empty command" };
    }
    const dryRun = args.dryRun === true;
    if (dryRun) {
      return { ok: true, content: `[dry-run] Would run in ${cwd}: ${command.trim()}` };
    }
    const runAsync = args.async === true;

    const child = spawn(SHELL, [...SHELL_ARGS, command.trim()], {
      cwd: path.resolve(cwd),
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    if (runAsync) {
      const handle = String(child.pid ?? `async-${Date.now()}`);
      registerAsyncBash(handle, child, command.trim());
      return {
        ok: true,
        content: `Started in background. Use operation_status with asyncHandle: ${handle} to check progress.`,
        asyncHandle: handle,
      };
    }

    return new Promise((resolve) => {
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
        const raw = out ? `${out}\n[${status}]` : `[${status}]`;
        const content = compressOutput(raw);
        resolve({ ok: true, content });
      });
    });
  },
};
