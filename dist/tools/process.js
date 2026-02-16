export const processTool = {
    name: "process",
    description: "List or kill processes. action: 'list' (show running processes) or 'kill' with pid.",
    inputSchema: {
        type: "object",
        properties: {
            action: { type: "string", description: "list | kill" },
            pid: { type: "number", description: "Process ID (required for kill)" },
        },
        required: ["action"],
    },
    async handler(args, cwd) {
        const action = args.action;
        if (action === "list") {
            const { spawn } = await import("node:child_process");
            const { bashTool } = await import("./bash.js");
            return bashTool.handler({ command: process.platform === "win32" ? "tasklist" : "ps aux" }, cwd);
        }
        if (action === "kill") {
            const pid = args.pid;
            if (typeof pid !== "number" || !Number.isInteger(pid) || pid < 1) {
                return { ok: false, error: "kill requires a positive integer pid" };
            }
            try {
                process.kill(pid, "SIGTERM");
                return { ok: true, content: `Sent SIGTERM to pid ${pid}` };
            }
            catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                return { ok: false, error: msg };
            }
        }
        return { ok: false, error: "action must be list or kill" };
    },
};
