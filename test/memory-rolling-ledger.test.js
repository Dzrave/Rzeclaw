/**
 * Phase 17 WO-1752: 账本读写与格式化、注入段 — 单元/集成测试
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readRollingLedger,
  writeRollingLedger,
  emptyRollingLedger,
  formatRollingLedgerForPrompt,
  getRollingContextForPrompt,
} from "../dist/memory/rolling-ledger.js";

describe("memory rolling ledger WO-1752", () => {
  let workspace;
  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "rezbot-roll-"));
  });
  afterEach(() => {
    if (workspace) rmSync(workspace, { recursive: true, force: true });
  });

  describe("read/write ledger", () => {
    it("writes then reads back same ledger", async () => {
      const ledger = {
        memory_window: "5_days",
        current_focus: "正在重构战斗结算",
        rolling_ledger: [
          { day: "Yesterday (-1)", date: "2026-03-14", summary: "完成了 HP 公式讨论。", pending_tasks: ["修 Bug"] },
        ],
      };
      await writeRollingLedger(workspace, ledger);
      const read = await readRollingLedger(workspace);
      assert.strictEqual(read.memory_window, ledger.memory_window);
      assert.strictEqual(read.current_focus, ledger.current_focus);
      assert.strictEqual(read.rolling_ledger.length, 1);
      assert.strictEqual(read.rolling_ledger[0].date, "2026-03-14");
      assert.strictEqual(read.rolling_ledger[0].summary, "完成了 HP 公式讨论。");
      assert.deepStrictEqual(read.rolling_ledger[0].pending_tasks, ["修 Bug"]);
    });

    it("returns empty ledger when file missing", async () => {
      const read = await readRollingLedger(workspace);
      assert.strictEqual(read.rolling_ledger.length, 0);
      assert.strictEqual(read.memory_window, "5_days");
    });
  });

  describe("formatRollingLedgerForPrompt", () => {
    it("includes today date and day summaries", () => {
      const ledger = {
        memory_window: "5_days",
        current_focus: "装甲穿透除零",
        rolling_ledger: [
          { day: "Yesterday (-1)", date: "2026-03-14", summary: "HP 公式讨论与除零 Bug。" },
        ],
      };
      const out = formatRollingLedgerForPrompt(ledger, { todayDate: "2026-03-15" });
      assert.ok(out.includes("2026-03-15"));
      assert.ok(out.includes("昨天"));
      assert.ok(out.includes("2026-03-14"));
      assert.ok(out.includes("HP 公式讨论"));
      assert.ok(out.includes("装甲穿透除零"));
    });

    it("empty ledger returns only today sentence", () => {
      const ledger = emptyRollingLedger();
      const out = formatRollingLedgerForPrompt(ledger, { todayDate: "2026-03-15" });
      assert.strictEqual(out.trim(), "今天是 2026-03-15。");
    });
  });

  describe("getRollingContextForPrompt", () => {
    it("returns non-empty when ledger exists", async () => {
      await writeRollingLedger(workspace, {
        memory_window: "5_days",
        rolling_ledger: [{ day: "Yesterday (-1)", date: "2026-03-14", summary: "测试摘要。" }],
      });
      const ctx = await getRollingContextForPrompt(workspace);
      assert.ok(ctx.length > 0);
      assert.ok(ctx.includes("测试摘要"));
    });

    it("returns minimal string when no ledger file", async () => {
      const ctx = await getRollingContextForPrompt(workspace);
      assert.ok(ctx.includes("今天"));
    });
  });
});
