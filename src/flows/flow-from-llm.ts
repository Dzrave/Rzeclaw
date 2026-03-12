/**
 * Phase 13 WO-BT-014: LLM 触发生成 flow。用户一句话 → LLM 输出生成请求（intent + steps + hint）→ 转 spec → createFlow(spec)。
 * 与 BEHAVIOR_TREE_AND_STATE_MACHINE_DESIGN.md §7.3、§十 一致。
 */

import type { RzeclawConfig } from "../config.js";
import { getLLMClient } from "../llm/index.js";
import type { BTFlowDef, BTNode } from "./types.js";
import { createFlow, appendAudit, listFlows } from "./crud.js";

const ACTOR = "wo_bt_014";

/** LLM 输出的「生成请求」结构（§7.3） */
export type GenerateRequest = {
  intent: string;
  steps: string[];
  hint?: string;
};

const DEFAULT_TRIGGER_REGEX = /做一个[\s\u4e00-\u9fa5a-zA-Z0-9_]+(流程|工作流)|帮我?做(一个)?\s*.+(流程|工作流)/;

/** 检测用户消息是否为「显式请求生成流程」 */
export function isExplicitGenerateFlowRequest(
  message: string,
  triggerPattern?: string
): boolean {
  const trimmed = message.trim();
  if (!trimmed) return false;
  if (triggerPattern) {
    try {
      const re = new RegExp(triggerPattern, "i");
      return re.test(trimmed);
    } catch {
      return trimmed.includes(triggerPattern);
    }
  }
  return DEFAULT_TRIGGER_REGEX.test(trimmed);
}

/** 从 intent 生成合法 flowId（字母数字下划线） */
function flowIdFromIntent(intent: string): string {
  const s = intent
    .replace(/\s+/g, "_")
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9_]/g, "")
    .slice(0, 60);
  if (!s) return "generated_flow";
  return s || "generated_flow";
}

/** 从生成请求构建 BTFlowDef：root 为 Sequence，每步对应一个 Action(bash, command)。 */
export function specFromGenerateRequest(req: GenerateRequest): BTFlowDef {
  const flowId = flowIdFromIntent(req.intent);
  const children: BTNode[] = req.steps.slice(0, 20).map((step, i) => ({
    type: "Action",
    id: `step_${i}`,
    tool: "bash",
    args: { command: step },
  }));
  const root: BTNode = { type: "Sequence", id: "root", children };
  return {
    id: flowId,
    version: "1",
    type: "bt",
    root,
  };
}

/** 从 LLM 回复文本中解析 JSON 生成请求（支持 ```json ... ``` 包裹） */
export function parseGenerateRequestFromLLM(text: string): GenerateRequest | null {
  const trimmed = text.trim();
  let raw = trimmed;
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) raw = fence[1].trim();
  try {
    const o = JSON.parse(raw) as unknown;
    if (o == null || typeof o !== "object") return null;
    const obj = o as Record<string, unknown>;
    const intent = obj.intent;
    const steps = obj.steps;
    if (typeof intent !== "string" || !Array.isArray(steps)) return null;
    const stepStrings = steps.filter((s): s is string => typeof s === "string");
    const hint = obj.hint;
    return {
      intent,
      steps: stepStrings,
      hint: typeof hint === "string" ? hint : undefined,
    };
  } catch {
    return null;
  }
}

const SYSTEM_PROMPT = `你是一个流程生成助手。用户会描述想要完成的流程或任务，你需要输出一个**生成请求** JSON，且仅输出该 JSON，不要其他解释。
格式（严格遵循）：
{
  "intent": "简短意图描述，如：每日备份",
  "steps": ["步骤1 的命令或描述", "步骤2", ...],
  "hint": "可选，用于路由匹配的短语，如：备份、每日备份"
}
要求：
- intent 和 steps 必填；steps 为字符串数组，每项可为一句话描述或 shell 命令。
- hint 用于后续用户说类似话时匹配该流程，宜简短。
- 若用户描述含糊，steps 可先写概括性步骤，后续可再编辑流程。`;

export type RunLLMGenerateFlowParams = {
  config: RzeclawConfig;
  workspace: string;
  libraryPath: string;
  userMessage: string;
  /** 已有 flowId 列表，供 LLM 避免重复或参考命名 */
  existingFlowIds?: string[];
};

export type RunLLMGenerateFlowResult =
  | { success: true; flowId: string; version: string; hint: string }
  | { success: false; error: string; stage: string };

/**
 * WO-BT-014 主管道：组 prompt → 调 LLM → 解析生成请求 → specFromGenerateRequest → createFlow。
 */
export async function runLLMGenerateFlow(
  params: RunLLMGenerateFlowParams
): Promise<RunLLMGenerateFlowResult> {
  const { config, workspace, libraryPath, userMessage, existingFlowIds = [] } = params;
  const client = getLLMClient(config);
  const existing = existingFlowIds.length > 0 ? `现有流程 ID：${existingFlowIds.join(", ")}。请勿重复 id。` : "";

  const userPrompt = `${existing ? existing + "\n\n" : ""}用户说：${userMessage}`;

  try {
    const response = await client.createMessage({
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });
    const text = response.content
      ?.filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("");
    if (!text?.trim()) {
      return { success: false, error: "LLM 未返回有效内容", stage: "llm_response" };
    }
    const req = parseGenerateRequestFromLLM(text);
    if (!req) {
      return { success: false, error: "无法解析为生成请求 JSON", stage: "parse" };
    }
    const spec = specFromGenerateRequest(req);
    const { flowId, version } = await createFlow(workspace, libraryPath, spec, {
      actor: ACTOR,
    });
    await appendAudit(workspace, libraryPath, {
      op: "createFlow",
      flowId,
      actor: ACTOR,
      ts: new Date().toISOString(),
      detail: `wo_bt_014 intent=${req.intent} hint=${req.hint ?? ""}`,
    });
    return {
      success: true,
      flowId,
      version,
      hint: req.hint ?? req.intent.slice(0, 30),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg, stage: "create" };
  }
}

/**
 * 判断当前是否应尝试「用 LLM 生成 flow」：无匹配且配置允许（显式请求 或 triggerOnNoMatch）。
 */
export function shouldTryLLMGenerateFlow(
  config: RzeclawConfig,
  message: string,
  routeMatched: boolean
): boolean {
  const gf = config.flows?.generateFlow;
  if (!gf?.enabled || !config.flows?.libraryPath) return false;
  if (routeMatched) return false;
  if (isExplicitGenerateFlowRequest(message, gf.triggerPattern)) return true;
  return gf.triggerOnNoMatch === true;
}
