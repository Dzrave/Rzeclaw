/**
 * RAG-4: 复盘机制入口。遥测、待审区、架构师分析。
 */

export { appendTelemetry, readTelemetry } from "./telemetry.js";
export type { TelemetryEvent } from "./telemetry.js";
export {
  writePending,
  getMorningReport,
  listPendingDates,
  applyPending,
  mergeRollingLedgerPendingIntoReport,
} from "./pending.js";
export type { PendingRun, PendingPatch } from "./pending.js";
export { runRetrospective } from "./architect.js";
