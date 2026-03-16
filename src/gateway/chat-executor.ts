/**
 * Phase 14A WO-1406/1407: 执行层 — 消费 chat.request，执行 Router/Executor/runAgentLoop，发布 chat.response（及 chat.stream）
 * 会话与快照由 Gateway 维护；本模块不写快照，在 response 中回写 messages/sessionGoal/sessionSummary/blackboard。
 */

import path from "node:path";
import type { RzeclawConfig } from "../config.js";
import type { ChatRequestEvent, ChatResponseEvent } from "../event-bus/schema.js";
import { publish, TOPIC_SKILL_REQUEST } from "../event-bus/index.js";
import { createStore, createPrivacyIsolatedStore } from "../memory/store-jsonl.js";
import { getAgentMemoryWorkspaceId } from "../memory/agent-scope.js";
import { flushToL1, generateL0Summary } from "../memory/write-pipeline.js";
import { writeSessionSummaryFile } from "../memory/session-summary-file.js";
import { getRollingContextForPrompt } from "../memory/rolling-ledger.js";
import { appendToTodayBuffer } from "../memory/today-buffer.js";
import { extractTaskHint } from "../memory/task-hint.js";
import { promoteL1ToL2 } from "../memory/l2.js";
import { writePromptSuggestions } from "../evolution/prompt-suggestions.js";
import { archiveCold } from "../memory/cold-archive.js";
import { readSnapshot } from "../session/snapshot.js";
import { getMergedTools } from "../tools/merged.js";
import type { ToolDef } from "../tools/types.js";
import { getFlowLibrary, matchFlow, executeFlow, appendOutcome, getFlowSuccessRates, updateFlowMetaAfterRun, performFailureReplacementAfterRun, canSuggestEvolution, assembleEvolutionContextFromWorkspace, runLLMGenerateFlow, shouldTryLLMGenerateFlow, listFlows, route } from "../flows/index.js";
import { hasAgentsEnabled, getAgentBlueprint } from "../agents/blueprints.js";
import { getOrCreateInstance, setInstanceState } from "../agents/instances.js";
import { search as ragSearch, getRagContextForFlow } from "../rag/index.js";
import { appendTelemetry } from "../retrospective/telemetry.js";
import { addMotivationEntry } from "../rag/motivation.js";
import { singleTurnLLM } from "../llm/index.js";
import { isLlmReady, isLocalIntentClassifierAvailable } from "../config.js";
import { callIntentClassifier } from "../local-model/index.js";
import { runAgentLoop } from "../agent/loop.js";
import { runEvolutionInsertTree } from "../flows/evolution-insert-tree.js";
import { shouldSkipExploration, shouldEnterExploration, tryExploration } from "../exploration/index.js";
import { updateOutcomeAsync as updateExplorationOutcome } from "../exploration/experience.js";
import { requestDelegation } from "../collaboration/delegate.js";
import { requestSwarmBroadcast } from "../collaboration/swarm.js";

type SessionState = {
  messages: { role: "user" | "assistant"; content: string }[];
  sessionGoal?: string;
  sessionSummary?: string;
  sessionType?: string;
  sessionFlags?: { privacy?: boolean };
  blackboard: Record<string, string>;
};

function buildSessionFromEvent(event: ChatRequestEvent, workspace: string): Promise<SessionState> {
  const snap = event.sessionSnapshot;
  if (snap) {
    return Promise.resolve({
      messages: Array.isArray(snap.messages) ? [...snap.messages] : [],
      sessionGoal: snap.sessionGoal,
      sessionSummary: snap.sessionSummary,
      sessionType: snap.sessionType ?? event.sessionType,
      sessionFlags: event.privacy ? { privacy: true } : undefined,
      blackboard: snap.blackboard && typeof snap.blackboard === "object" ? { ...snap.blackboard } : {},
    });
  }
  const sessionId = event.sessionId ?? "main";
  return readSnapshot(workspace, sessionId).then((s) => ({
    messages: s?.messages ? [...s.messages] : [],
    sessionGoal: s?.sessionGoal,
    sessionSummary: s?.sessionSummary,
    sessionType: s?.sessionType ?? event.sessionType,
    sessionFlags: event.privacy ? { privacy: true } : undefined,
    blackboard: {},
  }));
}

/**
 * 处理一条 chat 请求：路由 → executeFlow 或 runAgentLoop，写 memory（不写快照），返回 ChatResponseEvent。
 */
export async function handleChatRequest(
  config: RzeclawConfig,
  event: ChatRequestEvent,
  onStream?: (chunk: string) => void
): Promise<ChatResponseEvent> {
  const correlationId = event.correlationId;
  const message = event.message;
  const sessionId = event.sessionId ?? "main";
  const workspace = path.resolve(event.workspace || config.workspace);
  const session = await buildSessionFromEvent(event, workspace);

  if (!session.sessionGoal) session.sessionGoal = message.trim().slice(0, 200);

  const summaryEveryRounds = config.summaryEveryRounds ?? 0;
  const rounds = Math.floor(session.messages.length / 2);
  if (
    summaryEveryRounds > 0 &&
    rounds >= summaryEveryRounds &&
    rounds > 0 &&
    rounds % summaryEveryRounds === 0
  ) {
    const newSummary = await generateL0Summary({ config, messages: session.messages });
    if (newSummary) session.sessionSummary = newSummary;
  }

  let flowLibrary: Map<string, import("../flows/types.js").FlowDef> | null = null;
  let successRates: Map<string, import("../flows/outcomes.js").FlowSuccessRate> | undefined;
  if (config.flows?.libraryPath) {
    flowLibrary = await getFlowLibrary(workspace, config.flows.libraryPath);
    successRates = await getFlowSuccessRates(workspace, config.flows.libraryPath);
  }

  if (hasAgentsEnabled(config) && flowLibrary) {
    const routeResult = route(message, { config, flowLibrary, successRates });
    if (routeResult.agentId) {
      const instance = getOrCreateInstance(config, routeResult.agentId, sessionId);
      const blueprint = getAgentBlueprint(config, routeResult.agentId);
      if (instance && blueprint) {
        setInstanceState(instance, "executing");
        try {
          if (routeResult.flowId && flowLibrary.has(routeResult.flowId)) {
            const flow = flowLibrary.get(routeResult.flowId)!;
            const flowStart = Date.now();
            let baseTools = await getMergedTools(config, workspace);
            if (blueprint.toolsFilter?.length) {
              const set = new Set(blueprint.toolsFilter);
              baseTools = baseTools.filter((t) => set.has(t.name));
            }
            const writeSlotTool: ToolDef = {
              name: "write_slot",
              description: "Write a value to the session blackboard (slot). Used by flows to pass data to the agent.",
              inputSchema: {
                type: "object",
                properties: { key: { type: "string", description: "Slot name" }, value: { type: "string", description: "Slot value" } },
                required: ["key", "value"],
              },
              handler: async (args) => {
                const k = String(args.key ?? "");
                const v = String(args.value ?? "");
                if (k) instance.blackboard[k] = v;
                return { ok: true, content: "OK" };
              },
            };
            const tools: ToolDef[] = [...baseTools, writeSlotTool];
            const result = await executeFlow({
              config,
              workspace,
              flowId: routeResult.flowId,
              flow,
              params: routeResult.params,
              tools,
              flowLibrary,
              blackboard: instance.blackboard,
              userMessage: message,
              agentId: instance.instanceId,
              blueprintId: instance.blueprintId,
              sessionId: event.sessionId ?? sessionId,
              sessionGrantedScopes: event.sessionGrantedScopes,
              onLLMNode: async (opts) => {
                try {
                  let contextSummary = opts.contextSummary ?? "";
                  const extColl = (flow as { meta?: { externalCollections?: string[] } }).meta?.externalCollections;
                  if (extColl?.length) {
                    const rag = await getRagContextForFlow(config, workspace, extColl, opts.message ?? message, 3);
                    if (rag) contextSummary = rag + "\n" + contextSummary;
                  }
                  const content = await singleTurnLLM(config, opts.message!, contextSummary);
                  return { content, success: true };
                } catch (e) {
                  return {
                    content: e instanceof Error ? e.message : String(e),
                    success: false,
                  };
                }
              },
            });
            const content = result.content;
            const libPath = config.flows!.libraryPath!;
            await appendOutcome(workspace, libPath, {
              flowId: routeResult.flowId,
              paramsSummary: JSON.stringify(routeResult.params).slice(0, 200),
              success: result.success,
              ts: new Date().toISOString(),
            });
            await updateFlowMetaAfterRun(workspace, libPath, routeResult.flowId, result.success);
            await performFailureReplacementAfterRun(workspace, libPath, routeResult.flowId, config);
            if (config.retrospective?.enabled) {
              void appendTelemetry(workspace, {
                ts: new Date().toISOString(),
                type: "flow_end",
                sessionId,
                flowId: routeResult.flowId,
                success: result.success,
                durationMs: Date.now() - flowStart,
                intentSource: "agent_route",
              });
            }
            const messages: { role: "user" | "assistant"; content: string }[] = [
              ...session.messages,
              { role: "user", content: message },
              { role: "assistant", content },
            ];
            if (config.memory?.enabled && messages.length >= 2 && !session.sessionFlags?.privacy) {
              const useLocalMemory = blueprint.localMemory?.enabled === true;
              const memoryWorkspaceId = useLocalMemory
                ? getAgentMemoryWorkspaceId(blueprint.id)
                : (config.memory.workspaceId ?? workspace);
              const store = createStore(workspace, memoryWorkspaceId);
              const { summary, factCount } = await flushToL1({
                config,
                sessionId,
                messages,
                store,
                workspaceId: memoryWorkspaceId,
                taskHint: extractTaskHint(message),
              });
              await writeSessionSummaryFile({ workspaceDir: workspace, sessionId, summary, factCount });
              if (config.memory?.rollingLedger?.enabled && summary) {
                void appendToTodayBuffer({ workspaceDir: workspace, sessionId, content: summary, source: "flushToL1" });
              }
              if (!useLocalMemory) {
                await promoteL1ToL2(store, {
                  workspace_id: memoryWorkspaceId,
                  created_after: new Date(Date.now() - 120_000).toISOString(),
                  limit: 50,
                });
                if (typeof config.memory.coldAfterDays === "number" && config.memory.coldAfterDays > 0) {
                  await archiveCold(workspace, config.memory.workspaceId, config.memory.coldAfterDays);
                }
                if (config.security?.privacyIsolationRetentionDays != null && config.security.privacyIsolationRetentionDays > 0) {
                  const { cleanupPrivacyIsolated } = await import("../memory/privacy-isolation.js");
                  await cleanupPrivacyIsolated(workspace, config.security.privacyIsolationRetentionDays);
                }
              }
              await writePromptSuggestions({ config, workspaceDir: workspace, sessionId, summary });
            } else if (
              config.memory?.enabled &&
              messages.length >= 2 &&
              session.sessionFlags?.privacy &&
              typeof config.security?.privacyIsolationRetentionDays === "number"
            ) {
              const store = createPrivacyIsolatedStore(workspace, sessionId);
              await flushToL1({
                config,
                sessionId,
                messages,
                store,
                workspaceId: config.memory.workspaceId ?? workspace,
                taskHint: extractTaskHint(message),
                skipAuditLog: true,
              });
            }
            setInstanceState(instance, "idle");
            const nextId = instance.blackboard["__nextAgentId"];
            return {
              correlationId,
              content,
              messages,
              sessionGoal: session.sessionGoal,
              sessionSummary: session.sessionSummary,
              blackboard: { ...instance.blackboard },
              sourceAgentId: blueprint.id,
              ...(nextId ? { pipelineNextAgentId: nextId } : {}),
            };
          }

          if (!isLlmReady(config)) {
            const noRouteMsg = "未匹配到流程且当前未配置可用的大模型，无法进行开放域对话。";
            setInstanceState(instance, "idle");
            return {
              correlationId,
              content: noRouteMsg,
              messages: [...session.messages, { role: "user", content: message }, { role: "assistant", content: noRouteMsg }],
              sessionGoal: session.sessionGoal,
              sessionSummary: session.sessionSummary,
              blackboard: { ...instance.blackboard },
            };
          }
          let baseToolsForLoop = await getMergedTools(config, workspace);
          if (blueprint.toolsFilter?.length) {
            const set = new Set(blueprint.toolsFilter);
            baseToolsForLoop = baseToolsForLoop.filter((t) => set.has(t.name));
          }
          const writeSlotToolLoop: ToolDef = {
            name: "write_slot",
            description: "Write a value to the session blackboard (slot).",
            inputSchema: {
              type: "object",
              properties: { key: { type: "string", description: "Slot name" }, value: { type: "string", description: "Slot value" } },
              required: ["key", "value"],
            },
            handler: async (args) => {
              const k = String(args.key ?? "");
              const v = String(args.value ?? "");
              if (k) instance.blackboard[k] = v;
              return { ok: true, content: "OK" };
            },
          };
          const delegateTool: ToolDef = {
            name: "delegate_to_agent",
            description: "Delegate a sub-task to another agent by id. Blocks until the worker returns or times out.",
            inputSchema: {
              type: "object",
              properties: {
                targetAgentId: { type: "string", description: "Blueprint id of the worker agent" },
                message: { type: "string", description: "Task instruction for the worker" },
                params: { type: "object", description: "Optional params for the worker" },
              },
              required: ["targetAgentId", "message"],
            },
            handler: async (args) => {
              const targetId = String(args.targetAgentId ?? "");
              const msg = String(args.message ?? "");
              if (!targetId || !msg) return { ok: false, error: "targetAgentId and message required" };
              setInstanceState(instance, "waiting");
              try {
                const result = await requestDelegation(config, {
                  sourceAgentId: blueprint.id,
                  targetAgentId: targetId,
                  task: { message: msg, params: args.params as Record<string, unknown> | undefined, blackboard: { ...instance.blackboard } },
                  correlationId: event.correlationId,
                  pipelineId: event.meta?.pipelineId as string | undefined,
                });
                setInstanceState(instance, "executing");
                if (result.blackboardDelta && Object.keys(result.blackboardDelta).length > 0) {
                  Object.assign(instance.blackboard, result.blackboardDelta);
                }
                if (result.success) return { ok: true, content: result.content ?? "Done." };
                return { ok: false, error: result.error ?? "Delegation failed" };
              } catch (e) {
                setInstanceState(instance, "executing");
                return { ok: false, error: e instanceof Error ? e.message : String(e) };
              }
            },
          };
          const broadcastSwarmTool: ToolDef = {
            name: "broadcast_to_swarm",
            description: "Broadcast a task to multiple agents; collect contributions and return aggregated result.",
            inputSchema: {
              type: "object",
              properties: {
                message: { type: "string", description: "Task instruction for the swarm" },
                targetAgentIds: { type: "string", description: "Optional comma-separated agent ids; empty = all" },
              },
              required: ["message"],
            },
            handler: async (args) => {
              const msg = String(args.message ?? "");
              if (!msg) return { ok: false, error: "message required" };
              const raw = args.targetAgentIds;
              const targetIds = typeof raw === "string" && raw.trim()
                ? raw.split(",").map((s) => s.trim()).filter(Boolean)
                : undefined;
              try {
                const contributions = await requestSwarmBroadcast(
                  config,
                  {
                    sourceAgentId: blueprint.id,
                    task: { message: msg },
                    targetAgentIds: targetIds?.length ? targetIds : undefined,
                    correlationId: event.correlationId,
                    pipelineId: event.meta?.pipelineId as string | undefined,
                  },
                  { timeoutMs: 60_000, minContributions: 1 }
                );
                const aggregated = contributions.map((c) => `[${c.sourceAgentId}]: ${typeof c.result === "string" ? c.result : JSON.stringify(c.result)}`).join("\n\n");
                return { ok: true, content: aggregated || "No contributions." };
              } catch (e) {
                return { ok: false, error: e instanceof Error ? e.message : String(e) };
              }
            },
          };
          const agentLoopTools: ToolDef[] = [...baseToolsForLoop, writeSlotToolLoop, delegateTool, broadcastSwarmTool];
          const agentStart = Date.now();
          const rollingContext =
            config.memory?.rollingLedger?.enabled && !session.sessionFlags?.privacy
              ? await getRollingContextForPrompt(workspace)
              : undefined;
          const { content, messages, citedMemoryIds } = await runAgentLoop({
            config: { ...config, workspace },
            userMessage: message,
            sessionMessages: session.messages,
            sessionId,
            sessionGoal: session.sessionGoal,
            sessionSummary: session.sessionSummary,
            rollingContext,
            sessionType: session.sessionType,
            teamId: event.teamId,
            sessionFlags: session.sessionFlags,
            sessionGrantedScopes: event.sessionGrantedScopes,
            blackboard: instance.blackboard,
            onText: onStream ? (chunk) => onStream(chunk) : undefined,
            roleFragmentOverride: blueprint.systemPrompt,
            toolsFilter: blueprint.toolsFilter,
            agentId: instance.instanceId,
            blueprintId: instance.blueprintId,
            toolsOverride: agentLoopTools,
            ...(blueprint.localMemory?.enabled && {
              localMemoryScope: {
                workspaceId: getAgentMemoryWorkspaceId(blueprint.id),
                retrieveLimit: blueprint.localMemory.retrieveLimit ?? 5,
                includeGlobal: blueprint.localMemory.includeGlobalRead === true,
              },
            }),
          });
          if (config.retrospective?.enabled) {
            void appendTelemetry(workspace, {
              ts: new Date().toISOString(),
              type: "agent_turn",
              sessionId,
              durationMs: Date.now() - agentStart,
              intentSource: "agent_route",
            });
          }
          if (config.memory?.enabled && messages.length >= 2 && !session.sessionFlags?.privacy) {
            const useLocalMemory = blueprint.localMemory?.enabled === true;
            const memoryWorkspaceId = useLocalMemory
              ? getAgentMemoryWorkspaceId(blueprint.id)
              : (config.memory.workspaceId ?? workspace);
            const store = createStore(workspace, memoryWorkspaceId);
            const { summary, factCount } = await flushToL1({
              config,
              sessionId,
              messages,
              store,
              workspaceId: memoryWorkspaceId,
              taskHint: extractTaskHint(message),
            });
            await writeSessionSummaryFile({ workspaceDir: workspace, sessionId, summary, factCount });
            if (config.memory?.rollingLedger?.enabled && summary) {
              void appendToTodayBuffer({ workspaceDir: workspace, sessionId, content: summary, source: "flushToL1" });
            }
            if (!useLocalMemory) {
              await promoteL1ToL2(store, {
                workspace_id: memoryWorkspaceId,
                created_after: new Date(Date.now() - 120_000).toISOString(),
                limit: 50,
              });
              if (typeof config.memory.coldAfterDays === "number" && config.memory.coldAfterDays > 0) {
                await archiveCold(workspace, config.memory.workspaceId, config.memory.coldAfterDays);
              }
            }
            await writePromptSuggestions({ config, workspaceDir: workspace, sessionId, summary });
          }
          setInstanceState(instance, "idle");
          const nextId = instance.blackboard["__nextAgentId"];
          return {
            correlationId,
            content,
            citedMemoryIds: citedMemoryIds?.length ? citedMemoryIds : undefined,
            messages,
            sessionGoal: session.sessionGoal,
            sessionSummary: session.sessionSummary,
            blackboard: { ...instance.blackboard },
            sourceAgentId: blueprint.id,
            ...(nextId ? { pipelineNextAgentId: nextId } : {}),
          };
        } finally {
          setInstanceState(instance, "idle");
        }
      }
    }
  }

  let intentSource: string = "none";
  let matched: { flowId: string; params: Record<string, string> } | null = null;

  if (config.flows?.enabled === true && config.flows.routes?.length && config.flows.libraryPath && flowLibrary) {

    if (config.vectorEmbedding?.enabled && config.vectorEmbedding.collections?.motivation?.enabled) {
      const motivationHits = await ragSearch(config, workspace, "motivation", message, 1);
      const threshold = config.vectorEmbedding.motivationThreshold ?? 0.75;
      const hit = motivationHits[0];
      const t = hit?.metadata?.translated as { state?: string; flowId?: string; params?: Record<string, unknown> } | undefined;
      const conf = (hit?.metadata?.confidence_default as number | undefined) ?? hit?.score ?? 0;
      if (hit && (hit.score >= threshold || conf >= threshold) && t?.state === "ROUTE_TO_LOCAL_FLOW" && t?.flowId && flowLibrary.has(t.flowId)) {
        const params = t.params ?? {};
        matched = {
          flowId: t.flowId,
          params: Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v ?? "")])),
        };
        intentSource = "motivation_rag";
      }
    }
    if (!matched) {
      matched = matchFlow(message, { routes: config.flows.routes!, flowLibrary, successRates });
      if (matched) intentSource = "rule";
    }
    if (!matched && isLocalIntentClassifierAvailable(config)) {
      const icResult = await callIntentClassifier(config, message, new Set(flowLibrary.keys()));
      if (icResult.ok && icResult.router.state === "ROUTE_TO_LOCAL_FLOW" && icResult.router.flowId) {
        const threshold = config.localModel!.modes!.intentClassifier!.confidenceThreshold ?? 0.7;
        if (icResult.router.confidence >= threshold && flowLibrary.has(icResult.router.flowId)) {
          const params = icResult.router.params ?? {};
          matched = {
            flowId: icResult.router.flowId,
            params: Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v ?? "")])),
          };
          intentSource = "intent_classifier";
        }
      }
    }

    if (!matched && shouldTryLLMGenerateFlow(config, message, false)) {
      const list = await listFlows(workspace, config.flows!.libraryPath!);
      const existingFlowIds = list.map((e) => e.flowId);
      const gen = await runLLMGenerateFlow({
        config,
        workspace,
        libraryPath: config.flows!.libraryPath!,
        userMessage: message,
        existingFlowIds,
      });
      if (gen.success) {
        const content = `已根据您的描述创建流程「${gen.flowId}」。建议在配置的 flows.routes 中添加：{ "hint": "${gen.hint}", "flowId": "${gen.flowId}" }，即可通过类似「${gen.hint}」触发该流程。`;
        const messages: { role: "user" | "assistant"; content: string }[] = [
          ...session.messages,
          { role: "user", content: message },
          { role: "assistant", content },
        ];
        return {
          correlationId,
          content,
          generatedFlowId: gen.flowId,
          suggestedRoute: { hint: gen.hint, flowId: gen.flowId },
          messages,
          sessionGoal: session.sessionGoal,
          sessionSummary: session.sessionSummary,
          blackboard: session.blackboard,
        };
      }
    }

    if (matched) {
      const flow = flowLibrary.get(matched.flowId);
      if (flow) {
        const flowStart = Date.now();
        const baseTools = await getMergedTools(config, workspace);
        const blackboard = session.blackboard;
        const writeSlotTool: ToolDef = {
          name: "write_slot",
          description: "Write a value to the session blackboard (slot). Used by flows to pass data to the agent.",
          inputSchema: {
            type: "object",
            properties: { key: { type: "string", description: "Slot name" }, value: { type: "string", description: "Slot value" } },
            required: ["key", "value"],
          },
          handler: async (args) => {
            const k = String(args.key ?? "");
            const v = String(args.value ?? "");
            if (k) blackboard[k] = v;
            return { ok: true, content: "OK" };
          },
        };
        const tools: ToolDef[] = [...baseTools, writeSlotTool];
        const result = await executeFlow({
          config,
          workspace,
          flowId: matched.flowId,
          flow,
          params: matched.params,
          tools,
          flowLibrary,
          blackboard,
          userMessage: message,
          sessionId,
          sessionGrantedScopes: event.sessionGrantedScopes,
          onLLMNode: async (opts) => {
            try {
              let contextSummary = opts.contextSummary ?? "";
              const extColl = (flow as { meta?: { externalCollections?: string[] } }).meta?.externalCollections;
              if (extColl?.length) {
                const rag = await getRagContextForFlow(config, workspace, extColl, opts.message ?? message, 3);
                if (rag) contextSummary = rag + "\n" + contextSummary;
              }
              const content = await singleTurnLLM(config, opts.message!, contextSummary);
              return { content, success: true };
            } catch (e) {
              return {
                content: e instanceof Error ? e.message : String(e),
                success: false,
              };
            }
          },
        });
        const content = result.content;
        const libPath = config.flows.libraryPath!;
        await appendOutcome(workspace, libPath, {
          flowId: matched.flowId,
          paramsSummary: JSON.stringify(matched.params).slice(0, 200),
          success: result.success,
          ts: new Date().toISOString(),
        });
        await updateFlowMetaAfterRun(workspace, libPath, matched.flowId, result.success);
        await performFailureReplacementAfterRun(workspace, libPath, matched.flowId, config);
        if (config.retrospective?.enabled) {
          void appendTelemetry(workspace, {
            ts: new Date().toISOString(),
            type: "flow_end",
            sessionId,
            flowId: matched.flowId,
            success: result.success,
            durationMs: Date.now() - flowStart,
            intentSource,
          });
        }
        let evolutionSuggestionFlow = false;
        if (config.evolution?.insertTree?.enabled && config.flows?.libraryPath) {
          const canSuggest = await canSuggestEvolution(config, workspace);
          if (canSuggest) {
            if (config.evolution.insertTree.requireUserConfirmation) {
              evolutionSuggestionFlow = true;
            } else if (config.evolution.insertTree.autoRun) {
              const ctx = await assembleEvolutionContextFromWorkspace(workspace, {
                sessionSummary: session.sessionSummary,
                config,
                libraryPath: config.flows.libraryPath,
                lastN: 30,
              });
              if (ctx.toolOps.length > 0) {
                void runEvolutionInsertTree({
                  config,
                  workspace,
                  libraryPath: config.flows.libraryPath,
                  context: ctx,
                  sessionId,
                });
              }
            }
          }
        }
        const messages: { role: "user" | "assistant"; content: string }[] = [
          ...session.messages,
          { role: "user", content: message },
          { role: "assistant", content },
        ];
        if (config.memory?.enabled && messages.length >= 2 && !session.sessionFlags?.privacy) {
          const store = createStore(workspace, config.memory.workspaceId);
          const { summary, factCount } = await flushToL1({
            config,
            sessionId,
            messages,
            store,
            workspaceId: config.memory.workspaceId ?? workspace,
            taskHint: extractTaskHint(message),
          });
          await writeSessionSummaryFile({ workspaceDir: workspace, sessionId, summary, factCount });
          if (config.memory?.rollingLedger?.enabled && summary) {
            void appendToTodayBuffer({ workspaceDir: workspace, sessionId, content: summary, source: "flushToL1" });
          }
          const workspaceId = config.memory.workspaceId ?? workspace;
          await promoteL1ToL2(store, {
            workspace_id: workspaceId,
            created_after: new Date(Date.now() - 120_000).toISOString(),
            limit: 50,
          });
          if (typeof config.memory.coldAfterDays === "number" && config.memory.coldAfterDays > 0) {
            await archiveCold(workspace, config.memory.workspaceId, config.memory.coldAfterDays);
          }
          if (config.security?.privacyIsolationRetentionDays != null && config.security.privacyIsolationRetentionDays > 0) {
            const { cleanupPrivacyIsolated } = await import("../memory/privacy-isolation.js");
            await cleanupPrivacyIsolated(workspace, config.security.privacyIsolationRetentionDays);
          }
          await writePromptSuggestions({ config, workspaceDir: workspace, sessionId, summary });
        } else if (
          config.memory?.enabled &&
          messages.length >= 2 &&
          session.sessionFlags?.privacy &&
          typeof config.security?.privacyIsolationRetentionDays === "number"
        ) {
          const store = createPrivacyIsolatedStore(workspace, sessionId);
          await flushToL1({
            config,
            sessionId,
            messages,
            store,
            workspaceId: config.memory.workspaceId ?? workspace,
            taskHint: extractTaskHint(message),
            skipAuditLog: true,
          });
        }
        const response: ChatResponseEvent = {
          correlationId,
          content,
          evolutionSuggestion: evolutionSuggestionFlow || undefined,
          messages,
          sessionGoal: session.sessionGoal,
          sessionSummary: session.sessionSummary,
          blackboard: { ...blackboard },
        };
        return response;
      }
    }
  }

  // Phase 16 WO-1604/1644/1605: 探索层接入点；回写用 explorationRecordId；Event Bus 形态下 event.meta.fromPlanReady 表示已由探索层处理
  let messageForAgent = message;
  let explorationRecordIdForOutcome: string | undefined;
  const meta = event.meta as { explorationOptOut?: boolean; fromPlanReady?: boolean; fromExploration?: boolean; explorationRecordId?: string } | undefined;
  if (meta?.fromPlanReady === true) {
    messageForAgent = event.message;
    explorationRecordIdForOutcome = meta.explorationRecordId;
  } else if (
    config.exploration?.enabled &&
    !shouldSkipExploration(config, matched ?? null, meta) &&
    await shouldEnterExploration(config, message, { workspace })
  ) {
    const explorationResult = await tryExploration({
      config,
      message,
      correlationId,
      workspace,
      sessionId,
      matched: matched ?? null,
      session,
      flowLibrary: flowLibrary ?? undefined,
    });
    if (explorationResult.useExploration && "compiledMessage" in explorationResult) {
      messageForAgent = explorationResult.compiledMessage;
      explorationRecordIdForOutcome = explorationResult.explorationRecordId;
    } else if (explorationResult.useExploration && "fallbackContent" in explorationResult) {
      const fallbackContent = explorationResult.fallbackContent;
      // WO-1623 可选：写入黑板并发布 skill.request
      if (session.blackboard) {
        session.blackboard["__exploration_skill_request"] = fallbackContent;
      }
      if (config.eventBus?.enabled) {
        publish(TOPIC_SKILL_REQUEST, {
          correlationId,
          content: fallbackContent,
          message,
          sessionId,
          ts: new Date().toISOString(),
        });
      }
      const messages: { role: "user" | "assistant"; content: string }[] = [
        ...session.messages,
        { role: "user", content: message },
        { role: "assistant", content: fallbackContent },
      ];
      return {
        correlationId,
        content: fallbackContent,
        messages,
        sessionGoal: session.sessionGoal,
        sessionSummary: session.sessionSummary,
        blackboard: session.blackboard,
      };
    }
  }

  if (!isLlmReady(config)) {
    const noRouteMsg =
      "未匹配到任何流程，且当前未配置可用的大模型（主 LLM），无法进行开放域对话。请配置 config.llm，或添加 flows.routes / 动机 RAG / 本地意图分类以匹配流程。";
    return {
      correlationId,
      content: noRouteMsg,
      messages: [...session.messages, { role: "user", content: message }, { role: "assistant", content: noRouteMsg }],
      sessionGoal: session.sessionGoal,
      sessionSummary: session.sessionSummary,
      blackboard: session.blackboard,
    };
  }

  const agentStart = Date.now();
  let content: string;
  let messages: { role: "user" | "assistant"; content: string }[];
  let citedMemoryIds: string[] | undefined;
  const rollingContext =
    config.memory?.rollingLedger?.enabled && !session.sessionFlags?.privacy
      ? await getRollingContextForPrompt(workspace)
      : undefined;
  try {
    const loopResult = await runAgentLoop({
      config: { ...config, workspace },
      userMessage: messageForAgent,
      sessionMessages: session.messages,
      sessionId,
      sessionGoal: session.sessionGoal,
      sessionSummary: session.sessionSummary,
      rollingContext,
      sessionType: session.sessionType,
      teamId: event.teamId,
      sessionFlags: session.sessionFlags,
      sessionGrantedScopes: event.sessionGrantedScopes,
      blackboard: session.blackboard,
      onText: onStream ? (chunk) => onStream(chunk) : undefined,
    });

    if (
      explorationRecordIdForOutcome &&
      config.exploration?.experience?.storeOutcome
    ) {
      await updateExplorationOutcome(workspace, explorationRecordIdForOutcome, {
        success: true,
      });
      if (config.retrospective?.enabled) {
        void appendTelemetry(workspace, {
          ts: new Date().toISOString(),
          type: "exploration_outcome",
          sessionId,
          success: true,
          payload: {
            correlationId,
            explorationRecordId: explorationRecordIdForOutcome,
            success: true,
          },
        });
      }
    }

    content = loopResult.content;
    messages = loopResult.messages;
    citedMemoryIds = loopResult.citedMemoryIds;
  } catch (e) {
    if (
      explorationRecordIdForOutcome &&
      config.exploration?.experience?.storeOutcome
    ) {
      await updateExplorationOutcome(workspace, explorationRecordIdForOutcome, {
        success: false,
      });
      if (config.retrospective?.enabled) {
        void appendTelemetry(workspace, {
          ts: new Date().toISOString(),
          type: "exploration_outcome",
          sessionId,
          success: false,
          payload: {
            correlationId,
            explorationRecordId: explorationRecordIdForOutcome,
            success: false,
          },
        });
      }
    }
    throw e;
  }

  if (config.retrospective?.enabled) {
    void appendTelemetry(workspace, {
      ts: new Date().toISOString(),
      type: "agent_turn",
      sessionId,
      durationMs: Date.now() - agentStart,
      intentSource: "none",
    });
  }

  if (config.memory?.enabled && messages.length >= 2 && !session.sessionFlags?.privacy) {
    const store = createStore(workspace, config.memory.workspaceId);
    const { summary, factCount } = await flushToL1({
      config,
      sessionId,
      messages,
      store,
      workspaceId: config.memory.workspaceId ?? workspace,
      taskHint: extractTaskHint(message),
    });
    await writeSessionSummaryFile({ workspaceDir: workspace, sessionId, summary, factCount });
    if (config.memory?.rollingLedger?.enabled && summary) {
      void appendToTodayBuffer({ workspaceDir: workspace, sessionId, content: summary, source: "flushToL1" });
    }
    const workspaceId = config.memory.workspaceId ?? workspace;
    await promoteL1ToL2(store, {
      workspace_id: workspaceId,
      created_after: new Date(Date.now() - 120_000).toISOString(),
      limit: 50,
    });
    if (typeof config.memory.coldAfterDays === "number" && config.memory.coldAfterDays > 0) {
      await archiveCold(workspace, config.memory.workspaceId, config.memory.coldAfterDays);
    }
    if (config.security?.privacyIsolationRetentionDays != null && config.security.privacyIsolationRetentionDays > 0) {
      const { cleanupPrivacyIsolated } = await import("../memory/privacy-isolation.js");
      await cleanupPrivacyIsolated(workspace, config.security.privacyIsolationRetentionDays);
    }
    await writePromptSuggestions({ config, workspaceDir: workspace, sessionId, summary });
  } else if (
    config.memory?.enabled &&
    messages.length >= 2 &&
    session.sessionFlags?.privacy &&
    typeof config.security?.privacyIsolationRetentionDays === "number"
  ) {
    const store = createPrivacyIsolatedStore(workspace, sessionId);
    await flushToL1({
      config,
      sessionId,
      messages,
      store,
      workspaceId: config.memory.workspaceId ?? workspace,
      taskHint: extractTaskHint(message),
      skipAuditLog: true,
    });
  }

  let evolutionSuggestionAgent = false;
  if (config.evolution?.insertTree?.enabled && config.flows?.libraryPath) {
    const canSuggest = await canSuggestEvolution(config, workspace);
    if (canSuggest) {
      if (config.evolution.insertTree.requireUserConfirmation) {
        evolutionSuggestionAgent = true;
      } else if (config.evolution.insertTree.autoRun) {
        const ctx = await assembleEvolutionContextFromWorkspace(workspace, {
          sessionSummary: session.sessionSummary,
          config,
          libraryPath: config.flows.libraryPath,
          lastN: 30,
        });
        if (ctx.toolOps.length > 0) {
          void runEvolutionInsertTree({
            config,
            workspace,
            libraryPath: config.flows.libraryPath,
            context: ctx,
            sessionId,
          });
        }
      }
    }
  }

  return {
    correlationId,
    content,
    citedMemoryIds: citedMemoryIds && citedMemoryIds.length > 0 ? citedMemoryIds : undefined,
    evolutionSuggestion: evolutionSuggestionAgent || undefined,
    messages,
    sessionGoal: session.sessionGoal,
    sessionSummary: session.sessionSummary,
    blackboard: session.blackboard,
  };
}

/**
 * Phase 14C WO-1463: 流水线续跑 — 用指定 Agent 处理 stage 的 output，返回 response（供协作 runner 发布 stage_done 或 chat.response）。
 */
export async function runAgentWithInput(
  config: RzeclawConfig,
  params: {
    agentId: string;
    message: string;
    blackboard?: Record<string, string>;
    correlationId: string;
    pipelineId: string;
    sessionId?: string;
  },
  onStream?: (chunk: string) => void
): Promise<ChatResponseEvent> {
  const workspace = path.resolve(config.workspace);
  const sessionId = params.sessionId ?? params.pipelineId;
  const instance = getOrCreateInstance(config, params.agentId, sessionId);
  const blueprint = getAgentBlueprint(config, params.agentId);
  if (!instance || !blueprint) {
    return {
      correlationId: params.correlationId,
      error: `Agent not found: ${params.agentId}`,
      messages: [],
      blackboard: params.blackboard ?? {},
    };
  }
  const session: SessionState = {
    messages: [{ role: "user", content: params.message }],
    sessionGoal: params.message.slice(0, 200),
    blackboard: params.blackboard ?? {},
  };
  setInstanceState(instance, "executing");
  try {
    const flowLibrary = config.flows?.libraryPath
      ? await getFlowLibrary(workspace, config.flows.libraryPath)
      : null;
    let baseTools = await getMergedTools(config, workspace);
    if (blueprint.toolsFilter?.length) {
      const set = new Set(blueprint.toolsFilter);
      baseTools = baseTools.filter((t) => set.has(t.name));
    }
    const writeSlotTool: ToolDef = {
      name: "write_slot",
      description: "Write a value to the session blackboard (slot).",
      inputSchema: {
        type: "object",
        properties: { key: { type: "string" }, value: { type: "string" } },
        required: ["key", "value"],
      },
      handler: async (args) => {
        const k = String(args.key ?? "");
        const v = String(args.value ?? "");
        if (k) instance.blackboard[k] = v;
        return { ok: true, content: "OK" };
      },
    };
    const rollingContext =
      config.memory?.rollingLedger?.enabled && !session.sessionFlags?.privacy
        ? await getRollingContextForPrompt(workspace)
        : undefined;
    const { content, messages, citedMemoryIds } = await runAgentLoop({
      config: { ...config, workspace },
      userMessage: params.message,
      sessionMessages: session.messages,
      sessionId,
      sessionGoal: session.sessionGoal,
      sessionSummary: session.sessionSummary,
      rollingContext,
      sessionType: session.sessionType,
      sessionFlags: session.sessionFlags,
      blackboard: instance.blackboard,
      onText: onStream,
      roleFragmentOverride: blueprint.systemPrompt,
      toolsFilter: blueprint.toolsFilter,
      agentId: instance.instanceId,
      blueprintId: instance.blueprintId,
      ...(blueprint.localMemory?.enabled && {
        localMemoryScope: {
          workspaceId: getAgentMemoryWorkspaceId(blueprint.id),
          retrieveLimit: blueprint.localMemory.retrieveLimit ?? 5,
          includeGlobal: blueprint.localMemory.includeGlobalRead === true,
        },
      }),
    });
    if (config.memory?.enabled && messages.length >= 2) {
      const useLocalMemory = blueprint.localMemory?.enabled === true;
      const memoryWorkspaceId = useLocalMemory
        ? getAgentMemoryWorkspaceId(blueprint.id)
        : (config.memory.workspaceId ?? workspace);
      const store = createStore(workspace, memoryWorkspaceId);
      await flushToL1({
        config,
        sessionId,
        messages,
        store,
        workspaceId: memoryWorkspaceId,
        taskHint: extractTaskHint(params.message),
      });
      if (!useLocalMemory) {
        await promoteL1ToL2(store, {
          workspace_id: memoryWorkspaceId,
          created_after: new Date(Date.now() - 120_000).toISOString(),
          limit: 50,
        });
      }
    }
    const nextId = instance.blackboard["__nextAgentId"];
    return {
      correlationId: params.correlationId,
      content,
      citedMemoryIds: citedMemoryIds?.length ? citedMemoryIds : undefined,
      messages,
      sessionGoal: session.sessionGoal,
      sessionSummary: session.sessionSummary,
      blackboard: { ...instance.blackboard },
      sourceAgentId: blueprint.id,
      ...(nextId ? { pipelineNextAgentId: nextId } : {}),
    };
  } finally {
    setInstanceState(instance, "idle");
  }
}

/**
 * Phase 16 WO-1605/1634: Event Bus 形态 — 探索层单独订阅 chat.request 时调用。
 * 执行 Gatekeeper + tryExploration，返回应发布的 chat.response（fallback）或 task.plan_ready（透传/编译）。
 */
export async function runExplorationLayerForEventBus(
  config: RzeclawConfig,
  event: ChatRequestEvent
): Promise<
  | { action: "response"; response: ChatResponseEvent }
  | { action: "plan_ready"; event: ChatRequestEvent }
> {
  const workspace = path.resolve(event.workspace || config.workspace);
  const message = event.message;
  const sessionId = event.sessionId ?? "main";
  const correlationId = event.correlationId;
  const meta = event.meta as { explorationOptOut?: boolean } | undefined;

  const session = await buildSessionFromEvent(event, workspace);
  let flowLibrary: Map<string, import("../flows/types.js").FlowDef> | null = null;
  let successRates: Map<string, import("../flows/outcomes.js").FlowSuccessRate> | undefined;
  let matched: { flowId: string; params: Record<string, string> } | null = null;
  if (config.flows?.libraryPath) {
    flowLibrary = await getFlowLibrary(workspace, config.flows.libraryPath);
    successRates = await getFlowSuccessRates(workspace, config.flows.libraryPath);
  }
  if (config.flows?.routes?.length && flowLibrary) {
    matched = matchFlow(message, {
      routes: config.flows.routes,
      flowLibrary,
      successRates,
    });
  }

  if (shouldSkipExploration(config, matched, meta)) {
    return {
      action: "plan_ready",
      event: { ...event, meta: { ...event.meta, fromPlanReady: true } },
    };
  }
  if (!(await shouldEnterExploration(config, message, { workspace }))) {
    return {
      action: "plan_ready",
      event: { ...event, meta: { ...event.meta, fromPlanReady: true } },
    };
  }

  const explorationResult = await tryExploration({
    config,
    message,
    correlationId,
    workspace,
    sessionId,
    matched,
    session,
    flowLibrary: flowLibrary ?? undefined,
  });

  if (explorationResult.useExploration && "fallbackContent" in explorationResult) {
    const fallbackContent = explorationResult.fallbackContent;
    if (session.blackboard) {
      session.blackboard["__exploration_skill_request"] = fallbackContent;
    }
    if (config.eventBus?.enabled) {
      publish(TOPIC_SKILL_REQUEST, {
        correlationId,
        content: fallbackContent,
        message,
        sessionId,
        ts: new Date().toISOString(),
      });
    }
    const messages: { role: "user" | "assistant"; content: string }[] = [
      ...session.messages,
      { role: "user", content: message },
      { role: "assistant", content: fallbackContent },
    ];
    return {
      action: "response",
      response: {
        correlationId,
        content: fallbackContent,
        messages,
        sessionGoal: session.sessionGoal,
        sessionSummary: session.sessionSummary,
        blackboard: session.blackboard,
      },
    };
  }

  if (explorationResult.useExploration && "compiledMessage" in explorationResult) {
    return {
      action: "plan_ready",
      event: {
        ...event,
        message: explorationResult.compiledMessage,
        meta: {
          ...event.meta,
          fromPlanReady: true,
          fromExploration: true,
          explorationRecordId: explorationResult.explorationRecordId,
        },
      },
    };
  }

  return {
    action: "plan_ready",
    event: { ...event, meta: { ...event.meta, fromPlanReady: true } },
  };
}
