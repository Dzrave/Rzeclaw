#!/usr/bin/env node
/**
 * WO-501: 可选验收脚本。检查构建、配置加载、health 子命令。
 * 用法: node scripts/acceptance-check.mjs [config|build]
 */
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const __dirname = pathToFileURL(".").pathname;

const args = process.argv.slice(2);
const mode = args[0] || "all";

async function run(cmd, args = []) {
  return new Promise((resolve, reject) => {
    const c = spawn(cmd, args, { stdio: "pipe", shell: true });
    let out = "";
    let err = "";
    c.stdout?.on("data", (d) => { out += d; });
    c.stderr?.on("data", (d) => { err += d; });
    c.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(err || out || "exit " + code))));
  });
}

async function main() {
  let ok = true;
  if (mode === "build" || mode === "all") {
    try {
      await run("npm", ["run", "build"]);
      console.log("[OK] npm run build");
    } catch (e) {
      console.error("[FAIL] build:", e.message);
      ok = false;
    }
  }
  if (mode === "config" || mode === "all") {
    try {
      const out = await run("node", ["rzeclaw.mjs", "health"]);
      const j = JSON.parse(out);
      if (j.configLoaded) console.log("[OK] config loaded");
      if (!j.apiKeySet) console.warn("[WARN] API key not set (optional for health)");
      if (!j.workspaceWritable) {
        console.error("[FAIL] workspace not writable");
        ok = false;
      }
    } catch (e) {
      console.error("[FAIL] health:", e.message);
      ok = false;
    }
  }
  process.exit(ok ? 0 : 1);
}

main();
