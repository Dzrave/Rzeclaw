/**
 * Phase 13 WO-BT-025: 流程库 CRUD + applyEditOps。创建、读、替换、删除、归档、列表与结构化编辑；校验、审计。
 */

import { readFile, writeFile, mkdir, unlink, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { FlowDef, BTFlowDef, BTNode } from "./types.js";
import { isBTFlow } from "./types.js";
import { loadFlowLibrary, parseOneFlow } from "./loader.js";
import { getFlowMetaMap } from "./meta.js";

const FLOW_FILE_SUFFIX = ".json";
const AUDIT_FILENAME = "audit.jsonl";

function flowFilePath(workspace: string, libraryPath: string, flowId: string): string {
  const safeId = flowId.replace(/[/\\]/g, "").trim();
  if (!safeId) throw new Error("flowId is empty");
  return join(workspace, libraryPath, `${safeId}${FLOW_FILE_SUFFIX}`);
}

function auditPath(workspace: string, libraryPath: string): string {
  return join(workspace, libraryPath, AUDIT_FILENAME);
}

/** WO-BT-018/024: 供失败替换与进化管线写入审计 */
export async function appendAudit(
  workspace: string,
  libraryPath: string,
  entry: { op: string; flowId: string; actor?: string; ts: string; detail?: string }
): Promise<void> {
  const dir = join(workspace, libraryPath);
  await mkdir(dir, { recursive: true });
  const line = JSON.stringify(entry) + "\n";
  const path = auditPath(workspace, libraryPath);
  try {
    await writeFile(path, line, { flag: "a", encoding: "utf-8" });
  } catch {
    // 审计失败不阻断主流程
  }
}

/** 使用 loader 的解析逻辑校验并返回 FlowDef；非法则抛错 */
function validateAndParse(content: string, virtualPath: string): FlowDef {
  return parseOneFlow(virtualPath, content);
}

export type CreateFlowResult = { flowId: string; version: string };
export type CreateFlowOptions = { actor?: string };

/**
 * 创建新 flow：校验 spec 后写入 flowId.json。
 */
export async function createFlow(
  workspace: string,
  libraryPath: string,
  spec: FlowDef,
  options?: CreateFlowOptions
): Promise<CreateFlowResult> {
  validateAndParse(JSON.stringify(spec), "(createFlow)");
  const dir = join(workspace, libraryPath);
  await mkdir(dir, { recursive: true });
  const flowId = spec.id.trim();
  const filePath = flowFilePath(workspace, libraryPath, flowId);
  const version = (spec as { version?: string }).version ?? "1";
  await writeFile(filePath, JSON.stringify(spec, null, 2), "utf-8");
  await appendAudit(workspace, libraryPath, {
    op: "createFlow",
    flowId,
    actor: options?.actor,
    ts: new Date().toISOString(),
    detail: `type=${spec.type}`,
  });
  return { flowId, version };
}

/**
 * 按 flowId 读取当前版本 flow；不存在或解析失败返回 null。
 */
export async function getFlow(
  workspace: string,
  libraryPath: string,
  flowId: string
): Promise<FlowDef | null> {
  const filePath = flowFilePath(workspace, libraryPath, flowId);
  try {
    const content = await readFile(filePath, "utf-8");
    return validateAndParse(content, filePath);
  } catch {
    return null;
  }
}

export type ReplaceFlowOptions = { actor?: string };

/**
 * 全量替换 flow：校验 newDef 且 newDef.id === flowId 后写入。
 */
export async function replaceFlow(
  workspace: string,
  libraryPath: string,
  flowId: string,
  newDef: FlowDef,
  options?: ReplaceFlowOptions
): Promise<boolean> {
  if (newDef.id.trim() !== flowId) return false;
  validateAndParse(JSON.stringify(newDef), "(replaceFlow)");
  const filePath = flowFilePath(workspace, libraryPath, flowId);
  await mkdir(join(workspace, libraryPath), { recursive: true });
  await writeFile(filePath, JSON.stringify(newDef, null, 2), "utf-8");
  await appendAudit(workspace, libraryPath, {
    op: "replaceFlow",
    flowId,
    actor: options?.actor,
    ts: new Date().toISOString(),
  });
  return true;
}

/**
 * 从流程库删除 flow 文件。
 */
export async function deleteFlow(
  workspace: string,
  libraryPath: string,
  flowId: string,
  options?: { actor?: string }
): Promise<boolean> {
  const filePath = flowFilePath(workspace, libraryPath, flowId);
  try {
    await unlink(filePath);
    await appendAudit(workspace, libraryPath, {
      op: "deleteFlow",
      flowId,
      actor: options?.actor,
      ts: new Date().toISOString(),
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * 软删除：将 flow 标记为已归档，加载时跳过。
 */
export async function archiveFlow(
  workspace: string,
  libraryPath: string,
  flowId: string,
  options?: { actor?: string }
): Promise<boolean> {
  const flow = await getFlow(workspace, libraryPath, flowId);
  if (!flow) return false;
  const meta = { ...(flow as { meta?: Record<string, unknown> }).meta, archived: true };
  const updated = { ...flow, meta } as FlowDef;
  await replaceFlow(workspace, libraryPath, flowId, updated, options);
  await appendAudit(workspace, libraryPath, {
    op: "archiveFlow",
    flowId,
    actor: options?.actor,
    ts: new Date().toISOString(),
  });
  return true;
}

export type ListFlowsEntry = {
  flowId: string;
  type: "bt" | "fsm";
  version?: string;
  meta?: { successCount?: number; failCount?: number; lastUsed?: string; archived?: boolean; flaggedForReplacement?: boolean };
};
export type ListFlowsOptions = { includeArchived?: boolean };

/**
 * 列出流程库中的 flow（不含 meta.json）；默认排除已归档。includeArchived 时自行读目录解析以包含已归档。
 */
export async function listFlows(
  workspace: string,
  libraryPath: string,
  options?: ListFlowsOptions
): Promise<ListFlowsEntry[]> {
  const includeArchived = options?.includeArchived === true;
  if (includeArchived) {
    const dir = join(workspace, libraryPath);
    const result: ListFlowsEntry[] = [];
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return [];
    }
    const skip = new Set([AUDIT_FILENAME, "meta.json", "outcomes.jsonl"]);
    const metaMap = await getFlowMetaMap(workspace, libraryPath);
    for (const file of entries) {
      if (!file.endsWith(FLOW_FILE_SUFFIX) || file.includes(" ") || skip.has(file)) continue;
      const filePath = join(dir, file);
      try {
        const content = await readFile(filePath, "utf-8");
        const f = validateAndParse(content, filePath);
        const flowId = f.id.trim();
        const fromFile = (f as { meta?: ListFlowsEntry["meta"] }).meta;
        const fromMeta = metaMap[flowId];
        const meta: ListFlowsEntry["meta"] = {
          ...fromFile,
          ...(fromMeta && {
            successCount: fromMeta.successCount,
            failCount: fromMeta.failCount,
            lastUsed: fromMeta.lastUsed,
            flaggedForReplacement: fromMeta.flaggedForReplacement,
          }),
        };
        result.push({ flowId, type: f.type, version: (f as { version?: string }).version, meta });
      } catch {
        // skip invalid
      }
    }
    return result;
  }
  const { flows } = await loadFlowLibrary(workspace, libraryPath);
  const metaMap = await getFlowMetaMap(workspace, libraryPath);
  return Array.from(flows.entries()).map(([id, f]) => {
    const fromFile = (f as { meta?: ListFlowsEntry["meta"] }).meta;
    const fromMeta = metaMap[id];
    const meta: ListFlowsEntry["meta"] = {
      ...fromFile,
      ...(fromMeta && {
        successCount: fromMeta.successCount,
        failCount: fromMeta.failCount,
        lastUsed: fromMeta.lastUsed,
        flaggedForReplacement: fromMeta.flaggedForReplacement,
      }),
    };
    return { flowId: id, type: f.type, version: (f as { version?: string }).version, meta };
  });
}

// ---------- BT 编辑：id 规范化与按 id 查找 ----------

const ROOT_ID = "root";

function hasChildren(node: BTNode): node is BTNode & { children: BTNode[] } {
  return "children" in node && Array.isArray((node as { children?: BTNode[] }).children);
}

function setNodeId(node: BTNode, id: string): void {
  (node as { id?: string }).id = id;
}

function getNodeId(node: BTNode): string | undefined {
  return (node as { id?: string }).id;
}

/** 为 BT 树递归分配 id（root=root，子节点 n0,n1,...）；原地修改 */
function normalizeBTNodeIds(node: BTNode, prefix: string): void {
  setNodeId(node, getNodeId(node) ?? prefix);
  if (hasChildren(node)) {
    node.children.forEach((child, i) => normalizeBTNodeIds(child, `${prefix}_${i}`));
  }
}

/** 在 BT 树中按 id 查找节点；返回 [父节点或 null（表示即 root）, 节点本身] */
function findBTNodeById(root: BTNode, nodeId: string): [BTNode | null, BTNode] | null {
  if (getNodeId(root) === nodeId) return [null, root];
  if (hasChildren(root)) {
    for (const child of root.children) {
      if (getNodeId(child) === nodeId) return [root, child];
      const found = findBTNodeById(child, nodeId);
      if (found) return found;
    }
  }
  return null;
}

function getNodeById(root: BTNode, nodeId: string): BTNode | null {
  const f = findBTNodeById(root, nodeId);
  return f ? f[1] : null;
}

function cloneBTNode(node: BTNode): BTNode {
  if (hasChildren(node)) {
    return { ...node, children: node.children.map(cloneBTNode) } as BTNode;
  }
  return { ...node };
}

/** 轻量校验：无悬空引用、Control 有 children；不校验 tool 名（getMergedTools 在运行时） */
function validateBTStructure(node: BTNode): boolean {
  if (hasChildren(node)) {
    if (!Array.isArray(node.children) || node.children.length === 0) return false;
    return node.children.every(validateBTStructure);
  }
  return true;
}

export type EditOp =
  | { op: "insertNode"; parentNodeId: string; position: number; node: BTNode }
  | { op: "removeNode"; nodeId: string }
  | { op: "replaceSubtree"; nodeId: string; newSubtree: BTNode }
  | { op: "reorderChildren"; parentNodeId: string; order: string[] }
  | { op: "wrapWithDecorator"; nodeId: string; decoratorType: string };

export type ApplyEditOpsResult = { success: boolean; appliedCount: number; error?: string };
export type ApplyEditOpsOptions = { actor?: string };

/**
 * 对 BT flow 按序应用编辑操作；任一步失败则中止并返回错误；全部成功则持久化并写审计。
 */
export async function applyEditOps(
  workspace: string,
  libraryPath: string,
  flowId: string,
  ops: EditOp[],
  options?: ApplyEditOpsOptions
): Promise<ApplyEditOpsResult> {
  const flow = await getFlow(workspace, libraryPath, flowId);
  if (!flow) return { success: false, appliedCount: 0, error: "flow not found" };
  if (!isBTFlow(flow)) return { success: false, appliedCount: 0, error: "flow is not BT" };
  let root = cloneBTNode(flow.root);
  normalizeBTNodeIds(root, ROOT_ID);
  let applied = 0;
  for (const op of ops) {
    if (op.op === "insertNode") {
      const parent = getNodeById(root, op.parentNodeId);
      if (!parent) return { success: false, appliedCount: applied, error: `parent not found: ${op.parentNodeId}` };
      if (!hasChildren(parent))
        return { success: false, appliedCount: applied, error: `parent is not Control: ${op.parentNodeId}` };
      const newChild = cloneBTNode(op.node);
      setNodeId(newChild, getNodeId(op.node) ?? `n_${Date.now()}_${applied}`);
      const pos = Math.max(0, Math.min(op.position, parent.children.length));
      parent.children.splice(pos, 0, newChild);
      applied++;
      continue;
    }
    if (op.op === "removeNode") {
      if (op.nodeId === ROOT_ID)
        return { success: false, appliedCount: applied, error: "cannot remove root" };
      const found = findBTNodeById(root, op.nodeId);
      if (!found) return { success: false, appliedCount: applied, error: `node not found: ${op.nodeId}` };
      const [parent, node] = found;
      if (!parent) return { success: false, appliedCount: applied, error: "node is root" };
      if (!hasChildren(parent)) return { success: false, appliedCount: applied, error: "parent has no children" };
      const idx = parent.children.indexOf(node);
      if (idx >= 0) parent.children.splice(idx, 1);
      applied++;
      continue;
    }
    if (op.op === "replaceSubtree") {
      const found = findBTNodeById(root, op.nodeId);
      if (!found) return { success: false, appliedCount: applied, error: `node not found: ${op.nodeId}` };
      const [parent, node] = found;
      const newSub = cloneBTNode(op.newSubtree);
      normalizeBTNodeIds(newSub, getNodeId(newSub) ?? op.nodeId);
      if (parent === null) root = newSub;
      else if (hasChildren(parent)) {
        const i = parent.children.indexOf(node);
        if (i >= 0) parent.children[i] = newSub;
      }
      applied++;
      continue;
    }
    if (op.op === "reorderChildren") {
      const parent = getNodeById(root, op.parentNodeId);
      if (!parent) return { success: false, appliedCount: applied, error: `parent not found: ${op.parentNodeId}` };
      if (!hasChildren(parent))
        return { success: false, appliedCount: applied, error: `not a Control: ${op.parentNodeId}` };
      const idToNode = new Map<string, BTNode>();
      for (const c of parent.children) idToNode.set(getNodeId(c) ?? "", c);
      const ordered: BTNode[] = [];
      for (const id of op.order) {
        const n = idToNode.get(id);
        if (n) ordered.push(n);
      }
      if (ordered.length !== parent.children.length)
        return { success: false, appliedCount: applied, error: "reorder order does not match children" };
      parent.children = ordered;
      applied++;
      continue;
    }
    if (op.op === "wrapWithDecorator") {
      const found = findBTNodeById(root, op.nodeId);
      if (!found) return { success: false, appliedCount: applied, error: `node not found: ${op.nodeId}` };
      const [parent, node] = found;
      const wrapper: BTNode = {
        type: "Sequence",
        id: `wrap_${op.nodeId}`,
        children: [node],
      };
      if (parent === null) root = wrapper;
      else if (hasChildren(parent)) {
        const i = parent.children.indexOf(node);
        if (i >= 0) parent.children[i] = wrapper;
      }
      applied++;
      continue;
    }
  }
  if (!validateBTStructure(root)) return { success: false, appliedCount: applied, error: "validation failed" };
  const updated: BTFlowDef = { ...flow, root };
  await replaceFlow(workspace, libraryPath, flowId, updated, options);
  await appendAudit(workspace, libraryPath, {
    op: "applyEditOps",
    flowId,
    actor: options?.actor,
    ts: new Date().toISOString(),
    detail: `applied=${applied} ops=${ops.length}`,
  });
  return { success: true, appliedCount: applied };
}
