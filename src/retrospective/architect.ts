/**
 * RAG-4: 架构师 Agent（只读分析 + 补丁生成）。不直接写库，产出写入待审区。
 */

import type { RezBotConfig } from "../config.js";
import { getLLMClient } from "../llm/index.js";
import { readTelemetry } from "./telemetry.js";
import { writePending } from "./pending.js";
import type { PendingPatch } from "./pending.js";
import { reportExplorationExperience } from "./exploration-experience.js";

const ARCHITECT_SYSTEM = `你是复盘架构师，只读遥测与元数据，产出结构化补丁建议，不直接修改系统。
输出 JSON：{ "summary": "早报摘要", "patches": [ { "kind": "flow_edit"|"motivation_merge"|"report", "flowId?", "ops?", "motivation?", "summary": "本条摘要" } ] }
flow_edit 的 ops 为 applyEditOps 格式；motivation_merge 的 motivation 为动机条目；report 仅摘要无操作。探索经验修剪由系统自动产出，无需在此输出。`;

export async function runRetrospective(
  config: RezBotConfig,
  workspace: string
): Promise<{ success: boolean; date: string; error?: string }> {
  if (!config.retrospective?.enabled) {
    return { success: false, date: "", error: "retrospective not enabled" };
  }
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const events = await readTelemetry(workspace, since);
  if (events.length === 0) {
    const date = new Date().toISOString().slice(0, 10);
    await writePending(workspace, date, {
      date,
      summary: "无近期遥测，未产出补丁。",
      patches: [],
    });
    return { success: true, date };
  }
  const date = new Date().toISOString().slice(0, 10);
  const client = getLLMClient(config);
  const userContent = `遥测事件数：${events.length}。最近 10 条示例：\n${JSON.stringify(events.slice(-10), null, 0)}\n请根据遥测产出补丁 JSON。`;
  try {
    const response = await client.createMessage({
      system: ARCHITECT_SYSTEM,
      messages: [{ role: "user", content: userContent }],
    });
    const text = response.content
      ?.filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("");
    let summary = "复盘完成";
    let patches: PendingPatch[] = [];
    if (text) {
      const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      const raw = fence ? fence[1].trim() : text.trim();
      try {
        const out = JSON.parse(raw) as { summary?: string; patches?: PendingPatch[] };
        if (typeof out.summary === "string") summary = out.summary;
        if (Array.isArray(out.patches)) patches = out.patches;
      } catch {
        patches = [];
      }
    }
    // WO-1655: 探索经验质量报告与修剪补丁（程序化产出，不由 LLM 生成）
    try {
      const explorationReport = await reportExplorationExperience(workspace);
      if (explorationReport.patches.length > 0) {
        patches = patches.concat(explorationReport.patches);
      }
      if (explorationReport.report) {
        summary = summary + "\n\n" + explorationReport.report;
      }
    } catch {
      // 探索经验模块失败不影响主复盘
    }
    await writePending(workspace, date, { date, summary, patches });
    return { success: true, date };
  } catch (e) {
    return {
      success: false,
      date,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
