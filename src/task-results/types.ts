/**
 * WO-1540: 任务状态与结果类型
 * 设计依据: docs/TASK_GATEWAY_DECOUPLING_DESIGN.md §2
 */

export type TaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "timeout";

export interface TaskResultRecord {
  correlationId: string;
  sessionId?: string;
  status: TaskStatus;
  content?: string;
  error?: string;
  citedMemoryIds?: string[];
  completedAt?: string;
  expiresAt: string;
  createdAt: string;
}
