/**
 * WO-502: retrieve 与 formatAsCitedBlocks 单元测试
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { formatAsCitedBlocks } from "../dist/memory/retrieve.js";

describe("formatAsCitedBlocks", () => {
  it("returns empty for empty array", () => {
    assert.strictEqual(formatAsCitedBlocks([]), "");
  });
  it("formats one entry with Memory#id and session", () => {
    const entries = [
      {
        id: "uuid-1",
        content: "User prefers dark mode",
        content_type: "fact",
        provenance: { source_type: "model", session_id: "s1", turn_index: 2 },
        created_at: new Date().toISOString(),
      },
    ];
    const out = formatAsCitedBlocks(entries);
    assert.ok(out.includes("Memory#uuid-1"));
    assert.ok(out.includes("session s1"));
    assert.ok(out.includes("第 2 轮"));
    assert.ok(out.includes("User prefers dark mode"));
  });
});
