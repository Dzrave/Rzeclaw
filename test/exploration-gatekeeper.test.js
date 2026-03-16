/**
 * Phase 16 WO-1657: Gatekeeper 与直通 — 端到端/集成测试
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { shouldSkipExploration, shouldEnterExploration } from "../dist/exploration/gatekeeper.js";

function minimalConfig(overrides = {}) {
  return {
    exploration: { enabled: true, trigger: { complexThresholdChars: 80 }, experience: {} },
    planning: { enabled: false, complexThresholdChars: 80 },
    ...overrides,
  };
}

describe("exploration Gatekeeper WO-1657", () => {
  describe("shouldSkipExploration", () => {
    it("returns true when exploration.enabled === false", () => {
      const config = minimalConfig({ exploration: { enabled: false } });
      assert.strictEqual(shouldSkipExploration(config, null), true);
    });

    it("returns true when matched flow is non-null", () => {
      const config = minimalConfig();
      const matched = { flowId: "flow-1", params: {} };
      assert.strictEqual(shouldSkipExploration(config, matched), true);
    });

    it("returns true when meta.explorationOptOut === true", () => {
      const config = minimalConfig();
      assert.strictEqual(shouldSkipExploration(config, null, { explorationOptOut: true }), true);
    });

    it("returns false when enabled, no match, no optOut", () => {
      const config = minimalConfig();
      assert.strictEqual(shouldSkipExploration(config, null), false);
      assert.strictEqual(shouldSkipExploration(config, null, {}), false);
    });
  });

  describe("shouldEnterExploration", () => {
    it("returns false when exploration.enabled === false", async () => {
      const config = minimalConfig({ exploration: { enabled: false } });
      const longMsg = "a long message that exceeds eighty characters so we can test the length threshold";
      assert.strictEqual(await shouldEnterExploration(config, longMsg), false);
    });

    it("returns true when message length >= complexThresholdChars", async () => {
      const config = minimalConfig();
      const long = "x".repeat(80);
      assert.strictEqual(await shouldEnterExploration(config, long), true);
    });

    it("returns true when message contains trigger keywords", async () => {
      const config = minimalConfig();
      assert.strictEqual(await shouldEnterExploration(config, "请先设计一下架构"), true);
      assert.strictEqual(await shouldEnterExploration(config, "分步骤完成"), true);
      assert.strictEqual(await shouldEnterExploration(config, "第一步先写文档"), true);
    });

    it("returns false for short message without keywords", async () => {
      const config = minimalConfig();
      assert.strictEqual(await shouldEnterExploration(config, "hi"), false);
      assert.strictEqual(await shouldEnterExploration(config, "ok"), false);
    });

    it("returns true when uncertaintyThreshold set and message has uncertainty cues", async () => {
      const config = minimalConfig({ exploration: { enabled: true, trigger: { uncertaintyThreshold: 0.5 } } });
      assert.strictEqual(await shouldEnterExploration(config, "可能需要先看一下"), true);
      assert.strictEqual(await shouldEnterExploration(config, "试试运行一下?"), true);
    });
  });
});
