/**
 * WO-407: 冷归档。将热存储中早于 coldAfterDays 的 L1 条目移入冷文件，热存储只保留近期条目。
 */
/**
 * 将热存储中 created_at 早于 cutoff 的条目移入冷文件；热文件重写为仅保留近期条目。
 * @param coldAfterDays 创建时间早于多少天的条目移入冷存储
 * @returns 移入冷存储的条数
 */
export declare function archiveCold(workspaceDir: string, workspaceId: string | undefined, coldAfterDays: number): Promise<number>;
