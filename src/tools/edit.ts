import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ToolDef, ToolResult } from "./types.js";

function applySearchReplace(
  text: string,
  oldString: string,
  newString: string
): string {
  if (!oldString) return text;
  const idx = text.indexOf(oldString);
  if (idx === -1) return text;
  return text.slice(0, idx) + newString + text.slice(idx + oldString.length);
}

export const editTool: ToolDef = {
  name: "edit",
  description: "Edit a file by replacing the first occurrence of old_string with new_string. Use for small, precise edits.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Relative path from workspace root" },
      old_string: { type: "string", description: "Exact string to replace" },
      new_string: { type: "string", description: "Replacement string" },
    },
    required: ["path", "old_string", "new_string"],
  },
  async handler(args, cwd): Promise<ToolResult> {
    const rel = args.path as string;
    const oldStr = args.old_string as string;
    const newStr = args.new_string as string;
    if (typeof rel !== "string" || !rel.trim()) {
      return { ok: false, error: "Missing path" };
    }
    if (typeof oldStr !== "string") {
      return { ok: false, error: "Missing old_string" };
    }
    if (typeof newStr !== "string") {
      return { ok: false, error: "Missing new_string" };
    }
    const full = path.resolve(cwd, rel);
    if (!full.startsWith(path.resolve(cwd))) {
      return { ok: false, error: "Path must be inside workspace" };
    }
    try {
      const text = await readFile(full, "utf-8");
      const updated = applySearchReplace(text, oldStr, newStr);
      if (updated === text && oldStr) {
        return { ok: false, error: "old_string not found in file" };
      }
      await writeFile(full, updated, "utf-8");
      return { ok: true, content: `Updated ${rel}` };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: msg };
    }
  },
};
