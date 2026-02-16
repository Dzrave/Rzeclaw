/**
 * WO-502/503: task-hint 单元测试
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { extractTaskHint } from "../dist/memory/task-hint.js";

describe("extractTaskHint", () => {
  it("returns hint for 写文档", () => {
    assert.strictEqual(extractTaskHint("帮我写文档"), "写文档");
    assert.strictEqual(extractTaskHint("写 readme"), "写文档");
  });
  it("returns hint for 修 bug", () => {
    assert.strictEqual(extractTaskHint("修 bug"), "修 bug / 调试");
    assert.ok(extractTaskHint("fix the bug").includes("调试"));
  });
  it("returns hint for 运行命令", () => {
    assert.strictEqual(extractTaskHint("运行 ls"), "运行命令");
  });
  it("returns empty for empty input", () => {
    assert.strictEqual(extractTaskHint(""), "");
    assert.strictEqual(extractTaskHint("   "), "");
  });
  it("returns first 50 chars when no keyword match", () => {
    const long = "a".repeat(60);
    assert.ok(extractTaskHint(long).length <= 51);
    assert.ok(extractTaskHint(long).endsWith("…") || extractTaskHint(long).length <= 50);
  });
});
