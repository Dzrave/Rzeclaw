/**
 * WO-621: 任务/目标体系与持久化。
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export type TaskStatus = "pending" | "in_progress" | "done" | "cancelled";

export type Task = {
  id: string;
  title: string;
  status: TaskStatus;
  source?: string;
  createdAt?: string;
  updatedAt?: string;
};

const DIR = ".rzeclaw";
const FILE = "tasks.json";

function tasksPath(workspaceRoot: string): string {
  return join(workspaceRoot, DIR, FILE);
}

export async function readTasks(workspaceRoot: string): Promise<Task[]> {
  try {
    const raw = await readFile(tasksPath(workspaceRoot), "utf-8");
    const data = JSON.parse(raw);
    return Array.isArray(data.tasks) ? data.tasks : [];
  } catch {
    return [];
  }
}

export async function writeTasks(
  workspaceRoot: string,
  tasks: Task[]
): Promise<void> {
  await mkdir(join(workspaceRoot, DIR), { recursive: true });
  await writeFile(
    tasksPath(workspaceRoot),
    JSON.stringify({ tasks, updatedAt: new Date().toISOString() }, null, 2),
    "utf-8"
  );
}
