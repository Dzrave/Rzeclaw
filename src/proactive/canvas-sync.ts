/**
 * Phase 9 WO-901 / WO-905: Canvas 与任务列表同步。
 * 将画布目标与步骤同步到 tasks.json；步骤状态与画布一致。
 */

import { readCanvas } from "../canvas/index.js";
import { readTasks, writeTasks, type Task } from "./tasks.js";

const CANVAS_GOAL_SOURCE = "canvas_goal";
const CANVAS_STEP_SOURCE_PREFIX = "canvas_step_";

export async function syncCanvasToTasks(workspaceRoot: string): Promise<void> {
  const canvas = await readCanvas(workspaceRoot);
  const existing = await readTasks(workspaceRoot);
  const bySource = new Map<string, Task>();
  for (const t of existing) bySource.set(t.source ?? t.id, t);

  const next: Task[] = [];
  const now = new Date().toISOString();

  if (canvas.goal?.trim()) {
    const id = bySource.get(CANVAS_GOAL_SOURCE)?.id ?? `task-${Date.now()}-goal`;
    next.push({
      id,
      title: canvas.goal.trim(),
      status: "pending",
      source: CANVAS_GOAL_SOURCE,
      createdAt: bySource.get(CANVAS_GOAL_SOURCE)?.createdAt ?? now,
      updatedAt: now,
    });
  }

  const steps = canvas.steps ?? [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const src = `${CANVAS_STEP_SOURCE_PREFIX}${i}`;
    const existingTask = bySource.get(src);
    const status =
      step.status === "done"
        ? "done"
        : step.status === "in_progress"
          ? "in_progress"
          : step.status === "skipped"
            ? "cancelled"
            : "pending";
    next.push({
      id: existingTask?.id ?? `task-${Date.now()}-${i}`,
      title: step.title,
      status,
      source: src,
      createdAt: existingTask?.createdAt ?? now,
      updatedAt: now,
    });
  }

  const otherTasks = existing.filter(
    (t) =>
      t.source !== CANVAS_GOAL_SOURCE &&
      !(t.source?.startsWith(CANVAS_STEP_SOURCE_PREFIX))
  );
  await writeTasks(workspaceRoot, [...otherTasks, ...next]);
}
