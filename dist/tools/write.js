import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
export const writeTool = {
    name: "write",
    description: "Write content to a file. Path is relative to workspace. Creates parent dirs if needed.",
    inputSchema: {
        type: "object",
        properties: {
            path: { type: "string", description: "Relative path from workspace root" },
            content: { type: "string", description: "File content" },
        },
        required: ["path", "content"],
    },
    async handler(args, cwd) {
        const rel = args.path;
        const content = args.content;
        if (typeof rel !== "string" || !rel.trim()) {
            return { ok: false, error: "Missing path" };
        }
        if (typeof content !== "string") {
            return { ok: false, error: "Missing content" };
        }
        const full = path.resolve(cwd, rel);
        if (!full.startsWith(path.resolve(cwd))) {
            return { ok: false, error: "Path must be inside workspace" };
        }
        try {
            await mkdir(path.dirname(full), { recursive: true });
            await writeFile(full, content, "utf-8");
            return { ok: true, content: `Wrote ${rel}` };
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return { ok: false, error: msg };
        }
    },
};
