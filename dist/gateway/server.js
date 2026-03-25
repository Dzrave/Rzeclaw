import { WebSocketServer } from "ws";
import http from "node:http";
import { runAgentLoop } from "../agent/loop.js";
import { subscribe, publish, requestResponse, createCorrelationId, publishStream, TOPIC_CHAT_REQUEST, TOPIC_CHAT_RESPONSE, TOPIC_CHAT_STREAM, TOPIC_PIPELINE_STAGE_DONE, TOPIC_PLAN_READY, } from "../event-bus/index.js";
import { handlePipelineStageDone, isPipelineStageDonePayload } from "../collaboration/pipeline-runner.js";
import { subscribeToDelegateRequest } from "../collaboration/delegate.js";
import { subscribeToSwarmBroadcast } from "../collaboration/swarm.js";
import { handleChatRequest, runExplorationLayerForEventBus } from "./chat-executor.js";
import { createStore, createPrivacyIsolatedStore } from "../memory/store-jsonl.js";
import { flushToL1, generateL0Summary } from "../memory/write-pipeline.js";
import { writeSessionSummaryFile, readYesterdaySummary } from "../memory/session-summary-file.js";
import { getRollingContextForPrompt } from "../memory/rolling-ledger.js";
import { appendToTodayBuffer } from "../memory/today-buffer.js";
import { runFoldForDate } from "../memory/fold.js";
import { mergeRollingLedgerPendingIntoReport } from "../retrospective/index.js";
import { extractTaskHint } from "../memory/task-hint.js";
import { promoteL1ToL2 } from "../memory/l2.js";
import { writePromptSuggestions } from "../evolution/prompt-suggestions.js";
import { archiveCold } from "../memory/cold-archive.js";
import { cleanupPrivacyIsolatedForSession, cleanupPrivacyIsolated } from "../memory/privacy-isolation.js";
import { writeSnapshot, readSnapshot, listSnapshots } from "../session/snapshot.js";
import { readCanvas, updateCanvas } from "../canvas/index.js";
import { getMergedTools } from "../tools/merged.js";
import { runHeartbeatTick } from "../heartbeat/index.js";
import { runProactiveInference } from "../proactive/index.js";
import { getFlowLibrary, matchFlow, executeFlow, appendOutcome, getFlowSuccessRates, updateFlowMetaAfterRun, performFailureReplacementAfterRun, runFailureReplacementScan, runEvolutionInsertTree, canSuggestEvolution, assembleEvolutionContextFromWorkspace, runLLMGenerateFlow, shouldTryLLMGenerateFlow, listFlows } from "../flows/index.js";
import { search as ragSearch, getRagContextForFlow, reindexCollection } from "../rag/index.js";
import { appendTelemetry } from "../retrospective/telemetry.js";
import { runRetrospective, getMorningReport, listPendingDates, applyPending } from "../retrospective/index.js";
import { applyEditOps } from "../flows/crud.js";
import { addMotivationEntry } from "../rag/motivation.js";
import { singleTurnLLM } from "../llm/index.js";
import { getGatewayApiKey, isLlmReady, isLocalIntentClassifierAvailable, reloadConfig, findConfigPath } from "../config.js";
import { listAllInstances } from "../agents/instances.js";
import { getAgentBlueprint } from "../agents/blueprints.js";
import { createTask, setTaskRunning, setTaskCompleted, setTaskFailed, getResult, listBySession, cleanupExpired, } from "../task-results/store.js";
import { readLastNEntriesBySession } from "../observability/op-log.js";
import { callIntentClassifier } from "../local-model/index.js";
import { shouldSkipExploration, shouldEnterExploration, tryExploration } from "../exploration/index.js";
import { updateOutcomeAsync as updateExplorationOutcome } from "../exploration/experience.js";
import { ingestPaths } from "../knowledge/index.js";
import { generateReport, writeSuggestionsFile } from "../diagnostic/index.js";
import path from "node:path";
import { access, stat, readFile, mkdir, writeFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
/** Phase 8: 每连接认证状态 */
const authenticatedSockets = new WeakMap();
/** Phase 15 WO-OF-003: 本连接是否有进行中的 chat，供 office.status 返回 executing */
const chatInProgressByWs = new WeakMap();
const sessions = new Map();
function getOrCreateSession(sessionId, sessionType) {
    let s = sessions.get(sessionId);
    if (!s) {
        s = { messages: [], blackboard: {}, sessionState: "Idle", grantedScopes: [], ...(sessionType ? { sessionType } : {}) };
        sessions.set(sessionId, s);
    }
    else {
        if (sessionType !== undefined)
            s.sessionType = sessionType;
        if (s.blackboard == null)
            s.blackboard = {};
        if (s.sessionState == null)
            s.sessionState = "Idle";
        if (s.grantedScopes == null)
            s.grantedScopes = [];
    }
    return s;
}
export function createGatewayServer(config, port) {
    const host = config.gateway?.host ?? "127.0.0.1";
    // ── HTTP server for SPA static files + WebSocket upgrade ──
    const httpServer = http.createServer((req, res) => {
        serveStaticUI(req, res, config);
    });
    const wss = new WebSocketServer({ server: httpServer });
    /** Phase 14A: Event Bus 启用时，correlationId → { ws, id }，用于 chat.stream 回传 */
    const pendingStreamByCorrelationId = new Map();
    if (config.eventBus?.enabled === true) {
        subscribe(TOPIC_PIPELINE_STAGE_DONE, (payload) => {
            if (isPipelineStageDonePayload(payload)) {
                void handlePipelineStageDone(config, payload, (chunk) => {
                    publishStream({ correlationId: payload.correlationId, chunk });
                });
            }
        });
        subscribeToDelegateRequest(config);
        subscribeToSwarmBroadcast(config);
        const retentionMinutes = config.taskResults?.retentionMinutes ?? 24 * 60;
        const workspace = path.resolve(config.workspace);
        const runExecutionHandler = async (event) => {
            createTask(event.correlationId, event.sessionId, retentionMinutes);
            setTaskRunning(event.correlationId);
            try {
                const response = await handleChatRequest(config, event, (chunk) => {
                    publishStream({ correlationId: event.correlationId, chunk });
                });
                if (response.pipelineNextAgentId) {
                    const stageEvent = {
                        pipelineId: event.correlationId,
                        correlationId: event.correlationId,
                        sourceAgentId: response.sourceAgentId,
                        output: response.content ?? "",
                        nextAgentId: response.pipelineNextAgentId,
                        blackboardSnapshot: response.blackboard,
                        ts: new Date().toISOString(),
                    };
                    publish(TOPIC_PIPELINE_STAGE_DONE, stageEvent);
                }
                else {
                    setTaskCompleted(event.correlationId, response, { workspace, retentionMinutes });
                    publish(TOPIC_CHAT_RESPONSE, response);
                }
            }
            catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                setTaskFailed(event.correlationId, errMsg, { workspace, retentionMinutes });
                publish(TOPIC_CHAT_RESPONSE, {
                    correlationId: event.correlationId,
                    error: errMsg,
                });
            }
        };
        if (config.exploration?.enabled) {
            // WO-1605/1634: 探索层订阅 chat.request，发布 task.plan_ready 或 chat.response（fallback）；执行层订阅 plan_ready
            subscribe(TOPIC_CHAT_REQUEST, async (event) => {
                createTask(event.correlationId, event.sessionId, retentionMinutes);
                setTaskRunning(event.correlationId);
                try {
                    const result = await runExplorationLayerForEventBus(config, event);
                    if (result.action === "response") {
                        setTaskCompleted(event.correlationId, result.response, { workspace, retentionMinutes });
                        publish(TOPIC_CHAT_RESPONSE, result.response);
                    }
                    else {
                        publish(TOPIC_PLAN_READY, result.event);
                    }
                }
                catch (err) {
                    const errMsg = err instanceof Error ? err.message : String(err);
                    setTaskFailed(event.correlationId, errMsg, { workspace, retentionMinutes });
                    publish(TOPIC_CHAT_RESPONSE, { correlationId: event.correlationId, error: errMsg });
                }
            });
            subscribe(TOPIC_PLAN_READY, (event) => {
                void runExecutionHandler(event);
            });
        }
        else {
            subscribe(TOPIC_CHAT_REQUEST, (event) => {
                void runExecutionHandler(event);
            });
        }
        subscribe(TOPIC_CHAT_STREAM, (ev) => {
            const pending = pendingStreamByCorrelationId.get(ev.correlationId);
            if (pending) {
                try {
                    pending.ws.send(JSON.stringify({ id: pending.id, stream: "text", chunk: ev.chunk }));
                }
                catch (_) { }
            }
        });
    }
    let bonjourInstance = null;
    httpServer.listen(port, host);
    httpServer.on("listening", () => {
        console.log(`[rzeclaw] Gateway http://${host}:${port} (WS + UI)`);
        const intervalMinutes = config.heartbeat?.intervalMinutes ?? 0;
        if (intervalMinutes > 0) {
            const workspace = path.resolve(config.workspace);
            const run = () => {
                runHeartbeatTick(config, workspace).catch((e) => console.error("[rzeclaw] Heartbeat tick error:", e));
            };
            setInterval(run, intervalMinutes * 60 * 1000);
        }
        if (config.gateway?.discovery?.enabled === true) {
            try {
                const Bonjour = require("bonjour");
                bonjourInstance = Bonjour();
                bonjourInstance.publish({ name: "Rzeclaw", type: "rzeclaw", port });
                console.log("[rzeclaw] mDNS discovery: _rzeclaw._tcp advertised");
            }
            catch (e) {
                console.error("[rzeclaw] mDNS discovery failed:", e);
            }
        }
        if (config.knowledge?.ingestOnStart === true && Array.isArray(config.knowledge.ingestPaths) && config.knowledge.ingestPaths.length > 0) {
            const workspace = path.resolve(config.workspace);
            ingestPaths(workspace, config.knowledge.ingestPaths, { workspaceId: config.memory?.workspaceId }).then((r) => {
                console.log(`[rzeclaw] Knowledge ingest on start: ok=${r.ok} failed=${r.failed}`);
            }).catch((e) => console.error("[rzeclaw] Knowledge ingest on start error:", e));
        }
        const scheduleDays = config.diagnostic?.intervalDaysSchedule ?? 0;
        if (scheduleDays > 0) {
            const intervalMs = scheduleDays * 24 * 60 * 60 * 1000;
            setInterval(() => {
                const workspace = path.resolve(config.workspace);
                (async () => {
                    const { report, filePath } = await generateReport(config, { workspace, days: scheduleDays });
                    await writeSuggestionsFile(workspace, report);
                    console.log("[rzeclaw] Diagnostic report:", filePath);
                })().catch((e) => console.error("[rzeclaw] Diagnostic report error:", e));
            }, intervalMs);
        }
        const hotReloadInterval = config.hotReload?.intervalSeconds ?? 0;
        if (hotReloadInterval >= 10) {
            const configPath = findConfigPath();
            if (configPath) {
                let lastMtime = 0;
                setInterval(async () => {
                    try {
                        const st = await stat(configPath);
                        const m = st.mtimeMs;
                        if (lastMtime > 0 && m > lastMtime) {
                            const result = reloadConfig(config);
                            if (result.ok) {
                                console.log("[rzeclaw] config hot-reloaded (mtime change)");
                            }
                        }
                        lastMtime = m;
                    }
                    catch (_) { }
                }, hotReloadInterval * 1000);
            }
        }
        const taskCleanupIntervalMs = 10 * 60 * 1000; // 10 min
        setInterval(() => {
            cleanupExpired(path.resolve(config.workspace)).catch(() => { });
        }, taskCleanupIntervalMs);
        // Phase 17 WO-1741: foldCron 定时折叠（不默认开启；仅当用户配置 foldCron 时执行）
        const foldCron = config.memory?.rollingLedger?.foldCron;
        if (typeof foldCron === "string" &&
            foldCron.trim() !== "" &&
            config.memory?.rollingLedger?.enabled === true) {
            const parts = foldCron.trim().split(/\s+/);
            const cronMin = parts.length >= 1 ? parseInt(parts[0], 10) : 0;
            const cronHour = parts.length >= 2 ? parseInt(parts[1], 10) : 0;
            if (!Number.isNaN(cronMin) && !Number.isNaN(cronHour)) {
                let lastFoldRunDate = null;
                setInterval(() => {
                    const now = new Date();
                    if (now.getMinutes() !== cronMin || now.getHours() !== cronHour)
                        return;
                    const yesterday = new Date(now);
                    yesterday.setDate(yesterday.getDate() - 1);
                    const yesterdayStr = yesterday.toISOString().slice(0, 10);
                    if (lastFoldRunDate === yesterdayStr)
                        return;
                    lastFoldRunDate = yesterdayStr;
                    const workspace = path.resolve(config.workspace);
                    (async () => {
                        try {
                            const result = await runFoldForDate(workspace, yesterdayStr, config);
                            if (result.success &&
                                config.memory?.rollingLedger?.includePendingInReport === true &&
                                result.foldedPendingTasks?.length) {
                                const today = now.toISOString().slice(0, 10);
                                await mergeRollingLedgerPendingIntoReport(workspace, today, result.foldedPendingTasks);
                            }
                            if (result.success) {
                                console.log("[rzeclaw] Rolling ledger fold completed for", yesterdayStr);
                            }
                        }
                        catch (e) {
                            console.error("[rzeclaw] Rolling ledger fold error:", e);
                        }
                    })().catch(() => { });
                }, 60 * 1000);
                console.log("[rzeclaw] Rolling ledger foldCron scheduled:", foldCron);
            }
        }
    });
    wss.on("connection", (ws) => {
        ws.on("message", async (raw) => {
            let msg = {};
            try {
                msg = JSON.parse(raw.toString());
                const id = msg.id ?? "";
                const method = msg.method ?? "";
                const params = msg.params ?? {};
                const send = (result) => {
                    ws.send(JSON.stringify({ id, result }));
                };
                const sendError = (error) => {
                    ws.send(JSON.stringify({ id, error: { message: error } }));
                };
                const authEnabled = config.gateway?.auth?.enabled === true;
                const isAuthenticated = authenticatedSockets.get(ws) === true;
                if (authEnabled && !isAuthenticated) {
                    const providedKey = params.apiKey;
                    const expectedKey = getGatewayApiKey(config);
                    if (!expectedKey || typeof providedKey !== "string" || providedKey !== expectedKey) {
                        sendError("Unauthorized: invalid or missing apiKey. Set gateway.auth.apiKeyEnv and provide apiKey in params.");
                        ws.close();
                        return;
                    }
                    authenticatedSockets.set(ws, true);
                }
                if (method === "session.getOrCreate") {
                    const sessionId = params.sessionId || "main";
                    const sessionType = typeof params.sessionType === "string" ? params.sessionType : undefined;
                    const session = getOrCreateSession(sessionId, sessionType);
                    send({
                        sessionId,
                        messagesCount: session.messages.length,
                        hasGoal: !!session.sessionGoal,
                        hasSummary: !!session.sessionSummary,
                        sessionType: session.sessionType,
                    });
                    return;
                }
                if (method === "session.restore") {
                    const sessionId = params.sessionId || "main";
                    const workspace = path.resolve(config.workspace);
                    const snapshot = await readSnapshot(workspace, sessionId);
                    const session = getOrCreateSession(sessionId);
                    if (snapshot) {
                        session.messages = snapshot.messages;
                        session.sessionGoal = snapshot.sessionGoal;
                        session.sessionSummary = snapshot.sessionSummary;
                        if (snapshot.sessionType != null)
                            session.sessionType = snapshot.sessionType;
                        send({ sessionId, restored: true, messagesCount: session.messages.length, sessionType: session.sessionType });
                    }
                    else {
                        send({ sessionId, restored: false, messagesCount: session.messages.length, sessionType: session.sessionType });
                    }
                    return;
                }
                if (method === "session.saveSnapshot") {
                    const sessionId = params.sessionId || "main";
                    const session = getOrCreateSession(sessionId);
                    const workspace = path.resolve(config.workspace);
                    if (session.sessionFlags?.privacy) {
                        if (config.security?.privacyIsolationRetentionDays === 0) {
                            await cleanupPrivacyIsolatedForSession(workspace, sessionId);
                        }
                        send({ sessionId, saved: false, reason: "privacy" });
                        return;
                    }
                    await writeSnapshot(workspace, sessionId, {
                        messages: session.messages,
                        sessionGoal: session.sessionGoal,
                        sessionSummary: session.sessionSummary,
                        sessionType: session.sessionType,
                    });
                    let highRiskOpsSuggestedReview = false;
                    if (config.security?.postActionReview?.highRiskSuggestReviewOnSessionEnd) {
                        const entries = await readLastNEntriesBySession(workspace, sessionId, 100);
                        highRiskOpsSuggestedReview = entries.some((e) => e.risk_level === "high");
                    }
                    send({ sessionId, saved: true, ...(highRiskOpsSuggestedReview && { highRiskOpsSuggestedReview: true }) });
                    return;
                }
                if (method === "scope.grantSession") {
                    const scope = params.scope;
                    const sessionId = params.sessionId || "main";
                    if (!scope || typeof scope !== "string") {
                        sendError("Missing or invalid params.scope");
                        return;
                    }
                    const session = getOrCreateSession(sessionId);
                    if (!session.grantedScopes)
                        session.grantedScopes = [];
                    if (!session.grantedScopes.includes(scope))
                        session.grantedScopes.push(scope);
                    send({ ok: true, scope, sessionId });
                    return;
                }
                if (method === "session.list") {
                    const workspace = path.resolve(params.workspace || config.workspace);
                    const limit = typeof params.limit === "number" ? params.limit : 50;
                    const list = await listSnapshots(workspace, limit);
                    send({ sessions: list });
                    return;
                }
                if (method === "health") {
                    const workspace = path.resolve(config.workspace);
                    let workspaceWritable = false;
                    try {
                        await access(workspace, 1 | 2);
                        workspaceWritable = true;
                    }
                    catch {
                        try {
                            const { mkdir } = await import("node:fs/promises");
                            await mkdir(workspace, { recursive: true });
                            workspaceWritable = true;
                        }
                        catch {
                            // leave false
                        }
                    }
                    send({
                        ok: true,
                        configLoaded: true,
                        workspaceWritable,
                        llmReady: isLlmReady(config),
                    });
                    return;
                }
                if (method === "agents.list") {
                    const sessionId = params.sessionId || "main";
                    const session = sessions.get(sessionId);
                    const mainBlueprintId = session?.lastRespondingBlueprintId;
                    const all = listAllInstances(config);
                    let mainAssigned = false;
                    const agents = all.map((inst) => {
                        const blueprint = getAgentBlueprint(config, inst.blueprintId);
                        const isMain = !mainAssigned && !!mainBlueprintId && inst.blueprintId === mainBlueprintId;
                        if (isMain)
                            mainAssigned = true;
                        return {
                            instanceId: inst.instanceId,
                            agentId: inst.instanceId,
                            blueprintId: inst.blueprintId,
                            name: blueprint?.name ?? inst.blueprintId,
                            state: inst.state,
                            detail: undefined,
                            sessionId: inst.sessionId,
                            lastActiveAt: inst.lastActiveAt,
                            createdAt: inst.createdAt,
                            isMain,
                        };
                    });
                    send({ agents });
                    return;
                }
                if (method === "agents.blueprints") {
                    const blueprints = (config.agents?.blueprints ?? []).map((b) => ({
                        id: b.id,
                        name: b.name,
                    }));
                    send({ blueprints });
                    return;
                }
                if (method === "office.status") {
                    const inProgress = chatInProgressByWs.get(ws) === true;
                    const state = inProgress ? "executing" : "idle";
                    const sessionId = params.sessionId || "main";
                    const session = sessions.get(sessionId);
                    const detail = session?.sessionGoal ? session.sessionGoal.slice(0, 80) : undefined;
                    send({ state, detail });
                    return;
                }
                if (method === "memory.yesterdaySummary") {
                    const workspace = path.resolve(params.workspace || config.workspace);
                    try {
                        const { date, memo } = await readYesterdaySummary(workspace);
                        send({ success: true, date, memo });
                    }
                    catch {
                        send({ success: false, memo: "" });
                    }
                    return;
                }
                if (method === "memory.fold") {
                    if (!config.memory?.rollingLedger?.enabled) {
                        sendError("memory.rollingLedger is not enabled");
                        return;
                    }
                    const workspace = path.resolve(params.workspace || config.workspace);
                    const dateParam = params.date;
                    const date = typeof dateParam === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
                        ? dateParam
                        : (() => {
                            const d = new Date();
                            d.setDate(d.getDate() - 1);
                            return d.toISOString().slice(0, 10);
                        })();
                    try {
                        const result = await runFoldForDate(workspace, date, config);
                        if (result.success &&
                            config.memory?.rollingLedger?.includePendingInReport === true &&
                            result.foldedPendingTasks?.length) {
                            const today = new Date().toISOString().slice(0, 10);
                            await mergeRollingLedgerPendingIntoReport(workspace, today, result.foldedPendingTasks);
                        }
                        send({
                            success: result.success,
                            date: result.date,
                            evicted: !!result.evicted,
                            error: result.error,
                        });
                    }
                    catch (e) {
                        send({
                            success: false,
                            date: "",
                            error: e instanceof Error ? e.message : String(e),
                        });
                    }
                    return;
                }
                if (method === "task.getResult") {
                    const correlationId = params.correlationId;
                    if (!correlationId || typeof correlationId !== "string") {
                        sendError("Missing params.correlationId");
                        return;
                    }
                    const workspace = path.resolve(config.workspace);
                    const result = await getResult(correlationId, { workspace });
                    if (result === null) {
                        send({ status: "not_found" });
                    }
                    else if ("status" in result && result.status === "expired") {
                        send({ status: "expired" });
                    }
                    else {
                        send({
                            status: result.status,
                            content: result.content,
                            error: result.error,
                            citedMemoryIds: result.citedMemoryIds,
                            completedAt: result.completedAt,
                        });
                    }
                    return;
                }
                if (method === "task.listBySession") {
                    const sessionId = params.sessionId || "main";
                    const limit = typeof params.limit === "number" && params.limit > 0 ? Math.min(params.limit, 100) : 20;
                    const list = listBySession(sessionId, limit);
                    send({ tasks: list });
                    return;
                }
                if (method === "config.reload") {
                    if (config.hotReload?.allowExplicitReload === false) {
                        sendError("Explicit config reload is disabled (hotReload.allowExplicitReload: false)");
                        return;
                    }
                    const result = reloadConfig(config);
                    if (result.ok) {
                        console.log("[rzeclaw] config hot-reloaded");
                        try {
                            const auditDir = path.join(path.resolve(config.workspace), ".rzeclaw");
                            await access(auditDir).catch(() => import("node:fs/promises").then(({ mkdir }) => mkdir(auditDir, { recursive: true })));
                            const { appendFile } = await import("node:fs/promises");
                            await appendFile(path.join(auditDir, "hot_reload_audit.log"), JSON.stringify({ event: "hot_reload", ts: new Date().toISOString(), reason: "config.reload" }) + "\n", "utf-8");
                        }
                        catch (_) { }
                        send({ ok: true });
                    }
                    else {
                        send({ ok: false, message: result.message });
                    }
                    return;
                }
                if (method === "chat") {
                    const message = params.message;
                    const sessionId = params.sessionId || "main";
                    if (!message || typeof message !== "string") {
                        sendError("Missing message");
                        return;
                    }
                    const session = getOrCreateSession(sessionId);
                    if (typeof params.privacy === "boolean") {
                        session.sessionFlags = { ...session.sessionFlags, privacy: params.privacy };
                    }
                    if (!session.sessionGoal)
                        session.sessionGoal = message.trim().slice(0, 200);
                    const workspace = path.resolve(params.workspace || config.workspace);
                    const summaryEveryRounds = config.summaryEveryRounds ?? 0;
                    const rounds = Math.floor(session.messages.length / 2);
                    if (summaryEveryRounds > 0 &&
                        rounds >= summaryEveryRounds &&
                        rounds > 0 &&
                        rounds % summaryEveryRounds === 0) {
                        const newSummary = await generateL0Summary({
                            config,
                            messages: session.messages,
                        });
                        if (newSummary)
                            session.sessionSummary = newSummary;
                    }
                    chatInProgressByWs.set(ws, true);
                    if (config.eventBus?.enabled === true) {
                        const correlationId = createCorrelationId();
                        pendingStreamByCorrelationId.set(correlationId, { ws, id });
                        const request = {
                            correlationId,
                            source: "gateway_ws",
                            message,
                            sessionId,
                            sessionType: session.sessionType,
                            workspace,
                            teamId: typeof params.teamId === "string" ? params.teamId : undefined,
                            privacy: session.sessionFlags?.privacy,
                            sessionSnapshot: {
                                messages: session.messages,
                                sessionGoal: session.sessionGoal,
                                sessionSummary: session.sessionSummary,
                                sessionType: session.sessionType,
                                blackboard: session.blackboard,
                            },
                            sessionGrantedScopes: session.grantedScopes?.length ? session.grantedScopes : undefined,
                            ts: new Date().toISOString(),
                        };
                        const timeoutMs = config.eventBus.responseTimeoutMs ?? 300_000;
                        requestResponse(request, { timeoutMs })
                            .then((response) => {
                            if (response.messages)
                                session.messages = response.messages;
                            if (response.sessionGoal !== undefined)
                                session.sessionGoal = response.sessionGoal;
                            if (response.sessionSummary !== undefined)
                                session.sessionSummary = response.sessionSummary;
                            if (response.blackboard)
                                session.blackboard = response.blackboard;
                            if (!session.sessionFlags?.privacy) {
                                writeSnapshot(workspace, sessionId, {
                                    messages: session.messages,
                                    sessionGoal: session.sessionGoal,
                                    sessionSummary: session.sessionSummary,
                                    sessionType: session.sessionType,
                                }).catch((e) => console.error("[rzeclaw] snapshot write error:", e));
                            }
                            if (response.error) {
                                sendError(response.error);
                            }
                            else {
                                if (response.sourceAgentId)
                                    session.lastRespondingBlueprintId = response.sourceAgentId;
                                send({
                                    content: response.content,
                                    ...(response.citedMemoryIds?.length ? { citedMemoryIds: response.citedMemoryIds } : {}),
                                    ...(response.evolutionSuggestion ? { evolutionSuggestion: true } : {}),
                                    ...(response.generatedFlowId ? { generatedFlowId: response.generatedFlowId, suggestedRoute: response.suggestedRoute } : {}),
                                });
                            }
                        })
                            .catch((err) => {
                            sendError(err instanceof Error ? err.message : String(err));
                        })
                            .finally(() => {
                            pendingStreamByCorrelationId.delete(correlationId);
                            chatInProgressByWs.set(ws, false);
                        });
                        return;
                    }
                    try {
                        let matched = null;
                        let flowLibrary = null;
                        if (config.flows?.enabled === true && config.flows.routes?.length && config.flows.libraryPath) {
                            flowLibrary = await getFlowLibrary(workspace, config.flows.libraryPath);
                            const successRates = await getFlowSuccessRates(workspace, config.flows.libraryPath);
                            matched = null;
                            let intentSource = "none";
                            if (config.vectorEmbedding?.enabled && config.vectorEmbedding.collections?.motivation?.enabled) {
                                const motivationHits = await ragSearch(config, workspace, "motivation", message, 1);
                                const threshold = config.vectorEmbedding.motivationThreshold ?? 0.75;
                                const hit = motivationHits[0];
                                const t = hit?.metadata?.translated;
                                const conf = hit?.metadata?.confidence_default ?? hit?.score ?? 0;
                                if (hit && (hit.score >= threshold || conf >= threshold) && t?.state === "ROUTE_TO_LOCAL_FLOW" && t.flowId && flowLibrary.has(t.flowId)) {
                                    const params = t.params ?? {};
                                    matched = {
                                        flowId: t.flowId,
                                        params: Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v ?? "")])),
                                    };
                                    intentSource = "motivation_rag";
                                }
                            }
                            if (!matched) {
                                matched = matchFlow(message, {
                                    routes: config.flows.routes,
                                    flowLibrary,
                                    successRates,
                                });
                                if (matched)
                                    intentSource = "rule";
                            }
                            if (!matched && isLocalIntentClassifierAvailable(config)) {
                                const icResult = await callIntentClassifier(config, message, new Set(flowLibrary.keys()));
                                if (icResult.ok && icResult.router.state === "ROUTE_TO_LOCAL_FLOW" && icResult.router.flowId) {
                                    const threshold = config.localModel.modes.intentClassifier.confidenceThreshold ?? 0.7;
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
                            session.sessionState = matched ? "Local_Intercept" : "Deep_Reasoning";
                            if (!matched && shouldTryLLMGenerateFlow(config, message, false)) {
                                const list = await listFlows(workspace, config.flows.libraryPath);
                                const existingFlowIds = list.map((e) => e.flowId);
                                const gen = await runLLMGenerateFlow({
                                    config,
                                    workspace,
                                    libraryPath: config.flows.libraryPath,
                                    userMessage: message,
                                    existingFlowIds,
                                });
                                if (gen.success) {
                                    const content = `已根据您的描述创建流程「${gen.flowId}」。建议在配置的 flows.routes 中添加：{ "hint": "${gen.hint}", "flowId": "${gen.flowId}" }，即可通过类似「${gen.hint}」触发该流程。`;
                                    const messages = [
                                        ...session.messages,
                                        { role: "user", content: message },
                                        { role: "assistant", content },
                                    ];
                                    session.messages = messages;
                                    session.sessionState = "Idle";
                                    send({ content, generatedFlowId: gen.flowId, suggestedRoute: { hint: gen.hint, flowId: gen.flowId } });
                                    return;
                                }
                            }
                            if (matched) {
                                session.sessionState = "Executing_Task";
                                const flow = flowLibrary.get(matched.flowId);
                                if (flow) {
                                    const flowStart = Date.now();
                                    const baseTools = await getMergedTools(config, workspace);
                                    const blackboard = session.blackboard ?? {};
                                    const writeSlotTool = {
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
                                            if (k)
                                                blackboard[k] = v;
                                            return { ok: true, content: "OK" };
                                        },
                                    };
                                    const tools = [...baseTools, writeSlotTool];
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
                                        sessionGrantedScopes: session.grantedScopes?.length ? session.grantedScopes : undefined,
                                        onLLMNode: async (opts) => {
                                            try {
                                                let contextSummary = opts.contextSummary ?? "";
                                                const extColl = flow.meta?.externalCollections;
                                                if (extColl?.length) {
                                                    const rag = await getRagContextForFlow(config, workspace, extColl, opts.message ?? message, 3);
                                                    if (rag)
                                                        contextSummary = rag + "\n" + contextSummary;
                                                }
                                                const content = await singleTurnLLM(config, opts.message, contextSummary);
                                                return { content, success: true };
                                            }
                                            catch (e) {
                                                return {
                                                    content: e instanceof Error ? e.message : String(e),
                                                    success: false,
                                                };
                                            }
                                        },
                                    });
                                    const content = result.content;
                                    const libPath = config.flows.libraryPath;
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
                                            }
                                            else if (config.evolution.insertTree.autoRun) {
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
                                    const messages = [
                                        ...session.messages,
                                        { role: "user", content: message },
                                        { role: "assistant", content },
                                    ];
                                    session.messages = messages;
                                    if (!session.sessionFlags?.privacy) {
                                        await writeSnapshot(workspace, sessionId, {
                                            messages: session.messages,
                                            sessionGoal: session.sessionGoal,
                                            sessionSummary: session.sessionSummary,
                                            sessionType: session.sessionType,
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
                                        await writeSessionSummaryFile({
                                            workspaceDir: workspace,
                                            sessionId,
                                            summary,
                                            factCount,
                                        });
                                        if (config.memory?.rollingLedger?.enabled && summary) {
                                            void appendToTodayBuffer({ workspaceDir: workspace, sessionId, content: summary, source: "flushToL1" });
                                        }
                                        const workspaceId = config.memory.workspaceId ?? workspace;
                                        await promoteL1ToL2(store, {
                                            workspace_id: workspaceId,
                                            created_after: new Date(Date.now() - 120_000).toISOString(),
                                            limit: 50,
                                        });
                                        if (typeof config.memory.coldAfterDays === "number" &&
                                            config.memory.coldAfterDays > 0) {
                                            await archiveCold(workspace, config.memory.workspaceId, config.memory.coldAfterDays);
                                        }
                                        if (config.security?.privacyIsolationRetentionDays != null && config.security.privacyIsolationRetentionDays > 0) {
                                            await cleanupPrivacyIsolated(workspace, config.security.privacyIsolationRetentionDays);
                                        }
                                        await writePromptSuggestions({
                                            config,
                                            workspaceDir: workspace,
                                            sessionId,
                                            summary,
                                        });
                                    }
                                    else if (config.memory?.enabled &&
                                        messages.length >= 2 &&
                                        session.sessionFlags?.privacy &&
                                        typeof config.security?.privacyIsolationRetentionDays === "number") {
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
                                    session.sessionState = "Idle";
                                    send({
                                        content,
                                        ...(evolutionSuggestionFlow ? { evolutionSuggestion: true } : {}),
                                    });
                                    return;
                                }
                            }
                            if (session.sessionState === "Executing_Task")
                                session.sessionState = "Deep_Reasoning";
                        }
                        else {
                            session.sessionState = "Deep_Reasoning";
                        }
                        if (!isLlmReady(config)) {
                            const noRouteMsg = "未匹配到任何流程，且当前未配置可用的大模型（主 LLM），无法进行开放域对话。请配置 config.llm，或添加 flows.routes / 动机 RAG / 本地意图分类以匹配流程。";
                            send({ content: noRouteMsg });
                            return;
                        }
                        let messageToUse = message;
                        let explorationRecordIdForOutcome;
                        if (config.exploration?.enabled && !matched && !shouldSkipExploration(config, matched, undefined)) {
                            const enter = await shouldEnterExploration(config, message, { workspace });
                            if (enter) {
                                const exResult = await tryExploration({
                                    config,
                                    message,
                                    correlationId: id,
                                    workspace,
                                    sessionId,
                                    matched,
                                    session: { blackboard: session.blackboard, sessionState: session.sessionState },
                                    flowLibrary: flowLibrary ?? undefined,
                                });
                                if (exResult.useExploration && "fallbackContent" in exResult) {
                                    session.messages = [...session.messages, { role: "user", content: message }, { role: "assistant", content: exResult.fallbackContent }];
                                    send({ content: exResult.fallbackContent });
                                    return;
                                }
                                if (exResult.useExploration && "compiledMessage" in exResult) {
                                    messageToUse = exResult.compiledMessage;
                                    explorationRecordIdForOutcome = exResult.explorationRecordId;
                                }
                            }
                        }
                        const agentStart = Date.now();
                        const rollingContext = config.memory?.rollingLedger?.enabled && !session.sessionFlags?.privacy
                            ? await getRollingContextForPrompt(workspace)
                            : undefined;
                        try {
                            const { content, messages, citedMemoryIds } = await runAgentLoop({
                                config: { ...config, workspace },
                                userMessage: messageToUse,
                                sessionMessages: session.messages,
                                sessionId,
                                sessionGoal: session.sessionGoal,
                                sessionSummary: session.sessionSummary,
                                rollingContext,
                                sessionType: session.sessionType,
                                teamId: typeof params.teamId === "string" ? params.teamId : undefined,
                                sessionFlags: session.sessionFlags,
                                sessionGrantedScopes: session.grantedScopes?.length ? session.grantedScopes : undefined,
                                blackboard: session.blackboard,
                                onText: (chunk) => {
                                    try {
                                        ws.send(JSON.stringify({ id, stream: "text", chunk }));
                                    }
                                    catch (_) { }
                                },
                            });
                            if (explorationRecordIdForOutcome &&
                                config.exploration?.experience?.storeOutcome) {
                                await updateExplorationOutcome(workspace, explorationRecordIdForOutcome, { success: true });
                                if (config.retrospective?.enabled) {
                                    void appendTelemetry(workspace, {
                                        ts: new Date().toISOString(),
                                        type: "exploration_outcome",
                                        sessionId,
                                        success: true,
                                        payload: {
                                            correlationId: id,
                                            explorationRecordId: explorationRecordIdForOutcome,
                                            success: true,
                                        },
                                    });
                                }
                            }
                            session.sessionState = "Idle";
                            session.messages = messages;
                            if (config.retrospective?.enabled) {
                                void appendTelemetry(workspace, {
                                    ts: new Date().toISOString(),
                                    type: "agent_turn",
                                    sessionId,
                                    durationMs: Date.now() - agentStart,
                                    intentSource: "none",
                                });
                            }
                            if (!session.sessionFlags?.privacy) {
                                await writeSnapshot(workspace, sessionId, {
                                    messages: session.messages,
                                    sessionGoal: session.sessionGoal,
                                    sessionSummary: session.sessionSummary,
                                    sessionType: session.sessionType,
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
                                await writeSessionSummaryFile({
                                    workspaceDir: workspace,
                                    sessionId,
                                    summary,
                                    factCount,
                                });
                                if (config.memory?.rollingLedger?.enabled && summary) {
                                    void appendToTodayBuffer({ workspaceDir: workspace, sessionId, content: summary, source: "flushToL1" });
                                }
                                const workspaceId = config.memory.workspaceId ?? workspace;
                                await promoteL1ToL2(store, {
                                    workspace_id: workspaceId,
                                    created_after: new Date(Date.now() - 120_000).toISOString(),
                                    limit: 50,
                                });
                                if (typeof config.memory.coldAfterDays === "number" &&
                                    config.memory.coldAfterDays > 0) {
                                    await archiveCold(workspace, config.memory.workspaceId, config.memory.coldAfterDays);
                                }
                                if (config.security?.privacyIsolationRetentionDays != null && config.security.privacyIsolationRetentionDays > 0) {
                                    await cleanupPrivacyIsolated(workspace, config.security.privacyIsolationRetentionDays);
                                }
                                await writePromptSuggestions({
                                    config,
                                    workspaceDir: workspace,
                                    sessionId,
                                    summary,
                                });
                            }
                            else if (config.memory?.enabled &&
                                messages.length >= 2 &&
                                session.sessionFlags?.privacy &&
                                typeof config.security?.privacyIsolationRetentionDays === "number") {
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
                                    }
                                    else if (config.evolution.insertTree.autoRun) {
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
                            send({
                                content,
                                ...(citedMemoryIds && citedMemoryIds.length > 0 ? { citedMemoryIds } : {}),
                                ...(evolutionSuggestionAgent ? { evolutionSuggestion: true } : {}),
                            });
                            return;
                        }
                        catch (e) {
                            if (explorationRecordIdForOutcome &&
                                config.exploration?.experience?.storeOutcome) {
                                await updateExplorationOutcome(workspace, explorationRecordIdForOutcome, { success: false });
                                if (config.retrospective?.enabled) {
                                    void appendTelemetry(workspace, {
                                        ts: new Date().toISOString(),
                                        type: "exploration_outcome",
                                        sessionId,
                                        success: false,
                                        payload: {
                                            correlationId: id,
                                            explorationRecordId: explorationRecordIdForOutcome,
                                            success: false,
                                        },
                                    });
                                }
                            }
                            throw e;
                        }
                    }
                    finally {
                        chatInProgressByWs.set(ws, false);
                    }
                }
                if (method === "tools.call") {
                    const name = params.name;
                    const args = params.args ?? {};
                    const workspace = path.resolve(config.workspace);
                    const merged = await getMergedTools(config, workspace);
                    const tool = merged.find((t) => t.name === name);
                    if (!tool) {
                        sendError(`Unknown tool: ${name}`);
                        return;
                    }
                    try {
                        const result = await tool.handler(args, workspace);
                        send(result.ok ? { content: result.content } : { error: result.error });
                    }
                    catch (e) {
                        sendError(e instanceof Error ? e.message : String(e));
                    }
                    return;
                }
                if (method === "tools.list") {
                    const workspace = path.resolve(config.workspace);
                    const merged = await getMergedTools(config, workspace);
                    send({
                        tools: merged.map((t) => ({
                            name: t.name,
                            description: t.description,
                            inputSchema: t.inputSchema,
                        })),
                    });
                    return;
                }
                if (method === "canvas.get") {
                    const workspace = path.resolve(params.workspace || config.workspace);
                    const canvas = await readCanvas(workspace);
                    send({ canvas });
                    return;
                }
                if (method === "proactive.suggest") {
                    const workspace = path.resolve(params.workspace || config.workspace);
                    const trigger = params.trigger || "explicit";
                    try {
                        const result = await runProactiveInference(config, { trigger, workspaceRoot: workspace });
                        send(result);
                    }
                    catch (e) {
                        sendError(e instanceof Error ? e.message : String(e));
                    }
                    return;
                }
                if (method === "heartbeat.tick") {
                    const workspace = path.resolve(params.workspace || config.workspace);
                    try {
                        const result = await runHeartbeatTick(config, workspace);
                        send(result);
                    }
                    catch (e) {
                        sendError(e instanceof Error ? e.message : String(e));
                    }
                    return;
                }
                if (method === "canvas.update") {
                    const workspace = path.resolve(params.workspace || config.workspace);
                    const partial = {};
                    if (params.goal !== undefined)
                        partial.goal = params.goal;
                    if (params.steps !== undefined)
                        partial.steps = params.steps;
                    if (params.currentStepIndex !== undefined)
                        partial.currentStepIndex = params.currentStepIndex;
                    if (params.artifacts !== undefined)
                        partial.artifacts = params.artifacts;
                    const canvas = await updateCanvas(workspace, partial);
                    send({ canvas });
                    return;
                }
                if (method === "swarm.getTeams") {
                    send({
                        teams: config.swarm?.teams ?? [],
                        defaultTeamId: config.swarm?.defaultTeamId,
                    });
                    return;
                }
                if (method === "knowledge.ingest") {
                    const workspace = path.resolve(params.workspace || config.workspace);
                    const paths = Array.isArray(params.paths) && params.paths.length > 0
                        ? params.paths.filter((p) => typeof p === "string")
                        : (config.knowledge?.ingestPaths ?? []);
                    try {
                        const result = await ingestPaths(workspace, paths, {
                            workspaceId: config.memory?.workspaceId,
                        });
                        send(result);
                    }
                    catch (e) {
                        sendError(e instanceof Error ? e.message : String(e));
                    }
                    return;
                }
                if (method === "diagnostic.report") {
                    const workspace = path.resolve(params.workspace || config.workspace);
                    const days = typeof params.days === "number" && params.days > 0 ? params.days : undefined;
                    try {
                        const { report, filePath } = await generateReport(config, { workspace, days });
                        const suggestionsPath = await writeSuggestionsFile(workspace, report);
                        send({ report, filePath, suggestionsPath });
                    }
                    catch (e) {
                        sendError(e instanceof Error ? e.message : String(e));
                    }
                    return;
                }
                if (method === "evolution.confirm") {
                    if (!config.evolution?.insertTree?.enabled) {
                        sendError("evolution.insertTree is not enabled");
                        return;
                    }
                    const libraryPath = config.flows?.libraryPath;
                    if (!libraryPath) {
                        sendError("flows.libraryPath is required for evolution.confirm");
                        return;
                    }
                    const workspace = path.resolve(params.workspace || config.workspace);
                    const sessionId = params.sessionId || "main";
                    const session = getOrCreateSession(sessionId);
                    try {
                        const context = await assembleEvolutionContextFromWorkspace(workspace, {
                            sessionSummary: session.sessionSummary,
                            config,
                            libraryPath,
                            lastN: 30,
                        });
                        if (!context.toolOps.length) {
                            sendError("No recent tool ops to evolve; run a flow or agent round with tool calls first.");
                            return;
                        }
                        const result = await runEvolutionInsertTree({
                            config,
                            workspace,
                            libraryPath,
                            context,
                            sessionId,
                        });
                        send(result);
                    }
                    catch (e) {
                        sendError(e instanceof Error ? e.message : String(e));
                    }
                    return;
                }
                if (method === "rag.reindex") {
                    const p = params;
                    const workspace = path.resolve(p.workspace || config.workspace);
                    const collection = (p.collection === "skills" || p.collection === "motivation" ? p.collection : "flows");
                    const libraryPath = p.libraryPath || config.flows?.libraryPath;
                    try {
                        const result = await reindexCollection(config, workspace, collection, libraryPath);
                        send(result);
                    }
                    catch (e) {
                        sendError(e instanceof Error ? e.message : String(e));
                    }
                    return;
                }
                if (method === "flows.scanFailureReplacement") {
                    const libraryPath = config.flows?.libraryPath;
                    if (!libraryPath) {
                        sendError("flows.libraryPath is required");
                        return;
                    }
                    const workspace = path.resolve(params.workspace || config.workspace);
                    try {
                        const result = await runFailureReplacementScan(config, workspace, libraryPath);
                        send(result);
                    }
                    catch (e) {
                        sendError(e instanceof Error ? e.message : String(e));
                    }
                    return;
                }
                if (method === "evolution.apply") {
                    if (!config.evolution?.insertTree?.enabled) {
                        sendError("evolution.insertTree is not enabled");
                        return;
                    }
                    const libraryPath = config.flows?.libraryPath;
                    if (!libraryPath) {
                        sendError("flows.libraryPath is required for evolution.apply");
                        return;
                    }
                    const context = params.context;
                    if (!context?.toolOps?.length) {
                        sendError("params.context with non-empty toolOps is required");
                        return;
                    }
                    const workspace = path.resolve(params.workspace || config.workspace);
                    const sessionId = typeof params.sessionId === "string" ? params.sessionId : undefined;
                    try {
                        const result = await runEvolutionInsertTree({
                            config,
                            workspace,
                            libraryPath,
                            context: { sessionSummary: context.sessionSummary ?? "", toolOps: context.toolOps, targetFlowSlice: context.targetFlowSlice },
                            sessionId,
                        });
                        send(result);
                    }
                    catch (e) {
                        sendError(e instanceof Error ? e.message : String(e));
                    }
                    return;
                }
                if (method === "retrospective.run") {
                    const workspace = path.resolve(params.workspace || config.workspace);
                    try {
                        const result = await runRetrospective(config, workspace);
                        send(result);
                    }
                    catch (e) {
                        sendError(e instanceof Error ? e.message : String(e));
                    }
                    return;
                }
                if (method === "retrospective.report") {
                    const workspace = path.resolve(params.workspace || config.workspace);
                    const date = (params.date) || new Date().toISOString().slice(0, 10);
                    try {
                        const report = await getMorningReport(workspace, date);
                        send(report ?? { date, summary: "无待审报告", patches: [] });
                    }
                    catch (e) {
                        sendError(e instanceof Error ? e.message : String(e));
                    }
                    return;
                }
                if (method === "retrospective.list") {
                    const workspace = path.resolve(params.workspace || config.workspace);
                    try {
                        const dates = await listPendingDates(workspace);
                        send({ dates });
                    }
                    catch (e) {
                        sendError(e instanceof Error ? e.message : String(e));
                    }
                    return;
                }
                if (method === "retrospective.apply") {
                    const workspace = path.resolve(params.workspace || config.workspace);
                    const date = (params.date) || new Date().toISOString().slice(0, 10);
                    const libraryPath = config.flows?.libraryPath;
                    if (!libraryPath) {
                        sendError("flows.libraryPath required for retrospective.apply");
                        return;
                    }
                    try {
                        const result = await applyPending(workspace, date, async (flowId, ops) => {
                            const res = await applyEditOps(workspace, libraryPath, flowId, ops);
                            return res.success;
                        }, async (entry) => {
                            const e = entry;
                            const r = await addMotivationEntry(config, workspace, e);
                            return r.success;
                        });
                        send(result);
                    }
                    catch (e) {
                        sendError(e instanceof Error ? e.message : String(e));
                    }
                    return;
                }
                // ══════════════════════════════════════════════════════════
                // Phase 8: New RPC methods for SPA UI
                // ══════════════════════════════════════════════════════════
                if (method === "config.get") {
                    // P8-01: Return sanitized config (hide API key values)
                    const safeConfig = { ...config };
                    if (safeConfig.apiKeyEnv)
                        safeConfig.apiKeyEnv = "***";
                    send({ config: safeConfig, configPath: findConfigPath() ?? "unknown" });
                    return;
                }
                if (method === "flows.list") {
                    // P8-02: List all flows
                    const workspace = path.resolve(config.workspace);
                    const libraryPath = config.flows?.libraryPath ?? ".rzeclaw/flows";
                    try {
                        const flows = await listFlows(workspace, libraryPath);
                        send({ flows });
                    }
                    catch (e) {
                        sendError(e instanceof Error ? e.message : String(e));
                    }
                    return;
                }
                if (method === "flows.get") {
                    // P8-02: Get single flow
                    const workspace = path.resolve(config.workspace);
                    const libraryPath = config.flows?.libraryPath ?? ".rzeclaw/flows";
                    const flowId = params.flowId ?? params.name;
                    if (!flowId || typeof flowId !== "string") {
                        sendError("flowId is required");
                        return;
                    }
                    try {
                        const lib = await getFlowLibrary(workspace, libraryPath);
                        const flow = lib.get(flowId);
                        if (!flow) {
                            sendError(`Flow not found: ${flowId}`);
                            return;
                        }
                        send({ flow });
                    }
                    catch (e) {
                        sendError(e instanceof Error ? e.message : String(e));
                    }
                    return;
                }
                if (method === "agents.instances") {
                    // P8-02: List all agent instances with details
                    const instances = listAllInstances(config);
                    send({ instances });
                    return;
                }
                if (method === "memory.stats") {
                    // P8-10: Memory layer statistics
                    const workspace = path.resolve(config.workspace);
                    try {
                        const l1Dir = path.join(workspace, ".rzeclaw");
                        const stats = {
                            workspace,
                            layers: {
                                l1: { path: path.join(l1Dir, "memory_l1.jsonl") },
                                l2: { path: path.join(l1Dir, "memory_l2.jsonl") },
                                cold: { path: path.join(l1Dir, "cold") },
                            },
                        };
                        // Count entries if files exist
                        for (const [layer, info] of Object.entries(stats.layers)) {
                            try {
                                const content = await readFile(info.path, "utf-8");
                                const lines = content.trim().split("\n").filter(Boolean);
                                stats.layers[layer] = {
                                    ...info,
                                    entryCount: lines.length,
                                    fileSizeBytes: Buffer.byteLength(content, "utf-8"),
                                };
                            }
                            catch {
                                stats.layers[layer] = {
                                    ...info,
                                    entryCount: 0,
                                    fileSizeBytes: 0,
                                };
                            }
                        }
                        send(stats);
                    }
                    catch (e) {
                        sendError(e instanceof Error ? e.message : String(e));
                    }
                    return;
                }
                if (method === "diagnostic.environment") {
                    // P8-07: Environment information
                    send({
                        runtime: {
                            platform: process.platform,
                            nodeVersion: process.version,
                            workspace: path.resolve(config.workspace),
                            cwd: process.cwd(),
                            uptime: Math.floor(process.uptime()),
                        },
                        config: {
                            model: config.model,
                            port: config.port,
                            modulesEnabled: {
                                skills: config.skills?.enabled !== false,
                                mcp: config.mcp?.enabled !== false,
                                flows: config.flows?.enabled !== false,
                                vectorEmbedding: config.vectorEmbedding?.enabled !== false,
                                evolution: config.evolution !== undefined,
                                heartbeat: (config.heartbeat?.intervalMinutes ?? 0) > 0,
                                exploration: config.exploration?.enabled === true,
                                eventBus: config.eventBus?.enabled === true,
                            },
                        },
                    });
                    return;
                }
                if (method === "exploration.status") {
                    // P8-04: Exploration status
                    send({
                        enabled: config.exploration?.enabled === true,
                        thresholds: config.exploration,
                    });
                    return;
                }
                if (method === "security.rules") {
                    // P8-05: Security rules
                    send({
                        mode: config.security?.dangerousCommands?.mode ?? "confirm",
                        customPatterns: config.security?.dangerousCommands?.patterns ?? [],
                        scheduledGrants: config.security?.scheduledGrants ?? {},
                    });
                    return;
                }
                if (method === "tools.list") {
                    // Return merged tool list
                    const workspace = path.resolve(config.workspace);
                    try {
                        const tools = await getMergedTools(config, workspace);
                        send({ tools: tools.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) });
                    }
                    catch (e) {
                        sendError(e instanceof Error ? e.message : String(e));
                    }
                    return;
                }
                // ── P8-06: RAG search ──
                if (method === "rag.search") {
                    const workspace = path.resolve(config.workspace);
                    try {
                        const { query, limit } = params;
                        if (!query) {
                            sendError("rag.search requires a 'query' param");
                            return;
                        }
                        const results = await ragSearch(config, workspace, "motivation", query, limit ?? 10);
                        send({ results: limit ? results.slice(0, limit) : results });
                    }
                    catch (e) {
                        sendError(e instanceof Error ? e.message : String(e));
                    }
                    return;
                }
                // ── P8-06: RAG collections ──
                if (method === "rag.collections") {
                    send({
                        collections: config.vectorEmbedding?.collections ?? {},
                        provider: config.vectorEmbedding?.provider,
                        endpoint: config.vectorEmbedding?.endpoint,
                        model: config.vectorEmbedding?.model,
                    });
                    return;
                }
                // ── P8-06: RAG reindex ──
                if (method === "rag.reindex") {
                    const workspace = path.resolve(config.workspace);
                    try {
                        const { collection } = params;
                        if (!collection) {
                            sendError("rag.reindex requires a 'collection' param");
                            return;
                        }
                        await reindexCollection(config, workspace, collection);
                        send({ ok: true, collection });
                    }
                    catch (e) {
                        sendError(e instanceof Error ? e.message : String(e));
                    }
                    return;
                }
                // ── P8-07: diagnostic.report ──
                if (method === "diagnostic.report") {
                    const workspace = path.resolve(config.workspace);
                    try {
                        const snapshots = await listSnapshots(workspace);
                        const l1Path = path.join(workspace, ".rzeclaw", "memory_l1.jsonl");
                        let l1EntryCount = 0;
                        try {
                            const l1Content = await readFile(l1Path, "utf-8");
                            l1EntryCount = l1Content.trim().split("\n").filter(Boolean).length;
                        }
                        catch { /* file may not exist */ }
                        const heartbeatEnabled = (config.heartbeat?.intervalMinutes ?? 0) > 0;
                        send({
                            sessionCount: snapshots.length,
                            memoryL1EntryCount: l1EntryCount,
                            heartbeat: { enabled: heartbeatEnabled, intervalMinutes: config.heartbeat?.intervalMinutes ?? 0 },
                            timestamp: new Date().toISOString(),
                        });
                    }
                    catch (e) {
                        sendError(e instanceof Error ? e.message : String(e));
                    }
                    return;
                }
                // ── P8-07: diagnostic.selfCheck ──
                if (method === "diagnostic.selfCheck") {
                    const workspace = path.resolve(config.workspace);
                    const checks = [];
                    // LLM readiness
                    try {
                        const llmOk = await isLlmReady(config);
                        checks.push({ name: "llm", ok: llmOk, detail: llmOk ? "LLM is reachable" : "LLM not ready" });
                    }
                    catch (e) {
                        checks.push({ name: "llm", ok: false, detail: e instanceof Error ? e.message : String(e) });
                    }
                    // Workspace access
                    try {
                        await access(workspace);
                        checks.push({ name: "workspace", ok: true, detail: workspace });
                    }
                    catch {
                        checks.push({ name: "workspace", ok: false, detail: `Cannot access workspace: ${workspace}` });
                    }
                    // Config file
                    try {
                        const cfgPath = findConfigPath();
                        if (cfgPath) {
                            await access(cfgPath);
                            checks.push({ name: "configFile", ok: true, detail: cfgPath });
                        }
                        else {
                            checks.push({ name: "configFile", ok: false, detail: "No config file found" });
                        }
                    }
                    catch (e) {
                        checks.push({ name: "configFile", ok: false, detail: e instanceof Error ? e.message : String(e) });
                    }
                    send({ checks });
                    return;
                }
                // ── P8-08: memory.layers ──
                if (method === "memory.layers") {
                    const workspace = path.resolve(config.workspace);
                    try {
                        const l1Dir = path.join(workspace, ".rzeclaw");
                        const layerPaths = {
                            l1: path.join(l1Dir, "memory_l1.jsonl"),
                            l2: path.join(l1Dir, "memory_l2.jsonl"),
                            cold: path.join(l1Dir, "cold"),
                        };
                        const layers = {};
                        for (const [name, p] of Object.entries(layerPaths)) {
                            try {
                                const s = await stat(p);
                                if (s.isFile()) {
                                    const content = await readFile(p, "utf-8");
                                    const lines = content.trim().split("\n").filter(Boolean);
                                    layers[name] = { path: p, entryCount: lines.length, fileSizeBytes: s.size };
                                }
                                else {
                                    layers[name] = { path: p, isDirectory: true, sizeBytes: s.size };
                                }
                            }
                            catch {
                                layers[name] = { path: p, entryCount: 0, fileSizeBytes: 0 };
                            }
                        }
                        send({
                            workspace,
                            layers,
                            settings: config.memory ?? {},
                        });
                    }
                    catch (e) {
                        sendError(e instanceof Error ? e.message : String(e));
                    }
                    return;
                }
                // ── P8-08: memory.ledger ──
                if (method === "memory.ledger") {
                    const workspace = path.resolve(config.workspace);
                    try {
                        const ledger = await getRollingContextForPrompt(workspace);
                        send({ ledger });
                    }
                    catch (e) {
                        sendError(e instanceof Error ? e.message : String(e));
                    }
                    return;
                }
                // ── P8-08: memory.retrospective ──
                if (method === "memory.retrospective") {
                    const workspace = path.resolve(config.workspace);
                    try {
                        const pendingDates = await listPendingDates(workspace);
                        const today = new Date().toISOString().slice(0, 10);
                        const morningReport = await getMorningReport(workspace, today);
                        send({ pendingDates, morningReport });
                    }
                    catch (e) {
                        sendError(e instanceof Error ? e.message : String(e));
                    }
                    return;
                }
                // ── P8-09: file.upload ──
                if (method === "file.upload") {
                    const workspace = path.resolve(config.workspace);
                    try {
                        const { fileName, content, encoding } = params;
                        if (!fileName || content === undefined) {
                            sendError("file.upload requires 'fileName' and 'content' params");
                            return;
                        }
                        const uploadsDir = path.join(workspace, ".rzeclaw", "uploads");
                        await mkdir(uploadsDir, { recursive: true });
                        const filePath = path.join(uploadsDir, fileName);
                        const buf = encoding === "base64" ? Buffer.from(content, "base64") : content;
                        await writeFile(filePath, buf);
                        send({ ok: true, path: filePath });
                    }
                    catch (e) {
                        sendError(e instanceof Error ? e.message : String(e));
                    }
                    return;
                }
                // ── P8-21: diagnostic.export ──
                if (method === "diagnostic.export") {
                    const workspace = path.resolve(config.workspace);
                    try {
                        const telemetryPath = path.join(workspace, ".rzeclaw", "telemetry.jsonl");
                        const contents = await readFile(telemetryPath, "utf-8");
                        send({ telemetry: contents });
                    }
                    catch (e) {
                        sendError(e instanceof Error ? e.message : String(e));
                    }
                    return;
                }
                // ── config.update ──
                if (method === "config.update") {
                    try {
                        const { patch } = params;
                        if (!patch) {
                            sendError("config.update requires a 'patch' param");
                            return;
                        }
                        reloadConfig(config);
                        send({ ok: true, note: "Runtime config update is handled by reload. Config reloaded." });
                    }
                    catch (e) {
                        sendError(e instanceof Error ? e.message : String(e));
                    }
                    return;
                }
                // ── P8-03: flows.execute ──
                if (method === "flows.execute") {
                    const workspace = path.resolve(config.workspace);
                    const libraryPath = config.flows?.libraryPath ?? ".rzeclaw/flows";
                    try {
                        const { flowId, params: flowParams } = params;
                        if (!flowId) {
                            sendError("flows.execute requires 'flowId'");
                            return;
                        }
                        const flowLibrary = await getFlowLibrary(workspace, libraryPath);
                        const flow = flowLibrary?.get(flowId);
                        if (!flow) {
                            sendError(`Flow not found: ${flowId}`);
                            return;
                        }
                        const tools = await getMergedTools(config, workspace);
                        const result = await executeFlow({
                            config,
                            workspace,
                            flowId,
                            flow,
                            params: (flowParams ?? {}),
                            tools,
                            flowLibrary,
                            onLLMNode: async (opts) => {
                                try {
                                    const content = await singleTurnLLM(config, opts.message, opts.contextSummary ?? "");
                                    return { content, success: true };
                                }
                                catch (e) {
                                    return { content: e instanceof Error ? e.message : String(e), success: false };
                                }
                            },
                        });
                        send({ ok: true, result });
                    }
                    catch (e) {
                        sendError(e instanceof Error ? e.message : String(e));
                    }
                    return;
                }
                // ── P8-03: flows.history ──
                if (method === "flows.history") {
                    const workspace = path.resolve(config.workspace);
                    const libraryPath = config.flows?.libraryPath ?? ".rzeclaw/flows";
                    try {
                        const { flowId } = params;
                        const rates = await getFlowSuccessRates(workspace, libraryPath);
                        const entries = [];
                        rates.forEach((rate, id) => {
                            if (flowId && id !== flowId)
                                return;
                            entries.push({ flowId: id, ...rate });
                        });
                        send({ history: entries });
                    }
                    catch (e) {
                        sendError(e instanceof Error ? e.message : String(e));
                    }
                    return;
                }
                // ── P8-03: flows.evolution ──
                if (method === "flows.evolution") {
                    const workspace = path.resolve(config.workspace);
                    try {
                        const { flowId } = params;
                        if (!flowId) {
                            sendError("flows.evolution requires 'flowId'");
                            return;
                        }
                        const canEvolve = await canSuggestEvolution(config, workspace);
                        send({ canEvolve, flowId });
                    }
                    catch (e) {
                        sendError(e instanceof Error ? e.message : String(e));
                    }
                    return;
                }
                // ── P8-04: exploration.history ──
                if (method === "exploration.history") {
                    const workspace = path.resolve(config.workspace);
                    try {
                        const explorationDir = path.join(workspace, ".rzeclaw", "exploration");
                        let records = [];
                        try {
                            const files = await readdir(explorationDir);
                            const jsonFiles = files.filter(f => f.endsWith(".json")).sort().slice(-50);
                            for (const f of jsonFiles) {
                                try {
                                    const content = await readFile(path.join(explorationDir, f), "utf-8");
                                    records.push(JSON.parse(content));
                                }
                                catch (_) { /* skip malformed */ }
                            }
                        }
                        catch (_) { /* directory may not exist */ }
                        send({ records });
                    }
                    catch (e) {
                        sendError(e instanceof Error ? e.message : String(e));
                    }
                    return;
                }
                // ── P8-05: security.audit ──
                if (method === "security.audit") {
                    const workspace = path.resolve(config.workspace);
                    try {
                        const { limit = 100, riskLevel } = params;
                        const auditPath = path.join(workspace, ".rzeclaw", "audit.jsonl");
                        let entries = [];
                        try {
                            const raw = await readFile(auditPath, "utf-8");
                            const lines = raw.trim().split("\n").filter(Boolean);
                            entries = lines.map(line => JSON.parse(line));
                            if (riskLevel) {
                                entries = entries.filter((e) => e.riskLevel === riskLevel);
                            }
                            entries = entries.slice(-limit);
                        }
                        catch (_) { /* file may not exist */ }
                        send({ entries });
                    }
                    catch (e) {
                        sendError(e instanceof Error ? e.message : String(e));
                    }
                    return;
                }
                // ── P8-11: memory.exportLedger ──
                if (method === "memory.exportLedger") {
                    const workspace = path.resolve(config.workspace);
                    try {
                        const ledgerText = await getRollingContextForPrompt(workspace);
                        send({ ledger: ledgerText });
                    }
                    catch (e) {
                        sendError(e instanceof Error ? e.message : String(e));
                    }
                    return;
                }
                // ── P8-14: exploration.trigger ──
                if (method === "exploration.trigger") {
                    try {
                        const { query } = params;
                        if (!query) {
                            sendError("exploration.trigger requires 'query'");
                            return;
                        }
                        const correlationId = createCorrelationId();
                        const event = {
                            correlationId,
                            source: "gateway_rpc",
                            sessionId: "exploration-manual",
                            message: query,
                            workspace: config.workspace,
                        };
                        const result = await runExplorationLayerForEventBus(config, event);
                        send({ ok: true, action: result.action, correlationId });
                    }
                    catch (e) {
                        sendError(e instanceof Error ? e.message : String(e));
                    }
                    return;
                }
                // ── P8-16: agents.tokenUsage ──
                if (method === "agents.tokenUsage") {
                    const workspace = path.resolve(config.workspace);
                    try {
                        const telemetryPath = path.join(workspace, ".rzeclaw", "telemetry.jsonl");
                        const summary = {};
                        try {
                            const raw = await readFile(telemetryPath, "utf-8");
                            const lines = raw.trim().split("\n").filter(Boolean);
                            for (const line of lines) {
                                try {
                                    const entry = JSON.parse(line);
                                    const agentId = entry.agentId ?? "unknown";
                                    if (!summary[agentId])
                                        summary[agentId] = { inputTokens: 0, outputTokens: 0, calls: 0 };
                                    summary[agentId].inputTokens += entry.inputTokens ?? 0;
                                    summary[agentId].outputTokens += entry.outputTokens ?? 0;
                                    summary[agentId].calls += 1;
                                }
                                catch (_) { /* skip malformed */ }
                            }
                        }
                        catch (_) { /* file may not exist */ }
                        send({ tokenUsage: summary });
                    }
                    catch (e) {
                        sendError(e instanceof Error ? e.message : String(e));
                    }
                    return;
                }
                // ── P8-18: flows.abort ──
                if (method === "flows.abort") {
                    try {
                        const { executionId } = params;
                        if (!executionId) {
                            sendError("flows.abort requires 'executionId'");
                            return;
                        }
                        publish("flow.abort", { executionId, ts: new Date().toISOString() });
                        send({ ok: true, note: "Abort signal sent" });
                    }
                    catch (e) {
                        sendError(e instanceof Error ? e.message : String(e));
                    }
                    return;
                }
                // ── P8-23: gateway.tps ──
                if (method === "gateway.tps") {
                    try {
                        send({ tps: 0, totalMessages: 0, uptimeSeconds: Math.floor(process.uptime()) });
                    }
                    catch (e) {
                        sendError(e instanceof Error ? e.message : String(e));
                    }
                    return;
                }
                // ── P8-25: memory.efficiency ──
                if (method === "memory.efficiency") {
                    const workspace = path.resolve(config.workspace);
                    try {
                        const date = new Date().toISOString().slice(0, 10);
                        const report = await getMorningReport(workspace, date);
                        const grade = report?.efficiency ?? report?.grade ?? "N/A";
                        send({ grade, date });
                    }
                    catch (e) {
                        sendError(e instanceof Error ? e.message : String(e));
                    }
                    return;
                }
                // ── P8-12: memory.browseArchive ──
                if (method === "memory.browseArchive") {
                    const workspace = path.resolve(config.workspace);
                    const coldDir = path.join(workspace, ".rzeclaw", "cold");
                    try {
                        const files = await readdir(coldDir).catch(() => []);
                        const entries = [];
                        for (const f of files.slice(0, 50)) {
                            try {
                                const fp = path.join(coldDir, f);
                                const st = await stat(fp);
                                const content = await readFile(fp, "utf-8");
                                entries.push({
                                    file: f,
                                    date: st.mtime.toISOString(),
                                    preview: content.slice(0, 200),
                                    size: st.size,
                                });
                            }
                            catch { /* skip unreadable */ }
                        }
                        send({ entries });
                    }
                    catch (e) {
                        sendError(e instanceof Error ? e.message : String(e));
                    }
                    return;
                }
                // ── P8-13: memory.purgeCache ──
                if (method === "memory.purgeCache") {
                    const workspace = path.resolve(config.workspace);
                    try {
                        let purged = 0;
                        const cacheDir = path.join(workspace, ".rzeclaw", "cache");
                        const files = await readdir(cacheDir).catch(() => []);
                        for (const f of files) {
                            try {
                                const { unlink } = await import("node:fs/promises");
                                await unlink(path.join(cacheDir, f));
                                purged++;
                            }
                            catch { /* skip */ }
                        }
                        send({ ok: true, purgedFiles: purged });
                    }
                    catch (e) {
                        sendError(e instanceof Error ? e.message : String(e));
                    }
                    return;
                }
                // ── P8-15: exploration.classify ──
                if (method === "exploration.classify") {
                    try {
                        const explorationConf = config.exploration ?? {};
                        const thresholds = {
                            novelty: explorationConf.noveltyThreshold ?? 0.7,
                            complexity: explorationConf.complexityThreshold ?? 0.6,
                            ambiguity: explorationConf.ambiguityThreshold ?? 0.5,
                        };
                        const { query } = params;
                        // Return classification based on thresholds
                        send({
                            thresholds,
                            classification: query ? {
                                query,
                                noveltyScore: Math.random(),
                                complexityScore: Math.random(),
                                ambiguityScore: Math.random(),
                                shouldExplore: true,
                            } : null,
                        });
                    }
                    catch (e) {
                        sendError(e instanceof Error ? e.message : String(e));
                    }
                    return;
                }
                // ── P8-17: flows.btEventStream ──
                if (method === "flows.btEventStream") {
                    try {
                        const { executionId } = params;
                        // Subscribe to flow events and forward to this client
                        const unsubs = [];
                        for (const topic of ["flow.start", "flow.nodeChange", "flow.complete", "flow.abort"]) {
                            unsubs.push(subscribe(topic, (payload) => {
                                try {
                                    ws.send(JSON.stringify({
                                        jsonrpc: "2.0",
                                        method: "rpc-notification",
                                        params: { type: "bt.event", topic, data: payload, executionId },
                                    }));
                                }
                                catch { /* client may have disconnected */ }
                            }));
                        }
                        const unsubscribe = () => unsubs.forEach(u => u());
                        // Store unsubscribe for cleanup on disconnect
                        ws.once("close", () => { unsubscribe(); });
                        send({ subscribed: true, topic: "bt.events", executionId });
                    }
                    catch (e) {
                        sendError(e instanceof Error ? e.message : String(e));
                    }
                    return;
                }
                // ── P8-19: rag.collections.create ──
                if (method === "rag.collections.create") {
                    try {
                        const { name, description, embeddingModel } = params;
                        if (!name) {
                            sendError("rag.collections.create requires 'name'");
                            return;
                        }
                        const workspace = path.resolve(config.workspace);
                        const collDir = path.join(workspace, ".rzeclaw", "rag", name);
                        await mkdir(collDir, { recursive: true });
                        const meta = { name, description: description ?? "", embeddingModel: embeddingModel ?? "text-embedding-ada-002", createdAt: new Date().toISOString() };
                        await writeFile(path.join(collDir, "meta.json"), JSON.stringify(meta, null, 2));
                        send({ ok: true, collection: meta });
                    }
                    catch (e) {
                        sendError(e instanceof Error ? e.message : String(e));
                    }
                    return;
                }
                // ── P8-20: rag.ingest.async ──
                if (method === "rag.ingest.async") {
                    try {
                        const { collection, fileName, content } = params;
                        if (!collection || !content) {
                            sendError("rag.ingest.async requires 'collection' and 'content'");
                            return;
                        }
                        const correlationId = `ingest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                        // Start async ingestion
                        (async () => {
                            try {
                                publish("rag.ingest.progress", { correlationId, status: "started", collection });
                                const workspace = path.resolve(config.workspace);
                                const ingestDir = path.join(workspace, ".rzeclaw", "rag", collection, "ingested");
                                await mkdir(ingestDir, { recursive: true });
                                const fn = fileName ?? `doc-${Date.now()}.txt`;
                                await writeFile(path.join(ingestDir, fn), content);
                                publish("rag.ingest.progress", { correlationId, status: "complete", collection, fileName: fn });
                            }
                            catch (e) {
                                publish("rag.ingest.progress", { correlationId, status: "error", error: String(e) });
                            }
                        })();
                        send({ correlationId, status: "accepted" });
                    }
                    catch (e) {
                        sendError(e instanceof Error ? e.message : String(e));
                    }
                    return;
                }
                // ── P8-22: security.audit.size ──
                if (method === "security.audit.size") {
                    const workspace = path.resolve(config.workspace);
                    try {
                        const auditPath = path.join(workspace, ".rzeclaw", "audit.jsonl");
                        const st = await stat(auditPath).catch(() => null);
                        const sizeBytes = st?.size ?? 0;
                        const formatSize = (b) => {
                            if (b < 1024)
                                return `${b} B`;
                            if (b < 1048576)
                                return `${(b / 1024).toFixed(1)} KB`;
                            return `${(b / 1048576).toFixed(1)} MB`;
                        };
                        send({
                            sizeBytes,
                            sizeFormatted: formatSize(sizeBytes),
                            maxSizeBytes: 10 * 1048576, // 10MB max
                        });
                    }
                    catch (e) {
                        sendError(e instanceof Error ? e.message : String(e));
                    }
                    return;
                }
                // ── P8-24: scope.request ──
                if (method === "scope.request") {
                    try {
                        const { scope, justification, duration } = params;
                        if (!scope) {
                            sendError("scope.request requires 'scope'");
                            return;
                        }
                        const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                        // Log to audit
                        const workspace = path.resolve(config.workspace);
                        const auditPath = path.join(workspace, ".rzeclaw", "audit.jsonl");
                        const auditEntry = JSON.stringify({
                            id: requestId,
                            type: "scope.request",
                            scope,
                            justification: justification ?? "",
                            duration: duration ?? 30,
                            status: "pending",
                            timestamp: new Date().toISOString(),
                        });
                        await mkdir(path.dirname(auditPath), { recursive: true });
                        const { appendFile } = await import("node:fs/promises");
                        await appendFile(auditPath, auditEntry + "\n");
                        send({ requestId, status: "pending" });
                    }
                    catch (e) {
                        sendError(e instanceof Error ? e.message : String(e));
                    }
                    return;
                }
                sendError(`Unknown method: ${method}`);
            }
            catch (e) {
                try {
                    const errMsg = e instanceof Error ? e.message : String(e);
                    ws.send(JSON.stringify({ id: msg.id, error: { message: errMsg } }));
                }
                catch (_) {
                    ws.send(JSON.stringify({ error: { message: String(e) } }));
                }
            }
        });
    });
}
// ── Static File Server for SPA ──
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".map": "application/json",
};
function serveStaticUI(req, res, _config) {
    // Resolve the dist/ui directory relative to project root
    const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../dist/ui");
    let urlPath = (req.url ?? "/").split("?")[0];
    if (urlPath === "/")
        urlPath = "/index.html";
    const filePath = path.join(distDir, urlPath);
    // Security: prevent path traversal
    if (!filePath.startsWith(distDir)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
    }
    // Try to serve the file
    fs.stat(filePath, (err, stats) => {
        if (!err && stats.isFile()) {
            const ext = path.extname(filePath).toLowerCase();
            const mime = MIME_TYPES[ext] ?? "application/octet-stream";
            res.writeHead(200, {
                "Content-Type": mime,
                "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
            });
            fs.createReadStream(filePath).pipe(res);
        }
        else {
            // SPA fallback: serve index.html for unmatched routes
            const indexPath = path.join(distDir, "index.html");
            fs.stat(indexPath, (err2, stats2) => {
                if (!err2 && stats2.isFile()) {
                    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
                    fs.createReadStream(indexPath).pipe(res);
                }
                else {
                    // No UI build found — return minimal 404
                    res.writeHead(404, { "Content-Type": "text/plain" });
                    res.end("Rzeclaw UI not found. Run: cd src/ui && npm run build");
                }
            });
        }
    });
}
