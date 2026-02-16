import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ToolDef, ToolResult } from "./types.js";

export const readTool: ToolDef = {
  name: "read",
  description: "Read contents of a file. Path is relative to workspace.",
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
      if (limit != null && limit > 0) {
        const lines = content.split("\n");
        content = lines.slice(0, limit).join("\n");
        if (lines.length > limit) content += `\n... (${lines.length - limit} more lines)`;
      }
      return { ok: true, content };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: msg };
    }
  },
};
