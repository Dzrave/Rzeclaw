/**
 * WO-602: Canvas 持久化读写。
 * 存储路径：workspace/.rzeclaw/canvas/current.json
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { CurrentPlan, Step } from "./types.js";
import { EMPTY_PLAN } from "./types.js";

const CANVAS_DIR = ".rzeclaw";
const CANVAS_FILE = "current.json";

function canvasPath(workspaceRoot: string): string {
  return join(workspaceRoot, CANVAS_DIR, "canvas", CANVAS_FILE);
}

/**
 * 读取当前画布；文件不存在或解析失败时返回空结构。
 */
export async function readCanvas(workspaceRoot: string): Promise<CurrentPlan> {
  const path = canvasPath(workspaceRoot);
  try {
    const raw = await readFile(path, "utf-8");
    const data = JSON.parse(raw) as CurrentPlan;
    if (!Array.isArray(data.steps)) data.steps = [];
    if (data.artifacts != null && !Array.isArray(data.artifacts)) data.artifacts = [];
    return {
      ...EMPTY_PLAN,
      ...data,
      steps: data.steps ?? [],
      artifacts: data.artifacts ?? [],
    };
  } catch {
    return { ...EMPTY_PLAN };
  }
}

/**
 * 写入画布；自动创建目录。
 */
export async function writeCanvas(
  workspaceRoot: string,
  data: CurrentPlan
): Promise<void> {
  const dir = join(workspaceRoot, CANVAS_DIR, "canvas");
  await mkdir(dir, { recursive: true });
  const path = canvasPath(workspaceRoot);
  const payload = {
    ...data,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(path, JSON.stringify(payload, null, 2), "utf-8");
}

/**
 * 部分更新画布：合并传入的字段，保留未传字段。
 */
export async function updateCanvas(
  workspaceRoot: string,
  partial: Partial<CurrentPlan>
): Promise<CurrentPlan> {
  const current = await readCanvas(workspaceRoot);
  const next: CurrentPlan = {
    ...current,
    ...partial,
    steps: partial.steps ?? current.steps,
    artifacts: partial.artifacts ?? current.artifacts,
    updatedAt: new Date().toISOString(),
  };
  await writeCanvas(workspaceRoot, next);
  return next;
}

/**
 * WO-604: 从规划步骤文本解析为 Step[]（1. xxx 2. xxx 或 - xxx）。
 */
export function parsePlanStepsToSteps(planStepsText: string): Step[] {
  const lines = planStepsText
    .split("\n")
    .map((l) => l.replace(/^\s*[\d\-\.、]+\.?\s*/, "").trim())
    .filter(Boolean);
  return lines.map((title, index) => ({
    index,
    title,
    status: "pending" as const,
  }));
}
