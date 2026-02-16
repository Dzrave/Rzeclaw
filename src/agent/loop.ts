import Anthropic from "@anthropic-ai/sdk";

type MessageParam = Anthropic.MessageParam;
type Tool = Anthropic.Tool;
import type { RzeclawConfig } from "../config.js";
import { getApiKey } from "../config.js";
import { CORE_TOOLS, getTool, type ToolResult } from "../tools/index.js";
import { validateToolArgs } from "../tools/validation.js";
import { buildSystemPrompt } from "../prompts/system.js";
import { buildContextMessages } from "./context.js";
import { extractSessionGoal } from "./goal.js";
import { isComplexRequest, fetchPlanSteps } from "./planning.js";
import { readBootstrapContent } from "../evolution/bootstrap-doc.js";
import { logTurn } from "../observability/logger.js";
import { recordSession, setMetricsDir } from "../observability/metrics.js";
import { createStore } from "../memory/store-jsonl.js";
import { retrieve, formatAsCitedBlocks, MEMORY_SYSTEM_INSTRUCTION } from "../memory/retrieve.js";
import { extractTaskHint } from "../memory/task-hint.js";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type { Message } from "./context.js";
export type { Message } from "./context.js";

function toolToApi(t: { name: string; description: string; inputSchema: { type: "object"; properties?: object; required?: string[] } }): Tool {
  return {
    name: t.name,
    description: t.description,
    input_schema: { type: "object", properties: t.inputSchema.properties ?? {}, required: t.inputSchema.required ?? [] },
  };
}

export async function runAgentLoop(params: {
  config: RzeclawConfig;
  userMessage: string;
  sessionMessages: Message[];
  sessionId?: string;
  /** WO-401: 当前会话目标，后续轮中注入；不传则从首条用户消息推导 */
  sessionGoal?: string;
  /** Optional L0 summary for long sessions (summary + recent 2 rounds) */
  sessionSummary?: string;
  onText?: (chunk: string) => void;
}): Promise<{ content: string; messages: Message[]; sessionId: string; citedMemoryIds?: string[] }> {
  const apiKey = getApiKey(params.config);
  if (!apiKey) {
    throw new Error("Missing API key. Set ANTHROPIC_API_KEY or configure apiKeyEnv.");
  }

  const sessionId = params.sessionId ?? randomUUID();
  const observabilityDir = path.join(path.resolve(params.config.workspace), ".rzeclaw");
  setMetricsDir(observabilityDir);

  const client = new Anthropic({ apiKey });
  const model = params.config.model.replace("anthropic/", "");
  const workspace = path.resolve(params.config.workspace);

  const tools = CORE_TOOLS.map(toolToApi);
  let systemPrompt = buildSystemPrompt(CORE_TOOLS);
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
  if (params.sessionSummary) {
    systemPrompt += "\n\n[Previous context summary]\n" + params.sessionSummary;
  }
  let hasPlan = false;
  if (isComplexRequest(params.userMessage, params.config)) {
    const planSteps = await fetchPlanSteps(params.config, params.userMessage);
    if (planSteps) {
      hasPlan = true;
      systemPrompt += "\n\n[Plan]\n" + planSteps + "\n\n按步执行；每完成一步请简要说明已完成哪一步并继续下一步。";
    }
  }
  let citedMemoryIds: string[] = [];
  if (params.config.memory?.enabled) {
    const store = createStore(path.resolve(params.config.workspace), params.config.memory.workspaceId);
    const taskHint = extractTaskHint(params.userMessage);
    const entries = await retrieve(store, params.userMessage, {
      workspace_id: params.config.memory.workspaceId ?? path.resolve(params.config.workspace),
      limit: 5,
      task_hint: taskHint || undefined,
    });
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
  const apiMessages: MessageParam[] = [
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
    const response = await client.messages.create({
      model,
      max_tokens: 8192,
      system: systemPrompt,
      messages: apiMessages,
      tools: tools.length ? tools : undefined,
    });

    const last = response.content[response.content.length - 1];
    if (!last) break;

    if (last.type === "text") {
      fullReply += last.text;
      if (params.onText) params.onText(last.text);
      apiMessages.push({ role: "assistant", content: response.content as MessageParam["content"] });
      if (response.stop_reason === "end_turn" || !response.stop_reason) break;
    }

    if (last.type === "tool_use") {
      apiMessages.push({ role: "assistant", content: response.content as MessageParam["content"] });

      const toolUseBlocks = response.content.filter((b) => b.type === "tool_use") as Array<{
        type: "tool_use";
        id: string;
        name: string;
        input: Record<string, unknown>;
      }>;
      const toolResults: Array<{ type: "tool_result"; tool_use_id: string; content: string }> = [];

      for (const block of toolUseBlocks) {
        const tool = getTool(block.name);
        if (!tool) {
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Error (UNKNOWN_TOOL): Unknown tool: ${block.name}. Suggestion: Use one of bash, read, write, edit, process.` });
          continue;
        }
        const validationFail = validateToolArgs(block.name, block.input, workspace);
        if (validationFail) {
          const content = `Error (${validationFail.code}): ${validationFail.message}. Suggestion: ${validationFail.suggestion}`;
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content });
          continue;
        }
        let result: ToolResult;
        try {
          result = await tool.handler(block.input, workspace);
        } catch (e: unknown) {
          result = {
            ok: false,
            error: e instanceof Error ? e.message : String(e),
            code: "TOOL_ERROR",
            suggestion: "Check the error and retry with valid arguments or a different approach.",
          };
        }
        const content = result.ok
          ? result.content
          : result.code && result.suggestion
            ? `Error (${result.code}): ${result.error}. Suggestion: ${result.suggestion}`
            : `Error: ${result.error}`;
        toolCallsThisRun.push({ name: block.name, ok: result.ok });
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content });
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
