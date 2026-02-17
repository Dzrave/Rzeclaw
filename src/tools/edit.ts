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
  usageHint:
    "Use when: changing one exact snippet in a file (fix typo, update one line). old_string must match exactly. Pitfall: only first occurrence is replaced; for multiple use multiple edit calls.",
  examples: [
    { path: "package.json", old_string: "\"version\": \"0.0.0\"", new_string: "\"version\": \"1.0.0\"" },
  ],
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Relative path from workspace root" },
      old_string: { type: "string", description: "Exact string to replace" },
      new_string: { type: "string", description: "Replacement string" },
      dryRun: { type: "boolean", description: "If true, only return diff summary without writing (WO-IDE-011)" },
    },
    required: ["path", "old_string", "new_string"],
  },
  supportsDryRun: true,
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
    const dryRun = args.dryRun === true;
    try {
      const text = await readFile(full, "utf-8");
      const updated = applySearchReplace(text, oldStr, newStr);
      if (updated === text && oldStr) {
        return {
          ok: false,
          error: "old_string not found in file",
          code: "OLD_STRING_NOT_FOUND",
          suggestion: "Copy the exact string from the file (including spaces/newlines); old_string must match exactly.",
        };
      }
      if (dryRun) {
        return {
          ok: true,
          content: `[dry-run] Would edit ${rel}: replace old_string (${oldStr.length} chars) with new_string (${newStr.length} chars). First line of old: "${oldStr.split("\n")[0]?.slice(0, 50) ?? ""}..."`,
        };
      }
      await writeFile(full, updated, "utf-8");
      return {
        ok: true,
        content: `Updated ${rel}`,
        undoHint: { tool: "edit", args: { path: rel, old_string: newStr, new_string: oldStr } },
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const code = (e as NodeJS.ErrnoException)?.code === "ENOENT" ? "FILE_NOT_FOUND" : "EDIT_ERROR";
      const suggestion =
        (e as NodeJS.ErrnoException)?.code === "ENOENT"
          ? "Ensure the file exists; use read to verify path and content first."
          : "Check path and file permissions.";
      return { ok: false, error: msg, code, suggestion };
    }
  },
};
