import { spawn } from "node:child_process";
import path from "node:path";
import { compressOutput } from "./compress.js";
const IS_WIN = process.platform === "win32";
const SHELL = IS_WIN ? "cmd.exe" : "/bin/bash";
const SHELL_ARGS = IS_WIN ? ["/c"] : ["-c"];
export const bashTool = {
    name: "bash",
    description: "Run a bash (or cmd on Windows) command in the workspace. Use for running scripts, listing files, etc.",
    usageHint: "Use when: running shell commands, listing dirs (ls/dir), running scripts, checking versions. Pitfall: paths are relative to workspace; avoid interactive commands.",
    examples: [
        { command: "ls -la" },
        { command: "node --version" },
    ],
    inputSchema: {
        type: "object",
        properties: {
            command: { type: "string", description: "Shell command to run" },
        },
        required: ["command"],
    },
    async handler(args, cwd) {
        const command = args.command;
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
                const raw = out ? `${out}\n[${status}]` : `[${status}]`;
                const content = compressOutput(raw);
                resolve({ ok: true, content });
            });
        });
    },
};
