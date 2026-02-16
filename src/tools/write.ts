import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { ToolDef, ToolResult } from "./types.js";

export const writeTool: ToolDef = {
  name: "write",
  description: "Write content to a file. Path is relative to workspace. Creates parent dirs if needed.",
  usageHint:
    "Use when: creating new files or overwriting whole file. For small edits prefer edit (old_string/new_string). Pitfall: overwrites entire file.",
  examples: [
    { path: "README.md", content: "# Title\n\nBody." },
  ],
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Relative path from workspace root" },
      content: { type: "string", description: "File content" },
    },
    required: ["path", "content"],
  },
  async handler(args, cwd): Promise<ToolResult> {
    const rel = args.path as string;
    const content = args.content as string;
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
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: msg };
    }
  },
};
