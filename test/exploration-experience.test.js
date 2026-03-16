/**
 * Phase 16 WO-1659: 探索经验复用与回写 — 端到端/集成测试
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  writeEntry,
  listRecent,
  findBestMatch,
  updateOutcome,
  getEntryById,
} from "../dist/exploration/experience.js";

describe("exploration experience WO-1659", () => {
  let workspace;

  const minimalPlan = {
    planId: "test-p1",
    steps: [{ step: 1, actionId: "run_tool", description: "test" }],
  };

  it("writeEntry then listRecent returns the entry", async () => {
    workspace = await mkdtemp(join(tmpdir(), "rzeclaw-exp-"));
    const entry = writeEntry(workspace, {
      task_signature: "请帮我设计模块架构",
      chosen_plan: minimalPlan,
    });
    assert.ok(entry.id);
    assert.strictEqual(entry.reuse_count, 0);

    const recent = listRecent(workspace, 10);
    assert.strictEqual(recent.length, 1);
    assert.strictEqual(recent[0].id, entry.id);
    assert.strictEqual(recent[0].task_signature, "请帮我设计模块架构");
    await rm(workspace, { recursive: true, force: true });
  });

  it("findBestMatch hits same message with score >= threshold", async () => {
    workspace = await mkdtemp(join(tmpdir(), "rzeclaw-exp2-"));
    writeEntry(workspace, {
      task_signature: "请帮我设计模块架构",
      chosen_plan: minimalPlan,
    });
    const entries = listRecent(workspace, 10);
    const match = findBestMatch("请帮我设计模块架构", entries, 0.8);
    assert.ok(match);
    assert.strictEqual(match.entry.task_signature, "请帮我设计模块架构");
    assert.ok(match.score >= 0.8);
    await rm(workspace, { recursive: true, force: true });
  });

  it("updateOutcome updates outcome_success_count and outcome_fail_count", async () => {
    workspace = await mkdtemp(join(tmpdir(), "rzeclaw-exp3-"));
    const entry = writeEntry(workspace, {
      task_signature: "test outcome",
      chosen_plan: minimalPlan,
    });
    const id = entry.id;

    let ok = updateOutcome(workspace, id, { success: true });
    assert.strictEqual(ok, true);
    let e = getEntryById(workspace, id);
    assert.ok(e);
    assert.strictEqual(e.outcome_success_count, 1);
    assert.strictEqual(e.outcome_fail_count, 0);
    assert.strictEqual(e.last_outcome, true);

    ok = updateOutcome(workspace, id, { success: false });
    assert.strictEqual(ok, true);
    e = getEntryById(workspace, id);
    assert.ok(e);
    assert.strictEqual(e.outcome_success_count, 1);
    assert.strictEqual(e.outcome_fail_count, 1);
    assert.strictEqual(e.last_outcome, false);

    await rm(workspace, { recursive: true, force: true });
  });
});
