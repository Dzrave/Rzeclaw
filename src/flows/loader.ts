/**
 * Phase 13 WO-BT-002: 流程库加载。从 workspace/<libraryPath> 读取 JSON，解析为 FlowDef，校验 id/type/root|states。
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FlowDef, BTFlowDef, FSMFlowDef, BTNode } from "./types.js";

const FLOW_FILE_SUFFIX = ".json";

function validateBTNode(node: unknown): node is BTNode {
  if (node == null || typeof node !== "object") return false;
  const n = node as Record<string, unknown>;
  const t = n.type as string;
  if (t === "Sequence" || t === "Selector" || t === "Fallback") {
    if (!Array.isArray(n.children)) return false;
    return (n.children as unknown[]).every(validateBTNode);
  }
  if (t === "Action") {
    return typeof n.tool === "string" && n.args != null && typeof n.args === "object";
  }
  if (t === "Condition") {
    const pred = n.predicate as string;
    if (pred === "fileExists") return typeof n.path === "string";
    if (pred === "env") return typeof n.key === "string";
    return false;
  }
  if (t === "FSM") return typeof n.fsmId === "string";
  if (t === "LLM") return true;
  return false;
}

function validateBTFlow(raw: Record<string, unknown>): raw is BTFlowDef {
  if (typeof raw.id !== "string" || raw.id.trim() === "") return false;
  if (raw.type !== "bt") return false;
  if (raw.root == null || typeof raw.root !== "object") return false;
  if (!validateBTNode(raw.root)) return false;
  return true;
}

function validateFSMFlow(raw: Record<string, unknown>): raw is FSMFlowDef {
  if (typeof raw.id !== "string" || raw.id.trim() === "") return false;
  if (raw.type !== "fsm") return false;
  if (typeof raw.initial !== "string") return false;
  if (!Array.isArray(raw.states)) return false;
  for (const s of raw.states as unknown[]) {
    if (s == null || typeof s !== "object" || typeof (s as { id?: unknown }).id !== "string")
      return false;
    const act = (s as { action?: unknown }).action;
    if (act != null && typeof act === "object") {
      const a = act as Record<string, unknown>;
      if ("runFlow" in a && typeof a.runFlow === "string") continue;
      if ("tool" in a && typeof a.tool === "string" && a.args != null && typeof a.args === "object") continue;
      return false;
    }
  }
  if (!Array.isArray(raw.transitions)) return false;
  for (const t of raw.transitions as unknown[]) {
    if (
      t == null ||
      typeof t !== "object" ||
      typeof (t as { from?: unknown }).from !== "string" ||
      typeof (t as { to?: unknown }).to !== "string" ||
      typeof (t as { on?: unknown }).on !== "string"
    )
      return false;
  }
  return true;
}

/** 解析单文件内容为 FlowDef；供 CRUD 校验与加载复用。 */
export function parseOneFlow(filePath: string, content: string): FlowDef {
  let raw: unknown;
  try {
    raw = JSON.parse(content) as unknown;
  } catch (e) {
    throw new Error(`Invalid JSON in ${filePath}: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (raw == null || typeof raw !== "object") {
    throw new Error(`Flow file ${filePath}: root must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.type !== "string") {
    throw new Error(`Flow file ${filePath}: missing or invalid "type" (must be "bt" or "fsm")`);
  }
  if (obj.type === "bt") {
    if (!validateBTFlow(obj)) {
      throw new Error(
        `Flow file ${filePath}: invalid BT flow (need id, type "bt", root with type and children/action)`
      );
    }
    return obj as BTFlowDef;
  }
  if (obj.type === "fsm") {
    if (!validateFSMFlow(obj)) {
      throw new Error(
        `Flow file ${filePath}: invalid FSM flow (need id, type "fsm", initial, states[], transitions[])`
      );
    }
    return obj as FSMFlowDef;
  }
  throw new Error(`Flow file ${filePath}: type must be "bt" or "fsm", got "${obj.type}"`);
}

export type LoadFlowLibraryResult = {
  flows: Map<string, FlowDef>;
  errors: { file: string; error: string }[];
};

/**
 * 从 workspace/<libraryPath> 加载所有 .json 流程文件。
 * 非法 JSON 或缺少字段时在 errors 中记录并跳过该文件，不抛错；返回可用的 flows 与错误列表。
 */
export async function loadFlowLibrary(
  workspace: string,
  libraryPath: string
): Promise<LoadFlowLibraryResult> {
  const dir = join(workspace, libraryPath);
  const flows = new Map<string, FlowDef>();
  const errors: { file: string; error: string }[] = [];

  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { flows, errors: [{ file: dir, error: `Cannot read directory: ${msg}` }] };
  }

  const skipNames = new Set(["meta.json"]);
  const jsonFiles = entries.filter(
    (e) => e.endsWith(FLOW_FILE_SUFFIX) && !e.includes(" ") && !skipNames.has(e)
  );
  for (const file of jsonFiles) {
    const filePath = join(dir, file);
    let content: string;
    try {
      content = await readFile(filePath, "utf-8");
    } catch (e) {
      errors.push({ file: filePath, error: e instanceof Error ? e.message : String(e) });
      continue;
    }
    try {
      const flow = parseOneFlow(filePath, content);
      if ((flow as { meta?: { archived?: boolean } }).meta?.archived === true) continue;
      const id = flow.id.trim();
      if (flows.has(id)) {
        errors.push({ file: filePath, error: `Duplicate flow id: ${id}` });
        continue;
      }
      flows.set(id, flow);
    } catch (e) {
      errors.push({ file: filePath, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return { flows, errors };
}

/**
 * 加载流程库并返回 Map；若有错误可通过 loadFlowLibrary 的返回值获取 errors。
 * 若目录不存在或无有效 flow，返回空 Map。
 */
export async function getFlowLibrary(
  workspace: string,
  libraryPath: string
): Promise<Map<string, FlowDef>> {
  const { flows } = await loadFlowLibrary(workspace, libraryPath);
  return flows;
}
