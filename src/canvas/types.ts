/**
 * WO-601: Canvas 状态结构与类型定义。
 * 共享的「当前目标 / 计划 / 步骤 / 产物」状态，供 Agent 与前端读写。
 */

export type StepStatus = "pending" | "in_progress" | "done" | "skipped";

export type Step = {
  index: number;
  title: string;
  status: StepStatus;
  /** 可选：步骤产出说明或路径 */
  note?: string;
};

export type Artifact = {
  name: string;
  /** 文件路径或引用标识 */
  pathOrRef: string;
};

export type CurrentPlan = {
  /** 当前目标/目标描述 */
  goal?: string;
  /** 步骤列表 */
  steps: Step[];
  /** 当前执行到哪一步（0-based） */
  currentStepIndex?: number;
  /** 关键产物 */
  artifacts?: Artifact[];
  /** 最后更新时间，ISO 字符串 */
  updatedAt?: string;
};

export const EMPTY_PLAN: CurrentPlan = {
  steps: [],
  updatedAt: new Date().toISOString(),
};
