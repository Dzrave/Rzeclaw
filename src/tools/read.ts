import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ToolDef, ToolResult } from "./types.js";
import { compressOutput } from "./compress.js";

export const readTool: ToolDef = {
  name: "read",
  description: "Read contents of a file. Path is relative to workspace.",
  usageHint:
    "Use when: viewing file contents, inspecting code/config. Use limit for large files. Pitfall: path must be relative to workspace (no absolute paths).",
  examples: [
    { path: "package.json" },
    { path: "src/index.ts", limit: 50 },
  ],
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Relative path from workspace root" },
      limit: { type: "number", description: "Max lines to return (optional)" },
    },
    required: ["path"],
  },
  async handler(args, cwd): Promise<ToolResult> {
    const rel = args.path as string;
    if (typeof rel !== "string" || !rel.trim()) {
      return { ok: false, error: "Missing path" };
    }
    const full = path.resolve(cwd, rel);
    if (!full.startsWith(path.resolve(cwd))) {
      return { ok: false, error: "Path must be inside workspace" };
    }
    try {
      let content = await readFile(full, "utf-8");
      const limit = typeof args.limit === "number" ? args.limit : undefined;
      let out = content;
      if (limit != null && limit > 0) {
        const lines = content.split("\n");
        out = lines.slice(0, limit).join("\n");
        if (lines.length > limit) out += `\n... (${lines.length - limit} more lines)`;
      }
      out = compressOutput(out);
      return { ok: true, content: out };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const code = (e as NodeJS.ErrnoException)?.code === "ENOENT" ? "FILE_NOT_FOUND" : "READ_ERROR";
      const suggestion =
        (e as NodeJS.ErrnoException)?.code === "ENOENT"
          ? "Check that the path exists and is relative to the workspace root."
          : "Check path and permissions.";
      return { ok: false, error: msg, code, suggestion };
    }
  },
};
