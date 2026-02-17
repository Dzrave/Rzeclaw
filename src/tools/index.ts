import type { ToolDef } from "./types.js";
import { bashTool } from "./bash.js";
import { readTool } from "./read.js";
import { writeTool } from "./write.js";
import { editTool } from "./edit.js";
import { processTool } from "./process.js";
import { envSummaryTool } from "./env-summary.js";
import { undoLastTool } from "./undo-last.js";
import { operationStatusTool } from "./operation-status.js";

export const CORE_TOOLS: ToolDef[] = [
  bashTool,
  readTool,
  writeTool,
  editTool,
  processTool,
  envSummaryTool,
  undoLastTool,
  operationStatusTool,
];

export function getTool(name: string): ToolDef | undefined {
  return CORE_TOOLS.find((t) => t.name === name);
}

export { type ToolDef, type ToolResult } from "./types.js";
