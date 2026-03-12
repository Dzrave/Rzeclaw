/**
 * Phase 13 WO-BT-024: 进化插入树。从成功执行提炼为脚本+BT 节点，沙盒验证后写入 evolved_skills 并插入 Selector 左侧。
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import type { RzeclawConfig } from "../config.js";
import { getLLMClient } from "../llm/index.js";
import { readLastNEntries } from "../observability/op-log.js";
import type { OpLogEntry } from "../observability/op-log.js";
import { appendAudit, getFlow, applyEditOps } from "./crud.js";
import { isBTFlow } from "./types.js";
import type { BTNode } from "./types.js";

const ACTOR = "evolution_insert_tree";
const EVOLVED_PREFIX = "evolved_";
const DEFAULT_EVOLVED_DIR = ".rzeclaw/evolved_skills";
const DEFAULT_SANDBOX_TIMEOUT_MS = 30_000;
const SANDBOX_DIR = ".rzeclaw/evolution_sandbox";

/** WO-BT-024 §五：输入上下文，由调用方组装或从 session/op-log/黑板聚合 */
export type EvolutionContext = {
  /** 会话/轮次摘要，供 LLM 理解「做了什么」 */
  sessionSummary: string;
  /** 工具调用序列：tool 名、args 摘要、结果；用于提炼为脚本逻辑 */
  toolOps: Array<{ tool: string; argsSummary?: string; success?: boolean; contentSummary?: string }>;
  /** 可选：目标 flow 的 root 或 Selector 片段，便于生成与现有树一致的 node */
  targetFlowSlice?: string;
};

export type RunEvolutionInsertTreeParams = {
  config: RzeclawConfig;
  workspace: string;
  libraryPath: string;
  context: EvolutionContext;
  sessionId?: string;
  flowId?: string;
};

export type RunEvolutionInsertTreeResult =
  | { success: true; toolName: string; flowId: string; appliedCount: number }
  | { success: false; stage: string; error: string };

/** §6.1 LLM 输出 Schema */
export type EvolutionLLMOutput = {
  toolName: string;
  description: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
  script: string;
  testScript?: string | null;
  btNode: {
    type: "Action";
    id?: string;
    tool: string;
    args: Record<string, unknown>;
  };
};

function getInsertTreeConfig(config: RzeclawConfig): InsertTreeConfig | undefined {
  return config.evolution?.insertTree;
}
type InsertTreeConfig = NonNullable<RzeclawConfig["evolution"]>["insertTree"];

export function getEvolvedSkillsDir(config: RzeclawConfig): string {
  return config.evolution?.insertTree?.evolvedSkillsDir ?? DEFAULT_EVOLVED_DIR;
}

export function getSandboxTimeoutMs(config: RzeclawConfig): number {
  const ms = config.evolution?.insertTree?.sandboxTimeoutMs;
  return typeof ms === "number" && ms > 0 ? ms : DEFAULT_SANDBOX_TIMEOUT_MS;
}

/** 校验 toolName 仅 [a-z0-9_] */
export function isValidToolName(name: string): boolean {
  return /^[a-z0-9_]+$/.test(name) && name.length > 0;
}

/** 进化工具最终注册名（加前缀避免与既有 skill 冲突） */
export function evolvedToolName(toolName: string): string {
  if (toolName.startsWith(EVOLVED_PREFIX)) return toolName;
  return EVOLVED_PREFIX + toolName;
}

/** WO-BT-024 可选：从 workspace 的 op-log + 传入的 session 信息组装 EvolutionContext */
export type AssembleEvolutionContextOptions = {
  sessionSummary?: string;
  lastN?: number;
  targetFlowSlice?: string;
  /** 若同时传 config 与 libraryPath，且配置了 targetFlowId，则从流程库取目标 flow 的 root 作为 targetFlowSlice */
  config?: RzeclawConfig;
  libraryPath?: string;
};

export async function assembleEvolutionContextFromWorkspace(
  workspace: string,
  options: AssembleEvolutionContextOptions
): Promise<EvolutionContext> {
  const lastN = options.lastN ?? 30;
  const entries = await readLastNEntries(workspace, lastN);
  const toolOps = entries.map((e: OpLogEntry) => ({
    tool: e.tool,
    argsSummary: JSON.stringify(e.args).slice(0, 200),
    success: e.result_ok,
    contentSummary: e.result_summary?.slice(0, 150),
  }));
  let targetFlowSlice = options.targetFlowSlice;
  if (options.config && options.libraryPath && getInsertTreeConfig(options.config)?.targetFlowId) {
    const flowId = getInsertTreeConfig(options.config)!.targetFlowId!;
    const flow = await getFlow(workspace, options.libraryPath, flowId);
    if (flow && isBTFlow(flow)) {
      targetFlowSlice = JSON.stringify(flow.root, null, 2).slice(0, 2000);
    }
  }
  return {
    sessionSummary: options.sessionSummary ?? "",
    toolOps,
    targetFlowSlice,
  };
}

/** WO-BT-024 可选：是否满足「可进化建议」条件（配置开启、最近有工具调用、无高风险 op 若未允许） */
export async function canSuggestEvolution(
  config: RzeclawConfig,
  workspace: string
): Promise<boolean> {
  const cfg = getInsertTreeConfig(config);
  if (!cfg?.enabled || !cfg.targetFlowId) return false;
  const lastN = 20;
  const entries = await readLastNEntries(workspace, lastN);
  if (entries.length === 0) return false;
  if (cfg.allowHighRiskOp !== true) {
    const hasHigh = entries.some((e) => e.risk_level === "high");
    if (hasHigh) return false;
  }
  return true;
}

const EVOLUTION_SYSTEM_PROMPT = `You are a tool extractor. Given a successful execution trace (session summary and tool calls), output exactly one JSON object and nothing else. No markdown, no explanation.
The JSON must have: toolName (only [a-z0-9_]), description, inputSchema (object with properties/required), script (single Node.js script body, runnable with node script.js [args]), optional testScript (Node.js test; exit 0 = pass), btNode (type "Action", tool same as toolName, args object).
Output only the JSON.`;

function buildEvolutionUserPrompt(context: EvolutionContext): string {
  let s = `Session summary:\n${context.sessionSummary || "(none)"}\n\nTool calls:\n`;
  for (const op of context.toolOps) {
    s += `- ${op.tool}: ${op.argsSummary ?? ""} success=${op.success ?? "?"} ${op.contentSummary ?? ""}\n`;
  }
  if (context.targetFlowSlice) s += `\nTarget flow fragment (match this style for btNode):\n${context.targetFlowSlice}\n`;
  s += "\nProduce one JSON object: { toolName, description, inputSchema, script, testScript?, btNode }.";
  return s;
}

function parseAndValidateLLMOutput(raw: string): EvolutionLLMOutput | string {
  let jsonStr = raw.trim();
  const codeMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeMatch) jsonStr = codeMatch[1].trim();
  let data: unknown;
  try {
    data = JSON.parse(jsonStr);
  } catch (e) {
    return `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`;
  }
  if (data == null || typeof data !== "object") return "Output is not an object";
  const o = data as Record<string, unknown>;
  const toolName = o.toolName;
  const script = o.script;
  const btNode = o.btNode;
  const inputSchema = o.inputSchema;
  if (typeof toolName !== "string" || !isValidToolName(toolName))
    return "toolName must be non-empty [a-z0-9_]";
  if (typeof script !== "string" || !script.trim()) return "script is required and non-empty";
  if (inputSchema == null || typeof inputSchema !== "object" || (inputSchema as { type?: string }).type !== "object")
    return "inputSchema must be { type: 'object', properties?, required? }";
  if (btNode == null || typeof btNode !== "object") return "btNode is required";
  const bn = btNode as Record<string, unknown>;
  if (bn.type !== "Action" || typeof bn.tool !== "string") return "btNode must be type Action with tool string";
  if (bn.tool !== toolName) return "btNode.tool must equal toolName";
  const testScript = o.testScript;
  if (testScript !== undefined && testScript !== null && typeof testScript !== "string")
    return "testScript must be string or null";
  if (typeof testScript === "string" && !testScript.trim()) return "testScript if present must be non-empty";
  return {
    toolName,
    description: typeof o.description === "string" ? o.description : "",
    inputSchema: inputSchema as EvolutionLLMOutput["inputSchema"],
    script: script.trim(),
    testScript: testScript === null || testScript === undefined ? undefined : String(testScript).trim() || undefined,
    btNode: {
      type: "Action",
      id: typeof bn.id === "string" ? bn.id : undefined,
      tool: bn.tool as string,
      args: bn.args != null && typeof bn.args === "object" ? (bn.args as Record<string, unknown>) : {},
    },
  };
}

/** 沙盒内执行 test.js；超时或 exit !== 0 为失败 */
async function runSandboxTest(
  sandboxDir: string,
  timeoutMs: number
): Promise<{ passed: boolean; stderr?: string; stdout?: string }> {
  return new Promise((resolve) => {
    const child = spawn("node", ["test.js"], {
      cwd: sandboxDir,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (c) => { stdout += String(c); });
    child.stderr?.on("data", (c) => { stderr += String(c); });
    const t = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({ passed: false, stderr: "timeout", stdout });
    }, timeoutMs);
    child.on("close", (code) => {
      clearTimeout(t);
      resolve({ passed: code === 0, stdout, stderr });
    });
    child.on("error", (err) => {
      clearTimeout(t);
      resolve({ passed: false, stderr: err.message, stdout });
    });
  });
}

/**
 * WO-BT-024 管线入口：校验 → LLM 生成 → 沙盒 → 写入 evolved_skills → 插入树 → 审计。
 */
export async function runEvolutionInsertTree(
  params: RunEvolutionInsertTreeParams
): Promise<RunEvolutionInsertTreeResult> {
  const { config, workspace, libraryPath, context, sessionId, flowId } = params;
  const insertCfg = getInsertTreeConfig(config);
  if (!insertCfg?.enabled) {
    return { success: false, stage: "config", error: "evolution.insertTree is not enabled" };
  }
  const targetFlowId = insertCfg.targetFlowId?.trim();
  if (!targetFlowId) {
    return { success: false, stage: "config", error: "evolution.insertTree.targetFlowId is required" };
  }

  const audit = async (detail: string) => {
    await appendAudit(workspace, libraryPath, {
      op: "evolutionInsertTree",
      flowId: targetFlowId,
      actor: ACTOR,
      ts: new Date().toISOString(),
      detail,
    });
  };

  if (!context?.toolOps?.length) {
    await audit("failure; stage=input; error=context.toolOps empty or missing");
    return { success: false, stage: "input", error: "context.toolOps is required and must not be empty" };
  }

  await audit(`start; sessionId=${sessionId ?? ""}`);

  const maxRetries = insertCfg.maxRetries ?? 0;
  const timeoutMs = getSandboxTimeoutMs(config);
  const evolvedDir = join(workspace, getEvolvedSkillsDir(config));
  const finalToolName = (raw: string) => evolvedToolName(raw);

  let parsed: EvolutionLLMOutput | string | null = null;
  for (let attempt = 0; attempt <= maxRetries + 1; attempt++) {
    try {
      const client = getLLMClient(config);
      const response = await client.createMessage({
        system: EVOLUTION_SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildEvolutionUserPrompt(context) }],
        max_tokens: 4096,
      });
      const lastBlock = response.content[response.content.length - 1];
      const text =
        lastBlock?.type === "text"
          ? (lastBlock as { text?: string }).text ?? ""
          : response.content.map((c) => (c as { text?: string }).text).filter(Boolean).join("");
      parsed = parseAndValidateLLMOutput(text);
      if (typeof parsed === "object") break;
    } catch (e) {
      parsed = e instanceof Error ? e.message : String(e);
    }
    if (attempt <= maxRetries && typeof parsed === "string") {
      await audit(`retry; stage=llm; attempt=${attempt}; error=${parsed}`);
      continue;
    }
    await audit(`failure; stage=llm; error=${typeof parsed === "string" ? parsed : "parse failed"}`);
    return {
      success: false,
      stage: "llm",
      error: typeof parsed === "string" ? parsed : "LLM output validation failed",
    };
  }

  if (parsed == null || typeof parsed === "string") {
    await audit("failure; stage=llm; error=no valid output");
    return { success: false, stage: "llm", error: "No valid EvolutionLLMOutput" };
  }

  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const sandboxDir = join(workspace, SANDBOX_DIR, runId);
  await mkdir(sandboxDir, { recursive: true });
  await writeFile(join(sandboxDir, "script.js"), parsed.script, "utf-8");
  const hasTest = parsed.testScript && parsed.testScript.length > 0;
  if (hasTest) {
    await writeFile(join(sandboxDir, "test.js"), parsed.testScript!, "utf-8");
    const sandboxResult = await runSandboxTest(sandboxDir, timeoutMs);
    if (!sandboxResult.passed) {
      await audit(`failure; stage=sandbox; error=${sandboxResult.stderr ?? "exit non-zero"}`);
      return {
        success: false,
        stage: "sandbox",
        error: sandboxResult.stderr ?? "Test script did not exit 0",
      };
    }
  }

  const name = finalToolName(parsed.toolName);
  await mkdir(evolvedDir, { recursive: true });
  const scriptFileName = `${name}.js`;
  const jsonFileName = `${name}.json`;
  await writeFile(join(evolvedDir, scriptFileName), parsed.script, "utf-8");
  const skillJson = {
    name,
    description: parsed.description,
    inputSchema: parsed.inputSchema,
    scriptPath: `./${scriptFileName}`,
  };
  await writeFile(join(evolvedDir, jsonFileName), JSON.stringify(skillJson, null, 2), "utf-8");

  const flow = await getFlow(workspace, libraryPath, targetFlowId);
  if (!flow || !isBTFlow(flow)) {
    await audit("failure; stage=insertTree; error=flow not found or not BT");
    return { success: false, stage: "insertTree", error: "Flow not found or not BT" };
  }
  const parentNodeId = insertCfg.targetSelectorNodeId?.trim() ?? "root";
  const insertNode: BTNode = {
    ...parsed.btNode,
    tool: name,
  };
  const applyResult = await applyEditOps(
    workspace,
    libraryPath,
    targetFlowId,
    [{ op: "insertNode", parentNodeId, position: 0, node: insertNode }],
    { actor: ACTOR }
  );
  if (!applyResult.success) {
    await audit(`failure; stage=insertTree; error=${applyResult.error ?? "applyEditOps failed"}`);
    return {
      success: false,
      stage: "insertTree",
      error: applyResult.error ?? "applyEditOps failed",
    };
  }

  await audit(`success; toolName=${name}; flowId=${targetFlowId}; appliedCount=${applyResult.appliedCount}`);
  return {
    success: true,
    toolName: name,
    flowId: targetFlowId,
    appliedCount: applyResult.appliedCount,
  };
}

export { EVOLVED_PREFIX };
