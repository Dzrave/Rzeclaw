/**
 * Phase 16 WO-1658: 完整干跑与编译 — 编译路径单元测试（不依赖 LLM）
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { compilePlanToMessage } from "../dist/exploration/compile.js";

describe("exploration compile WO-1658", () => {
  it("compilePlanToMessage contains system prefix, steps, and user intent", () => {
    const plan = {
      planId: "p1",
      title: "Test plan",
      steps: [
        { step: 1, actionId: "run_tool", description: "Run a tool" },
        { step: 2, actionId: "read_file", params: { path: "a.txt" }, description: "Read file" },
      ],
    };
    const userMessage = "请帮我整理文档";
    const out = compilePlanToMessage(plan, userMessage);
    assert.ok(out.includes("【系统预案】"), "should contain system prefix");
    assert.ok(out.includes("1. run_tool"), "should list step 1");
    assert.ok(out.includes("2. read_file"), "should list step 2");
    assert.ok(out.includes("用户原意："), "should contain user intent section");
    assert.ok(out.includes("请帮我整理文档"), "should include original user message");
  });

  it("compilePlanToMessage includes params and description when present", () => {
    const plan = {
      planId: "p2",
      steps: [
        { step: 1, actionId: "edit_file", params: { path: "x.js" }, description: "Edit x.js" },
      ],
    };
    const out = compilePlanToMessage(plan, "edit");
    assert.ok(out.includes("edit_file"));
    assert.ok(out.includes("参数:"));
    assert.ok(out.includes("x.js"));
    assert.ok(out.includes("Edit x.js"));
  });
});
