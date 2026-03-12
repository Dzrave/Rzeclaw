/**
 * Phase 13 WO-BT-002: 行为树/状态机流程定义类型。
 * 与 BEHAVIOR_TREE_AND_STATE_MACHINE_DESIGN.md §5.2、§6.2 一致。
 */

/** 工具调用动作（与 BT Action 节点、FSM state.action 一致） */
export type FlowToolAction = {
  tool: string;
  args: Record<string, unknown>;
};

/** WO-BT-008: Condition 谓词 — fileExists(path) 或 env(KEY)[==value] */
export type ConditionNode =
  | { type: "Condition"; id?: string; predicate: "fileExists"; path: string }
  | { type: "Condition"; id?: string; predicate: "env"; key: string; value?: string };

/** WO-BT-009: BT 内嵌 FSM，通过 fsmId 从流程库解析 */
export type FSMNode = { type: "FSM"; id?: string; fsmId: string };

/** WO-BT-021: BT 内 LLM 兜底节点；仅当 Selector/Fallback 左侧兄弟全失败时执行 */
export type LLMNode = { type: "LLM"; id?: string };

/** 行为树节点：Control、Action（可选 id 供 resultOf/编辑）、Condition、FSM、LLM；WO-BT-025 编辑时需 id。 */
export type BTNode =
  | { type: "Sequence"; id?: string; children: BTNode[] }
  | { type: "Selector"; id?: string; children: BTNode[] }
  | { type: "Fallback"; id?: string; children: BTNode[] }
  | { type: "Action"; id?: string; tool: string; args: Record<string, unknown> }
  | ConditionNode
  | FSMNode
  | LLMNode;

/** RAG-3: flow 绑定的外源 RAG 集合，执行时仅在这些集合内检索 */
export type FlowMeta = {
  successCount?: number;
  failCount?: number;
  lastUsed?: string;
  archived?: boolean;
  /** 外源 RAG 集合名列表，如 ["external_docs"] */
  externalCollections?: string[];
};

/** 行为树 flow：含 id、type、root */
export type BTFlowDef = {
  id: string;
  version?: string;
  type: "bt";
  root: BTNode;
  meta?: FlowMeta;
};

/** WO-BT-010: FSM 状态 action 可为工具调用或 runFlow（内嵌 BT） */
export type FSMStateAction = FlowToolAction | { runFlow: string; params?: Record<string, unknown> };

export type FSMState = {
  id: string;
  action?: FSMStateAction;
};

/** FSM 迁移 */
export type FSMTransition = {
  from: string;
  to: string;
  on: "success" | "failure" | string;
};

/** 状态机 flow */
export type FSMFlowDef = {
  id: string;
  version?: string;
  type: "fsm";
  initial: string;
  states: FSMState[];
  transitions: FSMTransition[];
  meta?: FlowMeta;
};

/** 联合：BT 或 FSM */
export type FlowDef = BTFlowDef | FSMFlowDef;

export function isBTFlow(f: FlowDef): f is BTFlowDef {
  return f.type === "bt";
}

export function isFSMFlow(f: FlowDef): f is FSMFlowDef {
  return f.type === "fsm";
}

/** 判断 FSM state.action 是否为 runFlow（内嵌 BT） */
export function isRunFlowAction(
  a: FSMStateAction | undefined
): a is { runFlow: string; params?: Record<string, unknown> } {
  return a != null && "runFlow" in a && typeof (a as { runFlow?: string }).runFlow === "string";
}
