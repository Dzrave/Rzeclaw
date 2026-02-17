#!/usr/bin/env node
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distEntry = join(__dirname, "dist", "index.js");

async function main() {
  try {
    await import(pathToFileURL(distEntry).href);
  } catch (e) {
    if (e?.code === "ERR_MODULE_NOT_FOUND" || e?.message?.includes("Cannot find module")) {
      console.error("[rzeclaw] Run: pnpm build  or  npm run build");
      process.exit(1);
    }
    throw e;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
