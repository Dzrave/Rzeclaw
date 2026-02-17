/**
 * WO-IDE-014: replay_ops — 从 ops.log 按最近 N 条重放操作；工具列表由 merged 注入，避免循环依赖。
 */

import type { ToolDef, ToolResult } from "./types.js";
import { readLastNEntries } from "../observability/op-log.js";

/**
 * 创建 replay_ops 工具，handler 使用传入的 baseTools 执行重放（不包含 replay_ops 自身）。
 */
export function createReplayOpsTool(baseTools: ToolDef[]): ToolDef {
  const byName = new Map<string, ToolDef>(baseTools.map((t) => [t.name, t]));

  return {
    name: "replay_ops",
    description:
      "Replay the last N operations from the operation log. Each logged tool call is re-executed in order. Use to repeat a sequence of commands or recover from a failed state.",
    usageHint: "Use when: user asks to 'run the last 3 commands again' or 'replay last steps'.",
    inputSchema: {
      type: "object",
      properties: {
        last: { type: "number", description: "Number of recent operations to replay (default 1)" },
      },
      required: [],
    },
    async handler(args, cwd): Promise<ToolResult> {
      const n = typeof args.last === "number" && args.last > 0 ? Math.min(args.last, 50) : 1;
      const entries = await readLastNEntries(cwd, n);
      if (entries.length === 0) {
        return { ok: true, content: "No operations found in the log to replay." };
      }
      const results: string[] = [];
      for (const entry of entries) {
        const tool = byName.get(entry.tool);
        if (!tool) {
          results.push(`[${entry.tool}] skipped (tool not in replay set)`);
          continue;
        }
        try {
          const result = await tool.handler(entry.args, cwd);
          if (result.ok) {
            results.push(`[${entry.tool}] ok: ${(result.content ?? "").slice(0, 80)}`);
          } else {
            results.push(`[${entry.tool}] error: ${result.error}`);
          }
        } catch (e) {
          results.push(`[${entry.tool}] throw: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      return { ok: true, content: results.join("\n") };
    },
    timeoutMs: 60000,
  };
}
