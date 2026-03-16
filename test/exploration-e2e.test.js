/**
 * Phase 16 WO-1658: 探索层 E2E 干跑测试（不调用真实 LLM，用固定 fixture 验证 先验→解析→Critic→编译 链路）
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { parsePlannerOutput } from "../dist/exploration/planner.js";
import { parseCriticOutput } from "../dist/exploration/critic.js";
import { compilePlanToMessage } from "../dist/exploration/compile.js";

const ALLOWED_ACTION_IDS = new Set(["run_tool", "read_file", "edit_file", "Skill_Git_Commit"]);

const FIXTURE_PLANNER_JSON = [
  {
    planId: "plan_1",
    title: "先读后改",
    steps: [
      { step: 1, actionId: "read_file", params: { path: "a.txt" }, description: "读取 a.txt" },
      { step: 2, actionId: "edit_file", params: { path: "a.txt" }, description: "编辑 a.txt" },
    ],
    preconditions: ["文件 a.txt 存在"],
  },
  {
    planId: "plan_2",
    title: "仅执行工具",
    steps: [
      { step: 1, actionId: "run_tool", params: { name: "lint" }, description: "运行 lint" },
    ],
  },
];

const FIXTURE_CRITIC_JSON = {
  chosenPlanId: "plan_1",
  scores: [
    { planId: "plan_1", score: 0.85, estimatedSuccess: 0.9, estimatedCost: 0.2, estimatedRisk: 0.1, reason: "步骤清晰" },
    { planId: "plan_2", score: 0.6, estimatedSuccess: 0.7, estimatedCost: 0.3, estimatedRisk: 0.2, reason: "覆盖不足" },
  ],
};

describe("exploration E2E WO-1658", () => {
  it("parsePlannerOutput rejects variants with invalid actionId", () => {
    const invalidPlanner = JSON.stringify([
      {
        planId: "p1",
        steps: [
          { step: 1, actionId: "read_file" },
          { step: 2, actionId: "nonexistent_tool" },
        ],
      },
    ]);
    const out = parsePlannerOutput(invalidPlanner, ALLOWED_ACTION_IDS);
    assert.ok("variants" in out);
    assert.strictEqual(out.variants.length, 0, "variant with invalid actionId should be dropped");
  });

  it("parsePlannerOutput accepts only variants with all valid actionIds", () => {
    const text = JSON.stringify(FIXTURE_PLANNER_JSON);
    const out = parsePlannerOutput(text, ALLOWED_ACTION_IDS);
    assert.ok("variants" in out);
    assert.strictEqual(out.variants.length, 2);
    assert.strictEqual(out.variants[0].planId, "plan_1");
    assert.strictEqual(out.variants[0].steps[0].actionId, "read_file");
    assert.strictEqual(out.variants[0].steps[1].actionId, "edit_file");
  });

  it("parseCriticOutput returns chosenPlanId and scores", () => {
    const text = JSON.stringify(FIXTURE_CRITIC_JSON);
    const result = parseCriticOutput(text, ["plan_1", "plan_2"]);
    assert.ok(result !== null);
    assert.strictEqual(result.chosenPlanId, "plan_1");
    assert.strictEqual(result.scores.length, 2);
  });

  it("full chain: planner fixture -> critic fixture -> compile", () => {
    const plannerText = JSON.stringify(FIXTURE_PLANNER_JSON);
    const parsed = parsePlannerOutput(plannerText, ALLOWED_ACTION_IDS);
    assert.ok("variants" in parsed && parsed.variants.length >= 1);

    const criticText = JSON.stringify(FIXTURE_CRITIC_JSON);
    const criticResult = parseCriticOutput(criticText, parsed.variants.map((v) => v.planId));
    assert.ok(criticResult !== null);

    const chosen = parsed.variants.find((v) => v.planId === criticResult.chosenPlanId) ?? parsed.variants[0];
    const userMessage = "请帮我先读 a.txt 再编辑";
    const compiled = compilePlanToMessage(chosen, userMessage);

    assert.ok(compiled.includes("【系统预案】"));
    assert.ok(compiled.includes("1. read_file"));
    assert.ok(compiled.includes("2. edit_file"));
    assert.ok(compiled.includes("用户原意："));
    assert.ok(compiled.includes(userMessage));
  });
});
