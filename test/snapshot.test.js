/**
 * WO-503: session snapshot 单元测试
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeSnapshot, readSnapshot, listSnapshots } from "../dist/session/snapshot.js";

describe("snapshot", () => {
  let dir;

  it("writeSnapshot and readSnapshot roundtrip", async () => {
    dir = await mkdtemp(join(tmpdir(), "rzeclaw-snap-"));
    await writeSnapshot(dir, "sess-1", {
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
      ],
      sessionGoal: "test goal",
    });
    const snap = await readSnapshot(dir, "sess-1");
    assert.ok(snap);
    assert.strictEqual(snap.sessionId, "sess-1");
    assert.strictEqual(snap.messages.length, 2);
    assert.strictEqual(snap.sessionGoal, "test goal");
    await rm(dir, { recursive: true, force: true });
  });

  it("listSnapshots returns empty for missing dir", async () => {
    dir = await mkdtemp(join(tmpdir(), "rzeclaw-snap2-"));
    const list = await listSnapshots(dir, 10);
    assert.strictEqual(list.length, 0);
    await rm(dir, { recursive: true, force: true });
  });
});
