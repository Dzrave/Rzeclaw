/**
 * Phase 16: 探索层（Exploration Layer）与预案 Planner
 * 工单见 docs/PHASE16_EXPLORATION_WORK_ORDERS.md
 */

import type { RzeclawConfig } from "../config.js";
import type { FlowDef } from "../flows/types.js";
import { buildSnapshotContext } from "./snapshot.js";
import { callPlanner } from "./planner.js";
import { callCritic } from "./critic.js";
import { compilePlanToMessage } from "./compile.js";
import {
  listRecent,
  findBestMatch,
  findBestMatchVector,
  writeEntryWithVector,
  updateReuseCountAsync,
} from "./experience.js";
import { appendTelemetry } from "../retrospective/telemetry.js";

export { shouldSkipExploration, shouldEnterExploration } from "./gatekeeper.js";
export type {
  SnapshotContext,
  PlanStep,
  PlanVariant,
  PlanFallback,
  PlanScore,
  CriticResult,
} from "./types.js";
export { buildSnapshotContext } from "./snapshot.js";
export { callPlanner } from "./planner.js";
export { callCritic } from "./critic.js";
export { compilePlanToMessage } from "./compile.js";

/** 探索层超时默认毫秒（WO-1635） */
const DEFAULT_EXPLORATION_TIMEOUT_MS = 90_000;

/**
 * WO-1604/1626/1632/1633/1635: 执行管道接入点 — 先验扫描 → Planner → Critic → 编译
 * 超时或异常时返回 useExploration: false，由调用方继续 runAgentLoop。
 */
export async function tryExploration(context: {
  config: RzeclawConfig;
  message: string;
  correlationId: string;
  workspace: string;
  sessionId: string;
  matched: { flowId: string; params: Record<string, string> } | null;
  session?: { blackboard?: Record<string, string>; sessionState?: string };
  flowLibrary?: Map<string, FlowDef> | null;
}): Promise<
  | { useExploration: false }
  | { useExploration: true; compiledMessage: string; explorationRecordId?: string }
  | { useExploration: true; fallbackContent: string; explorationRecordId?: string }
> {
  const { config, message, workspace, session, flowLibrary } = context;
  const timeoutMs = config.exploration?.timeoutMs ?? DEFAULT_EXPLORATION_TIMEOUT_MS;

  const run = async (): Promise<
    | { useExploration: false }
    | { useExploration: true; compiledMessage: string; explorationRecordId?: string }
    | { useExploration: true; fallbackContent: string; explorationRecordId?: string }
  > => {
    if (config.retrospective?.enabled) {
      void appendTelemetry(workspace, {
        ts: new Date().toISOString(),
        type: "exploration_enter",
        sessionId: context.sessionId,
        payload: { correlationId: context.correlationId },
      });
    }

    const snapshot = await buildSnapshotContext(config, {
      workspace,
      message,
      session,
      flowLibrary,
    });
    if (snapshot.availableActions.length === 0) {
      return {
        useExploration: true,
        fallbackContent: "当前无可用技能或流程，无法生成预案。请先配置 flows 或工具。",
      };
    }

    const exp = config.exploration?.experience;
    const reuseThreshold = exp?.reuseThreshold ?? 0.85;
    const requireSnapshotMatch = exp?.requireSnapshotMatch === true;

    if (exp?.enabled) {
      // 优先使用向量检索（若已启用），否则退回到简单字符串匹配
      let match: { entry: import("./experience.js").ExplorationExperienceEntry; score: number } | null = null;
      match = await findBestMatchVector(
        config,
        workspace,
        message,
        reuseThreshold,
        requireSnapshotMatch,
        snapshot.snapshot_digest
      );
      if (!match) {
        const recentLimit = exp.maxEntries && exp.maxEntries > 0 ? exp.maxEntries : 50;
        const recent = listRecent(workspace, recentLimit);
        match = findBestMatch(message, recent, reuseThreshold);
        if (match && requireSnapshotMatch && snapshot.snapshot_digest) {
          if (match.entry.snapshot_digest !== snapshot.snapshot_digest) {
            match = null;
          }
        }
      }
      if (match) {
        const compiledMessage = compilePlanToMessage(match.entry.chosen_plan, message);
        await updateReuseCountAsync(workspace, match.entry.id);
        if (context.config.retrospective?.enabled) {
          void appendTelemetry(workspace, {
            ts: new Date().toISOString(),
            type: "exploration_reuse",
            sessionId: context.sessionId,
            payload: {
              correlationId: context.correlationId,
              explorationRecordId: match.entry.id,
              score: match.score,
            },
          });
        }
        return { useExploration: true, compiledMessage, explorationRecordId: match.entry.id };
      }
    }

    const plannerResult = await callPlanner(config, snapshot, message);
    if ("fallback" in plannerResult) {
      return {
        useExploration: true,
        fallbackContent: `当前系统缺少所需能力，已记录需求：${plannerResult.fallback.content}`,
      };
    }
    const { variants } = plannerResult;
    if (variants.length === 0) {
      return {
        useExploration: true,
        fallbackContent: "未能解析出有效预案，将直接按您的描述执行。",
      };
    }

    const criticResult = await callCritic(config, variants, message);
    if (criticResult == null) {
      return { useExploration: false };
    }
    const chosen = variants.find((v) => v.planId === criticResult.chosenPlanId) ?? variants[0];
    const compiledMessage = compilePlanToMessage(chosen, message);

    let explorationRecordId: string | undefined;
    if (exp?.enabled) {
      const written = await writeEntryWithVector(config, workspace, {
        task_signature: message,
        chosen_plan: chosen,
        snapshot_digest: snapshot.snapshot_digest,
      });
      explorationRecordId = written.id;
      if (context.config.retrospective?.enabled) {
        void appendTelemetry(workspace, {
          ts: new Date().toISOString(),
          type: "exploration_store",
          sessionId: context.sessionId,
          payload: { correlationId: context.correlationId, explorationRecordId: written.id },
        });
      }
    }

    if (context.config.retrospective?.enabled) {
      void appendTelemetry(workspace, {
        ts: new Date().toISOString(),
        type: "exploration_full_run",
        sessionId: context.sessionId,
        payload: { correlationId: context.correlationId, explorationRecordId },
      });
    }

    return { useExploration: true, compiledMessage, explorationRecordId };
  };

  try {
    const timeoutPromise = new Promise<{ useExploration: false }>((resolve) => {
      setTimeout(() => resolve({ useExploration: false }), timeoutMs);
    });
    return await Promise.race([run(), timeoutPromise]);
  } catch {
    return { useExploration: false };
  }
}
