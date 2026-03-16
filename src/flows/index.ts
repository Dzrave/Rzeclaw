/**
 * Phase 13: 行为树/状态机流程库、路由与执行。
 * WO-BT-002 流程库加载；WO-BT-003 路由；WO-BT-004/005 引擎；WO-BT-006 Gateway 集成。
 */

export type {
  FlowDef,
  BTFlowDef,
  FSMFlowDef,
  BTNode,
  FlowToolAction,
  FSMState,
  FSMTransition,
  ConditionNode,
  FSMNode,
  FSMStateAction,
} from "./types.js";
export { isBTFlow, isFSMFlow, isRunFlowAction } from "./types.js";
export { loadFlowLibrary, getFlowLibrary } from "./loader.js";
export type { LoadFlowLibraryResult } from "./loader.js";
export { matchFlow, route } from "./router.js";
export type { MatchFlowContext, MatchFlowResult, RouteResult, RouteContext } from "./router.js";
export { executeFlow } from "./executor.js";
export type { ExecuteFlowResult, ExecuteFlowParams } from "./executor.js";
export { appendOutcome, getFlowSuccessRates, getRecentOutcomes, getRecentFailureSummary } from "./outcomes.js";
export type { OutcomeEntry, FlowSuccessRate } from "./outcomes.js";
export { updateFlowMetaAfterRun, setFlowMetaFlaggedForReplacement } from "./meta.js";
export { getFlowMetaMap } from "./meta.js";
export type { FlowMetaEntry, FlowMetaMap } from "./meta.js";
export { opsToTrajectory, trajectoryToFSM, trajectoryToBT, writeFlowToLibrary } from "./trajectory.js";
export type { TrajectoryStep } from "./trajectory.js";
export {
  createFlow,
  getFlow,
  replaceFlow,
  deleteFlow,
  archiveFlow,
  listFlows,
  applyEditOps,
  appendAudit,
} from "./crud.js";
export type {
  CreateFlowResult,
  CreateFlowOptions,
  ReplaceFlowOptions,
  ListFlowsEntry,
  ListFlowsOptions,
  EditOp,
  ApplyEditOpsResult,
  ApplyEditOpsOptions,
} from "./crud.js";
export { runTopologyIteration } from "./topology-iterate.js";
export type { RunTopologyIterationParams, RunTopologyIterationResult } from "./topology-iterate.js";
export {
  shouldTriggerFailureReplacement,
  performFailureReplacementAfterRun,
  runFailureReplacementScan,
} from "./failure-replacement.js";
export type { ShouldTriggerResult, RunFailureReplacementScanResult } from "./failure-replacement.js";
export {
  runEvolutionInsertTree,
  evolvedToolName,
  getEvolvedSkillsDir,
  getSandboxTimeoutMs,
  isValidToolName,
  assembleEvolutionContextFromWorkspace,
  canSuggestEvolution,
} from "./evolution-insert-tree.js";
export type {
  EvolutionContext,
  RunEvolutionInsertTreeParams,
  RunEvolutionInsertTreeResult,
  EvolutionLLMOutput,
  AssembleEvolutionContextOptions,
} from "./evolution-insert-tree.js";
export {
  runLLMGenerateFlow,
  isExplicitGenerateFlowRequest,
  shouldTryLLMGenerateFlow,
  specFromGenerateRequest,
  parseGenerateRequestFromLLM,
} from "./flow-from-llm.js";
export type {
  GenerateRequest,
  RunLLMGenerateFlowParams,
  RunLLMGenerateFlowResult,
} from "./flow-from-llm.js";
