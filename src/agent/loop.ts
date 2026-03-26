import type { RezBotConfig } from "../config.js";
import { getRoleFragment } from "../config.js";
import { getLLMClient } from "../llm/index.js";
import type { LLMMessage } from "../llm/types.js";
import type { ToolResult, ToolDef } from "../tools/index.js";
import { getMergedTools } from "../tools/merged.js";
import { validateToolArgs } from "../tools/validation.js";
import { buildSystemPrompt } from "../prompts/system.js";
import { buildContextMessages } from "./context.js";
import { extractSessionGoal } from "./goal.js";
import { isComplexRequest, fetchPlanSteps } from "./planning.js";
import { readBootstrapContent } from "../evolution/bootstrap-doc.js";
import { logTurn } from "../observability/logger.js";
import { recordSession, setMetricsDir } from "../observability/metrics.js";
import { appendOpLog, summarizeResult, classifyOpRisk } from "../observability/op-log.js";
import { checkDangerousCommand } from "../security/dangerous-commands.js";
import {
  getEffectivePolicy,
  isInScheduledGrant,
  TOOL_SCOPE_MAP,
} from "../security/permission-scopes.js";
import { createStore } from "../memory/store-jsonl.js";
import { retrieve, formatAsCitedBlocks, MEMORY_SYSTEM_INSTRUCTION } from "../memory/retrieve.js";
import { extractTaskHint } from "../memory/task-hint.js";
import { updateCanvas, readCanvas, parsePlanStepsToSteps } from "../canvas/index.js";
import { syncCanvasToTasks } from "../proactive/canvas-sync.js";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type { Message } from "./context.js";
export type { Message } from "./context.js";

/** 将 ToolDef 转为统一 LLM 工具格式（name, description, inputSchema） */
function toLLMTools(
  tools: Array<{ name: string; description: string; inputSchema: { type: "object"; properties?: object; required?: string[] } }>
): Array<{ name: string; description: string; inputSchema: { type: "object"; properties?: Record<string, unknown>; required?: string[] } }> {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: { type: "object" as const, properties: (t.inputSchema.properties ?? {}) as Record<string, unknown>, required: t.inputSchema.required ?? [] },
  }));
}

/** WO-IDE-003: 带超时的工具执行；超时时间取 config.ideOperation?.timeoutMs ?? tool.timeoutMs ?? 60000 */
async function runToolWithTimeout(
  tool: ToolDef,
  args: Record<string, unknown>,
  cwd: string,
  timeoutMs: number
): Promise<ToolResult> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`Tool "${tool.name}" timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  const handlerPromise = tool.handler(args, cwd);
  return Promise.race([handlerPromise, timeoutPromise]);
}

/** WO-IDE-008: 将 ToolResult 序列化为传给模型的 content 字符串；若有扩展字段则追加 */
function toolResultToContent(result: ToolResult): string {
  const base = result.ok
    ? result.content
    : result.code && result.suggestion
      ? `Error (${result.code}): ${result.error}. Suggestion: ${result.suggestion}`
      : `Error: ${result.error}`;
  const ext: string[] = [];
  if (result.state_snapshot) ext.push(`[state_snapshot]\n${result.state_snapshot}`);
  if (result.suggested_next) ext.push(`[suggested_next]\n${result.suggested_next}`);
  return ext.length > 0 ? `${base}\n${ext.join("\n")}` : base;
}

export async function runAgentLoop(params: {
  config: RezBotConfig;
  userMessage: string;
  sessionMessages: Message[];
  sessionId?: string;
  /** WO-401: 当前会话目标，后续轮中注入；不传则从首条用户消息推导 */
  sessionGoal?: string;
  /** Optional L0 summary for long sessions (summary + recent 2 rounds) */
  sessionSummary?: string;
  /** Phase 17: 5 天滚动账本格式化的前文，注入 system prompt；隐私会话时由调用方传空或不传 */
  rollingContext?: string;
  /** Phase 10: 会话类型，用于注入角色片段 */
  sessionType?: string;
  /** Phase 10: 蜂群管理时的团队 id，用于注入协调范围 */
  teamId?: string;
  /** WO-SEC-006: 隐私会话标记；为 true 时调用方应不写入 L1、不持久化快照 */
  sessionFlags?: { privacy?: boolean };
  /** WO-SEC-010: 本会话已授权的 scope 列表（如 ["file_write"]），同 scope 不再弹确认 */
  sessionGrantedScopes?: string[];
  /** WO-BT-022: 会话黑板，与 flow 共享；取槽注入 system，并可提供 write_slot 工具 */
  blackboard?: Record<string, string>;
  onText?: (chunk: string) => void;
  /** Phase 14B: 覆盖角色片段（如 Agent 蓝图的 systemPrompt） */
  roleFragmentOverride?: string;
  /** Phase 14B: 仅使用名称在此列表中的工具；未配置则用全局合并结果 */
  toolsFilter?: string[];
  /** Phase 14B: 写入 ops.log 的 Agent 实例/蓝图 id */
  agentId?: string;
  blueprintId?: string;
  /** Phase 14B WO-1439: 局部记忆 — 使用该 scope 的 store 做检索；includeGlobal 时合并全局只读 */
  localMemoryScope?: {
    workspaceId: string;
    retrieveLimit: number;
    includeGlobal?: boolean;
  };
  /** Phase 14C: 覆盖工具列表（如含 delegate_to_agent）；未传则用 getMergedTools + write_slot */
  toolsOverride?: ToolDef[];
}): Promise<{ content: string; messages: Message[]; sessionId: string; citedMemoryIds?: string[] }> {
  const sessionId = params.sessionId ?? randomUUID();
  const observabilityDir = path.join(path.resolve(params.config.workspace), ".rezbot");
  setMetricsDir(observabilityDir);

  const llmClient = getLLMClient(params.config);
  const workspace = path.resolve(params.config.workspace);

  let mergedTools: ToolDef[];
  if (params.toolsOverride?.length) {
    mergedTools = params.toolsOverride;
  } else {
    mergedTools = await getMergedTools(params.config, workspace);
    if (params.toolsFilter?.length) {
      const set = new Set(params.toolsFilter);
      mergedTools = mergedTools.filter((t) => set.has(t.name));
    }
  if (params.sessionFlags?.privacy) {
    const policy = params.config.security?.privacySessionToolPolicy ?? "allow_all";
    if (policy === "none") mergedTools = [];
    else if (policy === "read_only") {
      const privacyAllowlist = new Set(["read", "env_summary"]);
      mergedTools = mergedTools.filter((t) => privacyAllowlist.has(t.name));
    }
  }
    if (params.blackboard) {
      mergedTools = [
        ...mergedTools,
        {
          name: "write_slot",
          description: "Write a value to the session blackboard (slot). Use to store key-value data for this session.",
          inputSchema: {
            type: "object",
            properties: { key: { type: "string", description: "Slot name" }, value: { type: "string", description: "Slot value" } },
            required: ["key", "value"],
          },
          handler: async (args: Record<string, unknown>) => {
            const k = String(args.key ?? "");
            const v = String(args.value ?? "");
            if (k) params.blackboard![k] = v;
            return { ok: true, content: "OK" };
          },
        } as ToolDef,
      ];
    }
  }
  const tools = toLLMTools(mergedTools);
  let systemPrompt = buildSystemPrompt(mergedTools);
  const bootstrapContent = await readBootstrapContent(params.config);
  if (bootstrapContent) {
    systemPrompt += "\n\n[Workspace best practices]\n" + bootstrapContent;
  }
  const sessionGoal =
    params.sessionGoal ??
    (params.sessionMessages.length > 0
      ? extractSessionGoal(params.sessionMessages.find((m) => m.role === "user")?.content ?? params.userMessage)
      : extractSessionGoal(params.userMessage));
  if (sessionGoal) {
    systemPrompt += "\n\n[Current session goal]\n" + sessionGoal;
  }
  if (params.rollingContext) {
    systemPrompt += "\n\n[Rolling context]\n" + params.rollingContext;
  }
  if (params.sessionSummary) {
    systemPrompt += "\n\n[Previous context summary]\n" + params.sessionSummary;
  }
  if (params.blackboard && Object.keys(params.blackboard).length > 0) {
    const lines = Object.entries(params.blackboard).map(([k, v]) => `${k}: ${v}`);
    systemPrompt += "\n\n[Session slots (blackboard)]\n" + lines.join("\n");
  }
  const roleFragment = params.roleFragmentOverride ?? getRoleFragment(params.config, params.sessionType);
  if (roleFragment) {
    systemPrompt += "\n\n[Role]\n" + roleFragment;
  }
  if (params.sessionType === "swarm_manager" && params.teamId && params.config.swarm?.teams) {
    const team = params.config.swarm.teams.find((t) => t.id === params.teamId);
    if (team) {
      const workspacesStr = Array.isArray(team.workspaces) && team.workspaces.length > 0
        ? team.workspaces.join("；")
        : "（未指定，请用户指定工作区）";
      systemPrompt += `\n\n[当前协调团队]\n${team.name}。工作区：${workspacesStr}`;
    }
  }
  let hasPlan = false;
  let planStepsText: string | null = null;
  if (isComplexRequest(params.userMessage, params.config)) {
    const planSteps = await fetchPlanSteps(params.config, params.userMessage);
    if (planSteps) {
      hasPlan = true;
      planStepsText = planSteps;
      systemPrompt += "\n\n[Plan]\n" + planSteps + "\n\n按步执行；每完成一步请简要说明已完成哪一步并继续下一步。";
    }
  }
  if (hasPlan && planStepsText) {
    const steps = parsePlanStepsToSteps(planStepsText);
    await updateCanvas(workspace, {
      goal: sessionGoal || params.userMessage.slice(0, 500),
      steps,
      currentStepIndex: 0,
    });
    await syncCanvasToTasks(workspace);
  }
  let citedMemoryIds: string[] = [];
  if (params.config.memory?.enabled && !params.sessionFlags?.privacy) {
    const taskHint = extractTaskHint(params.userMessage);
    let entries: Awaited<ReturnType<typeof retrieve>>;

    if (params.localMemoryScope) {
      const agentStore = createStore(path.resolve(params.config.workspace), params.localMemoryScope.workspaceId);
      if (params.localMemoryScope.includeGlobal && params.config.memory.workspaceId != null) {
        const globalStore = createStore(path.resolve(params.config.workspace), params.config.memory.workspaceId);
        const [fromAgent, fromGlobal] = await Promise.all([
          retrieve(agentStore, params.userMessage, {
            workspace_id: params.localMemoryScope.workspaceId,
            limit: params.localMemoryScope.retrieveLimit,
            task_hint: taskHint || undefined,
          }),
          retrieve(globalStore, params.userMessage, {
            workspace_id: params.config.memory.workspaceId ?? path.resolve(params.config.workspace),
            limit: params.localMemoryScope.retrieveLimit,
            task_hint: taskHint || undefined,
          }),
        ]);
        const seen = new Set<string>();
        entries = [];
        for (const e of fromAgent) {
          if (!seen.has(e.id)) {
            seen.add(e.id);
            entries.push(e);
          }
        }
        for (const e of fromGlobal) {
          if (!seen.has(e.id)) {
            seen.add(e.id);
            entries.push(e);
          }
        }
        entries = entries.slice(0, params.localMemoryScope.retrieveLimit);
      } else {
        entries = await retrieve(agentStore, params.userMessage, {
          workspace_id: params.localMemoryScope.workspaceId,
          limit: params.localMemoryScope.retrieveLimit,
          task_hint: taskHint || undefined,
        });
      }
    } else {
      const store = createStore(path.resolve(params.config.workspace), params.config.memory.workspaceId);
      const isKnowledge = params.sessionType === "knowledge";
      const retrieveLimit = isKnowledge
        ? (params.config.knowledge?.retrieveLimit ?? 10)
        : 5;
      entries = await retrieve(store, params.userMessage, {
        workspace_id: params.config.memory.workspaceId ?? path.resolve(params.config.workspace),
        limit: retrieveLimit,
        task_hint: taskHint || undefined,
      });
    }

    citedMemoryIds = entries.map((e) => e.id);
    const blocks = formatAsCitedBlocks(entries);
    if (blocks) {
      systemPrompt += "\n\n" + MEMORY_SYSTEM_INSTRUCTION + "\n\n" + blocks;
    }
  }
  const windowRounds = params.config.contextWindowRounds ?? 5;
  const contextMessages = buildContextMessages({
    messages: params.sessionMessages,
    windowRounds,
    sessionSummary: params.sessionSummary,
  });
  const apiMessages: LLMMessage[] = [
    ...contextMessages.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: params.userMessage },
  ];

  let fullReply = "";
  const maxTurns = 20;
  let turns = 0;
  const turnStart = Date.now();
  const toolCallsThisRun: Array<{ name: string; ok: boolean }> = [];

  while (turns < maxTurns) {
    turns++;
    const response = await llmClient.createMessage({
      system: systemPrompt,
      messages: apiMessages,
      tools: tools.length ? tools : undefined,
      max_tokens: 8192,
    });

    const last = response.content[response.content.length - 1];
    if (!last) break;

    if (last.type === "text") {
      fullReply += last.text;
      if (params.onText) params.onText(last.text);
      apiMessages.push({ role: "assistant", content: response.content });
      if (response.stop_reason === "end_turn" || !response.stop_reason) break;
    }

    if (last.type === "tool_use") {
      apiMessages.push({ role: "assistant", content: response.content });

      const toolUseBlocks = response.content.filter((b) => b.type === "tool_use") as Array<{
        type: "tool_use";
        id: string;
        name: string;
        input: Record<string, unknown>;
      }>;
      const toolResults: Array<{ type: "tool_result"; tool_use_id: string; content: string }> = [];
      const opLogOpts =
        params.sessionFlags?.privacy && params.config.security?.opsLogPrivacySessionPolicy === "omit"
          ? { skipWrite: true }
          : undefined;

      for (const block of toolUseBlocks) {
        const tool = mergedTools.find((t) => t.name === block.name);
        if (!tool) {
          const names = mergedTools.map((t) => t.name).join(", ");
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Error (UNKNOWN_TOOL): Unknown tool: ${block.name}. Suggestion: Use one of ${names}.` });
          continue;
        }
        const validationFail = validateToolArgs(block.name, block.input, workspace);
        if (validationFail) {
          const content = `Error (${validationFail.code}): ${validationFail.message}. Suggestion: ${validationFail.suggestion}`;
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content });
          continue;
        }
        let requiresConfirmation = false;
        if (block.name === "bash" && typeof block.input.command === "string") {
          const dangerous = checkDangerousCommand(block.input.command, params.config);
          if (dangerous.matched) {
            if (dangerous.mode === "block") {
              const content =
                "Error (DANGEROUS_COMMAND): 该命令被安全策略拒绝执行。Suggestion: 使用更安全的替代命令或联系管理员。";
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content });
              toolCallsThisRun.push({ name: block.name, ok: false });
              await appendOpLog(workspace, {
                op_id: randomUUID(),
                tool: block.name,
                args: block.input,
                result_ok: false,
                result_summary: "blocked: dangerous command",
                ts: new Date().toISOString(),
                risk_level: "high",
                ...(params.agentId != null && { agentId: params.agentId }),
                ...(params.blueprintId != null && { blueprintId: params.blueprintId }),
                ...(params.sessionId ? { sessionId: params.sessionId } : {}),
              }, opLogOpts);
              continue;
            }
            if (dangerous.mode === "dryRunOnly" && block.input.dryRun !== true) {
              const content =
                "Error (DANGEROUS_COMMAND): 该命令仅允许 dryRun 模式。Suggestion: 使用 dryRun: true 查看将执行的内容，或改用更安全的命令。";
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content });
              toolCallsThisRun.push({ name: block.name, ok: false });
              await appendOpLog(workspace, {
                op_id: randomUUID(),
                tool: block.name,
                args: block.input,
                result_ok: false,
                result_summary: "blocked: dangerous command (dryRun only)",
                ts: new Date().toISOString(),
                risk_level: "high",
                ...(params.agentId != null && { agentId: params.agentId }),
                ...(params.blueprintId != null && { blueprintId: params.blueprintId }),
                ...(params.sessionId ? { sessionId: params.sessionId } : {}),
              }, opLogOpts);
              continue;
            }
            if (dangerous.mode === "confirm") requiresConfirmation = true;
          }
        }
        if (
          block.name === "process" &&
          block.input.action === "kill" &&
          typeof block.input.pid === "number"
        ) {
          const protectedPids = params.config.security?.protectedPids;
          if (
            Array.isArray(protectedPids) &&
            protectedPids.includes(block.input.pid)
          ) {
            const content =
              "Error (PROTECTED_PID): 该进程在安全保护列表中，禁止终止。Suggestion: 不要 kill 系统关键进程。";
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content });
            toolCallsThisRun.push({ name: block.name, ok: false });
            await appendOpLog(workspace, {
              op_id: randomUUID(),
              tool: block.name,
              args: block.input,
              result_ok: false,
              result_summary: "blocked: protected pid",
              ts: new Date().toISOString(),
              risk_level: "high",
            ...(params.agentId != null && { agentId: params.agentId }),
            ...(params.blueprintId != null && { blueprintId: params.blueprintId }),
            ...(params.sessionId ? { sessionId: params.sessionId } : {}),
            }, opLogOpts);
            continue;
          }
          if (params.config.security?.processKillRequireConfirm === true) {
            requiresConfirmation = true;
          }
        }
        const scope = TOOL_SCOPE_MAP[block.name] ?? block.name;
        const effectivePolicy = getEffectivePolicy(block.name, params.config);
        if (effectivePolicy === "deny") {
          const content =
            "Error (PERMISSION_DENIED): 该操作被安全策略拒绝。Suggestion: 联系管理员或调整 security.permissionScopes 配置。";
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content });
          toolCallsThisRun.push({ name: block.name, ok: false });
          await appendOpLog(workspace, {
            op_id: randomUUID(),
            tool: block.name,
            args: block.input,
            result_ok: false,
            result_summary: "denied: permission scope",
            ts: new Date().toISOString(),
            risk_level: "high",
          ...(params.agentId != null && { agentId: params.agentId }),
          ...(params.blueprintId != null && { blueprintId: params.blueprintId }),
          ...(params.sessionId ? { sessionId: params.sessionId } : {}),
          }, opLogOpts);
          continue;
        }
        if (
          !requiresConfirmation &&
          effectivePolicy === "confirm" &&
          !isInScheduledGrant(scope, params.config) &&
          !params.sessionGrantedScopes?.includes(scope)
        ) {
          requiresConfirmation = true;
        }
        if (requiresConfirmation) {
          const result: ToolResult = {
            ok: false,
            error: "该操作需用户确认后方可执行。",
            code: "REQUIRES_CONFIRMATION",
            suggestion: "请向用户说明将要执行的操作，待用户批准后再重试或由用户自行执行。",
          };
          const content = toolResultToContent(result);
          toolCallsThisRun.push({ name: block.name, ok: false });
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content });
          await appendOpLog(workspace, {
            op_id: randomUUID(),
            tool: block.name,
            args: block.input,
            result_ok: false,
            result_summary: "skipped: requires user confirmation",
            ts: new Date().toISOString(),
            risk_level: classifyOpRisk(block.name, block.input, "skipped: requires user confirmation"),
            ...(params.agentId != null && { agentId: params.agentId }),
            ...(params.blueprintId != null && { blueprintId: params.blueprintId }),
            ...(params.sessionId ? { sessionId: params.sessionId } : {}),
          }, opLogOpts);
          continue;
        }
        const timeoutMs =
          params.config.ideOperation?.timeoutMs ?? (tool as ToolDef).timeoutMs ?? 60000;
        let result: ToolResult;
        try {
          result = await runToolWithTimeout(tool as ToolDef, block.input, workspace, timeoutMs);
        } catch (e: unknown) {
          const isTimeout = e instanceof Error && e.message.includes("timed out");
          result = {
            ok: false,
            error: e instanceof Error ? e.message : String(e),
            code: isTimeout ? "TIMEOUT" : "TOOL_ERROR",
            suggestion: isTimeout
              ? "Retry with a shorter command or increase timeout in config.ideOperation.timeoutMs."
              : "Check the error and retry with valid arguments or a different approach.",
          };
        }
        const content = toolResultToContent(result);
        toolCallsThisRun.push({ name: block.name, ok: result.ok });
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content });
        const resultSummary = summarizeResult(result);
        await appendOpLog(workspace, {
          op_id: randomUUID(),
          tool: block.name,
          args: block.input,
          result_ok: result.ok,
          result_summary: resultSummary,
          ...(result.channel_used ? { channel_used: result.channel_used } : {}),
          ...(result.undoHint ? { undo_hint: result.undoHint } : {}),
          ts: new Date().toISOString(),
          risk_level: classifyOpRisk(block.name, block.input, resultSummary),
          ...(params.agentId != null && { agentId: params.agentId }),
          ...(params.blueprintId != null && { blueprintId: params.blueprintId }),
          ...(params.sessionId ? { sessionId: params.sessionId } : {}),
        }, opLogOpts);
      }

      apiMessages.push({
        role: "user",
        content: toolResults.map((r) => ({
          type: "tool_result" as const,
          tool_use_id: r.tool_use_id,
          content: r.content,
        })),
      });
      const K = params.config.reflectionToolCallInterval ?? 3;
      if (K > 0 && toolCallsThisRun.length % K === 0 && toolCallsThisRun.length > 0) {
        apiMessages.push({
          role: "user",
          content:
            "[Reflection] 请根据上一步工具结果判断：是否达成子目标、是否需要重试或换策略。",
        });
      }
      if (hasPlan) {
        const canvas = await readCanvas(workspace);
        const idx = canvas.currentStepIndex ?? 0;
        const steps = canvas.steps.map((s, i) =>
          i === idx ? { ...s, status: "done" as const } : s
        );
        const nextIdx = Math.min(idx + 1, steps.length);
        await updateCanvas(workspace, { steps, currentStepIndex: nextIdx });
        await syncCanvasToTasks(workspace);
        apiMessages.push({
          role: "user",
          content: "[Progress] 请简要说明刚完成的步骤并继续下一步。",
        });
      }
    }
  }

  const durationMs = Date.now() - turnStart;
  logTurn({
    ts: new Date().toISOString(),
    session_id: sessionId,
    turn: 1,
    user_message_len: params.userMessage.length,
    response_len: fullReply.length,
    tool_calls: toolCallsThisRun,
    duration_ms: durationMs,
  });
  const failureCount = toolCallsThisRun.filter((t) => !t.ok).length;
  recordSession({
    session_id: sessionId,
    tool_call_count: toolCallsThisRun.length,
    tool_failure_count: failureCount,
    total_turns: 1,
    ts: new Date().toISOString(),
  });

  const finalMessages: Message[] = [
    ...params.sessionMessages,
    { role: "user", content: params.userMessage },
    { role: "assistant", content: fullReply },
  ];

  return {
    content: fullReply,
    messages: finalMessages,
    sessionId,
    ...(citedMemoryIds.length > 0 ? { citedMemoryIds } : {}),
  };
}
