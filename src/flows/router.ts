/**
 * Phase 13 WO-BT-003/016: 路由。基于 extractTaskHint + routes 表；同一 hint 多候选时按成功率优选（WO-BT-016）。
 */

import { extractTaskHint } from "../memory/task-hint.js";
import type { FlowsRouteEntry, FlowsSlotRule } from "../config.js";
import type { FlowDef } from "./types.js";
import type { FlowSuccessRate } from "./outcomes.js";

export type MatchFlowContext = {
  routes: FlowsRouteEntry[];
  flowLibrary: Map<string, FlowDef>;
  /** WO-BT-016: 可选；同一 hint 对应多 flowId 时按此排序优选 */
  successRates?: Map<string, FlowSuccessRate>;
};

export type MatchFlowResult = {
  flowId: string;
  params: Record<string, string>;
};

function normalizeHint(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

function matchHint(extracted: string, routeHint: string): boolean {
  if (!extracted) return false;
  const a = normalizeHint(extracted);
  const b = normalizeHint(routeHint);
  return a === b || a.includes(b) || b.includes(a);
}

function applySlotRules(message: string, slotRules: FlowsSlotRule[] | undefined): Record<string, string> {
  const params: Record<string, string> = {};
  if (!slotRules?.length) return params;
  for (const { name, pattern } of slotRules) {
    try {
      const re = new RegExp(pattern, "u");
      const m = message.match(re);
      if (m) {
        const value = (m[1] ?? m[0])?.trim() ?? "";
        if (value) params[name] = value;
      }
    } catch {
      // invalid regex: skip this rule
    }
  }
  return params;
}

function successRate(rate: FlowSuccessRate): number {
  const total = rate.successCount + rate.failCount;
  return total === 0 ? 0 : rate.successCount / total;
}

/**
 * 若 message 匹配某条 route（hint 匹配且 flowId 在库中存在），返回 { flowId, params }；否则 null。
 * 同一 hint 多条 route 时，若提供 successRates 则按成功率降序优选，否则取第一条。
 */
export function matchFlow(message: string, context: MatchFlowContext): MatchFlowResult | null {
  const { routes, flowLibrary, successRates } = context;
  if (!routes?.length) return null;
  const hint = extractTaskHint(message);
  const matching: FlowsRouteEntry[] = [];
  for (const route of routes) {
    if (!matchHint(hint, route.hint)) continue;
    if (!flowLibrary.has(route.flowId)) continue;
    matching.push(route);
  }
  if (matching.length === 0) return null;
  let chosen = matching[0]!;
  if (matching.length > 1 && successRates) {
    const sorted = [...matching].sort((a, b) => {
      const ra = successRates.get(a.flowId);
      const rb = successRates.get(b.flowId);
      const scoreA = ra ? successRate(ra) : 0;
      const scoreB = rb ? successRate(rb) : 0;
      return scoreB - scoreA;
    });
    chosen = sorted[0]!;
  }
  const params = applySlotRules(message, chosen.slotRules);
  return { flowId: chosen.flowId, params };
}
