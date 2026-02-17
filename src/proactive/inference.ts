/**
 * WO-622 / Phase 9 WO-906: 需求推断与提议生成。
 * 统一入口：任务+画布+近期记忆，输出 proposals/suggestions。
 */

import type { RzeclawConfig } from "../config.js";
import { readTasks } from "./tasks.js";
import { readCanvas } from "../canvas/index.js";
import { createStore } from "../memory/store-jsonl.js";
import { syncCanvasToTasks } from "./canvas-sync.js";
import path from "node:path";

export type ProactiveTrigger = "timer" | "event" | "on_open" | "explicit";

export type ProactiveResult = {
  proposals: string[];
  suggestions: string[];
  /** 标明仅为提议，不自动执行 */
  isProposalOnly: true;
};

const RECENT_MEMORY_LIMIT = 3;

/**
 * 基于任务列表、Canvas 与近期记忆（WO-906）生成提议。
 */
export async function runProactiveInference(
  config: RzeclawConfig,
  options: { trigger: ProactiveTrigger; workspaceRoot: string }
): Promise<ProactiveResult> {
  await syncCanvasToTasks(options.workspaceRoot);
  const tasks = await readTasks(options.workspaceRoot);
  const canvas = await readCanvas(options.workspaceRoot);
  const proposals: string[] = [];
  const suggestions: string[] = [];

  if (config.memory?.enabled) {
    const store = createStore(
      path.resolve(options.workspaceRoot),
      config.memory.workspaceId
    );
    const recent = await store.query_by_condition({
      limit: RECENT_MEMORY_LIMIT,
      validity: "active",
    });
    if (recent.length > 0) {
      const summary = recent
        .slice(0, RECENT_MEMORY_LIMIT)
        .map((e) => e.content.slice(0, 80) + (e.content.length > 80 ? "…" : ""))
        .join(" | ");
      suggestions.push(`近期记忆：${summary}`);
    }
  }

  const pending = tasks.filter((t) => t.status === "pending");
  if (pending.length > 0) {
    proposals.push(`当前有 ${pending.length} 项待办，建议优先处理：${pending.slice(0, 3).map((t) => t.title).join("；")}`);
  }
  if (canvas.goal && (canvas.steps?.length ?? 0) > 0) {
    const currentIdx = canvas.currentStepIndex ?? 0;
    const current = canvas.steps[currentIdx];
    if (current && current.status !== "done") {
      suggestions.push(`当前计划「${canvas.goal}」进行中，下一步：${current.title}`);
    }
  }
  if (proposals.length === 0 && suggestions.length === 0) {
    suggestions.push("暂无待办与进行中计划；可添加 HEARTBEAT.md 或 tasks 以启用主动提醒。");
  }

  return {
    proposals,
    suggestions,
    isProposalOnly: true,
  };
}
