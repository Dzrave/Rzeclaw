/**
 * WO-IDE-013: undo_last — 执行最近一条可撤销操作的逆操作。
 */

import type { ToolDef, ToolResult } from "./types.js";
import { readLastUndoableEntry } from "../observability/op-log.js";
import { editTool } from "./edit.js";
import { writeTool } from "./write.js";

const SUPPORTED_UNDO_TOOLS: Record<string, ToolDef> = {
  edit: editTool,
  write: writeTool,
};

export const undoLastTool: ToolDef = {
  name: "undo_last",
  description:
    "Undo the last reversible operation (edit or write). Reads the last entry with undo_hint from the operation log and runs the inverse action. Use after an accidental edit or write.",
  usageHint: "Use when: the user or you just made an edit/write and want to revert it.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
  async handler(_args, cwd): Promise<ToolResult> {
    const entry = await readLastUndoableEntry(cwd);
    if (!entry?.undo_hint) {
      return {
        ok: false,
        error: "No reversible operation found in the recent operation log.",
        code: "NO_UNDOABLE",
        suggestion: "Only edit and write (when the file already existed) can be undone.",
      };
    }
    const { tool: toolName, args } = entry.undo_hint;
    const tool = SUPPORTED_UNDO_TOOLS[toolName];
    if (!tool) {
      return {
        ok: false,
        error: `Undo for tool "${toolName}" is not supported.`,
        code: "UNSUPPORTED_UNDO",
      };
    }
    const result = await tool.handler(args, cwd);
    if (result.ok) {
      return { ok: true, content: `Undid last ${toolName}: ${result.content}` };
    }
    return result;
  },
};
