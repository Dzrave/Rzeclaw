/**
 * WO-503: audit-query exportAuditLog 单元测试
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { exportAuditLog } from "../dist/memory/audit-query.js";

describe("exportAuditLog", () => {
  it("exports JSON for records", () => {
    const records = [
      { when: "2025-01-01T00:00:00Z", who: "s1", from_where: "s1", entry_id: "e1", workspace_id: "w1" },
    ];
    const json = exportAuditLog(records, "json");
    assert.ok(json.includes("e1"));
    assert.ok(json.includes("s1"));
    const parsed = JSON.parse(json);
    assert.strictEqual(parsed.length, 1);
  });
  it("exports CSV with header for empty", () => {
    const csv = exportAuditLog([], "csv");
    assert.ok(csv.includes("when,who,from_where,entry_id,workspace_id"));
  });
  it("exports CSV with escaped comma", () => {
    const records = [{ when: "x", who: "a,b", from_where: "c", entry_id: "e", workspace_id: "" }];
    const csv = exportAuditLog(records, "csv");
    assert.ok(csv.includes("a,b") || csv.includes('"a,b"'));
  });
});
