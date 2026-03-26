/**
 * Phase 13 WO-BT-006/009/010/011: 执行器。按 flow 类型分发到 FSM 或 BT；注入 flowLibrary、runSubFlow、resultOf。
 */

import type { RezBotConfig } from "../config.js";
import type { ToolDef } from "../tools/types.js";
import type { FlowDef } from "./types.js";
import { isBTFlow, isFSMFlow } from "./types.js";
import { runFSM } from "./engine-fsm.js";
import { runBT } from "./engine-bt.js";
import type { FlowRunToolContext } from "./run-tool.js";

export type ExecuteFlowResult = { content: string; success: boolean };

export type ExecuteFlowParams = {
  config: RezBotConfig;
  workspace: string;
  flowId: string;
  flow: FlowDef;
  params: Record<string, string>;
  tools: ToolDef[];
  /** WO-BT-009/010: 子 flow 解析（BT 内 FSM 节点、FSM 内 runFlow） */
  flowLibrary?: Map<string, FlowDef>;
  /** WO-BT-021: 当前用户消息，供 BT 内 LLM 兜底节点使用 */
  userMessage?: string;
  /** WO-BT-021: LLM 兜底节点回调；未提供时 LLM 节点视为 failure */
  onLLMNode?: (opts: { message: string; contextSummary?: string }) => Promise<{ content: string; success: boolean }>;
  /** WO-BT-022: 会话黑板，flow 内可读写（占位符 {{blackboard.xxx}}、write_slot 工具） */
  blackboard?: Record<string, string>;
  /** Phase 14B: 执行该 flow 的 Agent 实例/蓝图 id，写入 ops.log */
  agentId?: string;
  blueprintId?: string;
  /** WO-1505: 会话 ID，写入 ops.log；WO-1507: 本会话已授权 scope */
  sessionId?: string;
  sessionGrantedScopes?: string[];
};

/**
 * 执行单个 flow（BT 或 FSM）；复用同一套 tool 执行与审计（WO-BT-007）。
 */
export async function executeFlow(params: ExecuteFlowParams): Promise<ExecuteFlowResult> {
  const flowLibrary = params.flowLibrary;
  const ctx: FlowRunToolContext = {
    config: params.config,
    workspace: params.workspace,
    placeholderContext: {
      workspace: params.workspace,
      params: params.params,
      resultOf: {},
      blackboard: params.blackboard,
    },
    flowId: params.flowId,
    tools: params.tools,
    flowLibrary,
    userMessage: params.userMessage,
    runLLMNode: params.onLLMNode,
    blackboard: params.blackboard,
    agentId: params.agentId,
    blueprintId: params.blueprintId,
    sessionId: params.sessionId,
    sessionGrantedScopes: params.sessionGrantedScopes,
    runSubFlow:
      flowLibrary &&
      (async (flowId: string, subParams: Record<string, string>) => {
        const flow = flowLibrary.get(flowId);
        if (!flow)
          return { content: `Flow not found: ${flowId}`, success: false };
        return executeFlow({
          config: params.config,
          workspace: params.workspace,
          flowId,
          flow,
          params: subParams,
          tools: params.tools,
          flowLibrary,
        });
      }),
  };

  if (isFSMFlow(params.flow)) {
    return runFSM(params.flow, ctx);
  }
  if (isBTFlow(params.flow)) {
    return runBT(params.flow, ctx);
  }
  return {
    content: `Unsupported flow type: ${(params.flow as FlowDef).type}`,
    success: false,
  };
}
