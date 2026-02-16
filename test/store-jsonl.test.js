/**
 * WO-502: store-jsonl 单元测试（临时目录）
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { JsonlMemoryStore } from "../dist/memory/store-jsonl.js";

describe("JsonlMemoryStore", () => {
  let dir;
  let store;

  describe("append and query", () => {
    it("appends entry and query returns it", async () => {
      dir = await mkdtemp(join(tmpdir(), "rzeclaw-test-"));
      store = new JsonlMemoryStore(join(dir, "mem.jsonl"));
      const entry = {
        id: "id-1",
        content: "test content",
        content_type: "fact",
        provenance: { source_type: "model", session_id: "s1" },
        workspace_id: "w1",
        layer: "L1",
      };
      await store.append(entry);
      const results = await store.query_by_condition({ workspace_id: "w1", limit: 10 });
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].content, "test content");
      assert.strictEqual(results[0].validity, "active");
      await rm(dir, { recursive: true, force: true });
    });
  });

  describe("update_validity", () => {
    it("updates validity of existing entry", async () => {
      dir = await mkdtemp(join(tmpdir(), "rzeclaw-test-"));
      store = new JsonlMemoryStore(join(dir, "mem2.jsonl"));
      await store.append({
        id: "id-2",
        content: "old",
        content_type: "fact",
        provenance: { source_type: "model", session_id: "s1" },
      });
      await store.update_validity("id-2", "contradicted");
      const results = await store.query_by_condition({ validity: "contradicted", limit: 10 });
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].validity, "contradicted");
      await rm(dir, { recursive: true, force: true });
    });
  });
});
