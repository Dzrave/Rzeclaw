import { writeFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
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
      dryRun: { type: "boolean", description: "If true, only return what would be written without writing (WO-IDE-011)" },
    },
    required: ["path", "content"],
  },
  supportsDryRun: true,
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
    const dryRun = args.dryRun === true;
    if (dryRun) {
      const firstLine = content.split("\n")[0]?.slice(0, 60) ?? "";
      return { ok: true, content: `[dry-run] Would write ${rel} (${content.length} chars, ${content.split("\n").length} lines). First line: "${firstLine}${content.length > 60 ? "..." : ""}"` };
    }
    let previousContent: string | undefined;
    if (existsSync(full)) {
      try {
        previousContent = await readFile(full, "utf-8");
      } catch {
        // ignore
      }
    }
    try {
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, content, "utf-8");
      const result: ToolResult = { ok: true, content: `Wrote ${rel}` };
      if (previousContent !== undefined) {
        (result as { undoHint?: { tool: string; args: Record<string, unknown> } }).undoHint = {
          tool: "write",
          args: { path: rel, content: previousContent },
        };
      }
      return result;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: msg };
    }
  },
};
