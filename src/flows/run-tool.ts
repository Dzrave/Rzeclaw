/**
 * Phase 13 WO-BT-004/005/007: 流程内单步工具执行。占位符解析、校验、危险检查、权限、审计（source=flow, flowId）。
 */

import { randomUUID } from "node:crypto";
import type { ToolDef, ToolResult } from "../tools/types.js";
import type { RzeclawConfig } from "../config.js";
import { validateToolArgs } from "../tools/validation.js";
import { checkDangerousCommand } from "../security/dangerous-commands.js";
import { getEffectivePolicy, isInScheduledGrant, TOOL_SCOPE_MAP } from "../security/permission-scopes.js";
import { appendOpLog, summarizeResult, classifyOpRisk } from "../observability/op-log.js";
import { resolvePlaceholders } from "./placeholders.js";
import type { PlaceholderContext } from "./placeholders.js";
import type { FlowDef } from "./types.js";

/** WO-BT-010: 执行子 flow（FSM 内 runFlow 时调用），由 executor 注入以避免循环依赖 */
export type RunSubFlowFn = (
  flowId: string,
  params: Record<string, string>
) => Promise<{ content: string; success: boolean }>;

export type FlowRunToolContext = {
  config: RzeclawConfig;
  workspace: string;
  placeholderContext: PlaceholderContext;
  flowId: string;
  tools: ToolDef[];
  /** WO-BT-009/010: 用于 FSM 节点、runFlow 解析子 flow */
  flowLibrary?: Map<string, FlowDef>;
  /** WO-BT-010: 执行子 flow（runFlow action），由 executor 注入 */
  runSubFlow?: RunSubFlowFn;
  /** WO-BT-021: 当前请求的用户消息，供 LLM 兜底节点使用 */
  userMessage?: string;
  /** WO-BT-021: BT 内 LLM 兜底节点回调，由 executor/gateway 注入 */
  runLLMNode?: (opts: { message: string; contextSummary?: string }) => Promise<{ content: string; success: boolean }>;
  /** WO-BT-022: 会话黑板，flow 内占位符 {{blackboard.xxx}} 与 write_slot 工具可读写 */
  blackboard?: Record<string, string>;
  /** Phase 14B: 执行该 flow 的 Agent 实例/蓝图 id，写入 ops.log */
  agentId?: string;
  blueprintId?: string;
  /** WO-1505: 会话 ID，写入 ops.log 便于按会话扫描高风险 */
  sessionId?: string;
  /** WO-1507: 本会话已授权 scope，同 scope 不再弹确认 */
  sessionGrantedScopes?: string[];
};

async function runToolWithTimeout(
  tool: ToolDef,
  args: Record<string, unknown>,
  cwd: string,
  timeoutMs: number
): Promise<ToolResult> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new Error(`Tool "${tool.name}" timed out after ${timeoutMs}ms`)),
      timeoutMs
    );
  });
  const handlerPromise = tool.handler(args, cwd);
  return Promise.race([handlerPromise, timeoutPromise]);
}

/**
 * 执行单次工具调用：解析占位符 → 校验 → 危险/权限检查 → 执行 → 写 op-log（source=flow, flowId）。
 * 与 runAgentLoop 中工具调用策略一致；需确认时返回 ok: false，不执行。
 */
export async function runToolForFlow(
  toolName: string,
  args: Record<string, unknown>,
  ctx: FlowRunToolContext
): Promise<ToolResult> {
  const resolved = resolvePlaceholders(args, ctx.placeholderContext) as Record<string, unknown>;
  const validationFail = validateToolArgs(toolName, resolved, ctx.workspace);
  if (validationFail) {
    const result: ToolResult = {
      ok: false,
      error: validationFail.message,
      code: validationFail.code,
      suggestion: validationFail.suggestion,
    };
    await appendOpLog(ctx.workspace, {
      op_id: randomUUID(),
      tool: toolName,
      args: resolved,
      result_ok: false,
      result_summary: `validation: ${validationFail.message}`,
      ts: new Date().toISOString(),
      risk_level: classifyOpRisk(toolName, resolved, validationFail.message),
      source: "flow",
      flowId: ctx.flowId,
      ...(ctx.agentId != null && { agentId: ctx.agentId }),
      ...(ctx.blueprintId != null && { blueprintId: ctx.blueprintId }),
      ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
    });
    return result;
  }

  if (toolName === "bash" && typeof resolved.command === "string") {
    const dangerous = checkDangerousCommand(resolved.command, ctx.config);
    if (dangerous.matched) {
      if (dangerous.mode === "block") {
        const result: ToolResult = {
          ok: false,
          error: "该命令被安全策略拒绝执行。",
          code: "DANGEROUS_COMMAND",
          suggestion: "使用更安全的替代命令或联系管理员。",
        };
        await appendOpLog(ctx.workspace, {
          op_id: randomUUID(),
          tool: toolName,
          args: resolved,
          result_ok: false,
          result_summary: "blocked: dangerous command",
          ts: new Date().toISOString(),
          risk_level: "high",
          source: "flow",
          flowId: ctx.flowId,
          ...(ctx.agentId != null && { agentId: ctx.agentId }),
          ...(ctx.blueprintId != null && { blueprintId: ctx.blueprintId }),
          ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
        });
        return result;
      }
      if (dangerous.mode === "dryRunOnly" && resolved.dryRun !== true) {
        const result: ToolResult = {
          ok: false,
          error: "该命令仅允许 dryRun 模式。",
          code: "DANGEROUS_COMMAND",
          suggestion: "使用 dryRun: true 或改用更安全的命令。",
        };
        await appendOpLog(ctx.workspace, {
          op_id: randomUUID(),
          tool: toolName,
          args: resolved,
          result_ok: false,
          result_summary: "blocked: dangerous (dryRun only)",
          ts: new Date().toISOString(),
          risk_level: "high",
          source: "flow",
          flowId: ctx.flowId,
          ...(ctx.agentId != null && { agentId: ctx.agentId }),
          ...(ctx.blueprintId != null && { blueprintId: ctx.blueprintId }),
          ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
        });
        return result;
      }
    }
  }

  if (toolName === "process" && resolved.action === "kill" && typeof resolved.pid === "number") {
    const protectedPids = ctx.config.security?.protectedPids;
    if (Array.isArray(protectedPids) && protectedPids.includes(resolved.pid)) {
      const result: ToolResult = {
        ok: false,
        error: "该进程在安全保护列表中，禁止终止。",
        code: "PROTECTED_PID",
        suggestion: "不要 kill 系统关键进程。",
      };
      await appendOpLog(ctx.workspace, {
        op_id: randomUUID(),
        tool: toolName,
        args: resolved,
        result_ok: false,
        result_summary: "blocked: protected pid",
        ts: new Date().toISOString(),
        risk_level: "high",
        source: "flow",
        flowId: ctx.flowId,
        ...(ctx.agentId != null && { agentId: ctx.agentId }),
        ...(ctx.blueprintId != null && { blueprintId: ctx.blueprintId }),
        ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
      });
      return result;
    }
  }

  const effectivePolicy = getEffectivePolicy(toolName, ctx.config);
  if (effectivePolicy === "deny") {
    const result: ToolResult = {
      ok: false,
      error: "该操作被安全策略拒绝。",
      code: "PERMISSION_DENIED",
      suggestion: "联系管理员或调整 security.permissionScopes 配置。",
    };
    await appendOpLog(ctx.workspace, {
      op_id: randomUUID(),
      tool: toolName,
      args: resolved,
      result_ok: false,
      result_summary: "denied: permission scope",
      ts: new Date().toISOString(),
      risk_level: "high",
      source: "flow",
      flowId: ctx.flowId,
      ...(ctx.agentId != null && { agentId: ctx.agentId }),
      ...(ctx.blueprintId != null && { blueprintId: ctx.blueprintId }),
      ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
    });
    return result;
  }
  const scope = TOOL_SCOPE_MAP[toolName] ?? toolName;
  const alreadyGranted =
    ctx.sessionGrantedScopes?.includes(scope) || isInScheduledGrant(scope, ctx.config);
  if (effectivePolicy === "confirm" && !alreadyGranted) {
    const result: ToolResult = {
      ok: false,
      error: "该操作需用户确认后方可执行。",
      code: "REQUIRES_CONFIRMATION",
      suggestion: "请向用户说明将要执行的操作，待用户批准后再重试；或使用「本次会话允许」后同 scope 不再确认。",
    };
    await appendOpLog(ctx.workspace, {
      op_id: randomUUID(),
      tool: toolName,
      args: resolved,
      result_ok: false,
      result_summary: "skipped: requires user confirmation",
      ts: new Date().toISOString(),
      risk_level: classifyOpRisk(toolName, resolved, "skipped: requires user confirmation"),
      source: "flow",
      flowId: ctx.flowId,
      ...(ctx.agentId != null && { agentId: ctx.agentId }),
      ...(ctx.blueprintId != null && { blueprintId: ctx.blueprintId }),
      ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
    });
    return result;
  }

  const tool = ctx.tools.find((t) => t.name === toolName);
  if (!tool) {
    const result: ToolResult = {
      ok: false,
      error: `Unknown tool: ${toolName}`,
      code: "UNKNOWN_TOOL",
      suggestion: "检查流程定义中的 tool 名称是否在可用工具列表中。",
    };
    await appendOpLog(ctx.workspace, {
      op_id: randomUUID(),
      tool: toolName,
      args: resolved,
      result_ok: false,
      result_summary: "unknown tool",
      ts: new Date().toISOString(),
      risk_level: "low",
      source: "flow",
      flowId: ctx.flowId,
      ...(ctx.agentId != null && { agentId: ctx.agentId }),
      ...(ctx.blueprintId != null && { blueprintId: ctx.blueprintId }),
      ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
    });
    return result;
  }

  const timeoutMs =
    ctx.config.ideOperation?.timeoutMs ?? tool.timeoutMs ?? 60000;
  let result: ToolResult;
  try {
    result = await runToolWithTimeout(tool, resolved, ctx.workspace, timeoutMs);
  } catch (e: unknown) {
    const isTimeout = e instanceof Error && e.message.includes("timed out");
    result = {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      code: isTimeout ? "TIMEOUT" : "TOOL_ERROR",
      suggestion: isTimeout
        ? "Retry with a shorter command or increase timeout."
        : "Check the error and retry with valid arguments.",
    };
  }

  const resultSummary = summarizeResult(result);
  await appendOpLog(ctx.workspace, {
    op_id: randomUUID(),
    tool: toolName,
    args: resolved,
    result_ok: result.ok,
    result_summary: resultSummary,
    ...(result.channel_used ? { channel_used: result.channel_used } : {}),
    ...(result.undoHint ? { undo_hint: result.undoHint } : {}),
    ts: new Date().toISOString(),
    risk_level: classifyOpRisk(toolName, resolved, resultSummary),
    source: "flow",
    flowId: ctx.flowId,
    ...(ctx.agentId != null && { agentId: ctx.agentId }),
    ...(ctx.blueprintId != null && { blueprintId: ctx.blueprintId }),
    ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
  });
  return result;
}
