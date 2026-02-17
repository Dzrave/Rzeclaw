/**
 * WO-IDE-005: env_summary — 能力发现，返回当前 workspace、cwd、platform，供模型规划时使用。
 */

import { platform } from "node:os";
import type { ToolDef, ToolResult } from "./types.js";

export const envSummaryTool: ToolDef = {
  name: "env_summary",
  description:
    "Get current execution environment summary: workspace path, cwd (same as workspace for agent), and platform (win32/darwin/linux). Use when planning which commands or tools to use.",
  usageHint: "Use when: you need to know the workspace root or platform before running bash or opening files.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
  async handler(_args, cwd): Promise<ToolResult> {
    const lines = [
      `workspace: ${cwd}`,
      `cwd: ${cwd}`,
      `platform: ${platform()}`,
    ];
    return { ok: true, content: lines.join("\n") };
  },
};
