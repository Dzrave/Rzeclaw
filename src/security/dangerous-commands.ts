/**
 * WO-SEC-001: 危险命令检测 — 内置规则与可配置 patterns，供 Bash 执行前调用。
 */

import type { RzeclawConfig } from "../config.js";

/** 内置危险模式：匹配则视为危险命令（子串或正则） */
const DEFAULT_PATTERNS: RegExp[] = [
  /\brm\s+(-rf?|--recursive|--force)\s+(\/|\.\.|\*)/i,
  /\brm\s+(-rf?|--recursive)\s+/i,
  /\bformat\s+[a-z]:/i,
  /\bdel\s+\/f\s+\/s\s+\/q/i,
  /\bdel\s+\/s\s+\/q\s+\\/i,
  /\b:\(\s*\)\s*\{\s*:\s*\\\|\s*:&\s*\}/,
  /\bmkfs\./i,
  /\bdd\s+if=.*of=\/dev\//i,
  /\bwmic\s+.*\b(delete|format)\b/i,
  /\bchmod\s+[-+]?\d*\s*(\/|\*)/i,
  /\>\/dev\/null\s*.*\s*&\s*.*\|\s*sh/i,
  /\breg\s+delete\s+/i,
  /\bdiskpart\b/i,
];

function getPatterns(config: RzeclawConfig): RegExp[] {
  const list = [...DEFAULT_PATTERNS];
  const custom = config.security?.dangerousCommands?.patterns;
  if (Array.isArray(custom)) {
    for (const p of custom) {
      if (typeof p !== "string" || !p.trim()) continue;
      try {
        list.push(new RegExp(p.trim(), "i"));
      } catch {
        // 无效正则则当作子串
        const escaped = p.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        list.push(new RegExp(escaped, "i"));
      }
    }
  }
  return list;
}

export type DangerousCheckResult = {
  matched: boolean;
  mode: "block" | "confirm" | "dryRunOnly";
};

/**
 * 检测命令是否命中危险规则。若未配置 security.dangerousCommands 或 mode 未设置，默认按 confirm 处理（安全优先）。
 */
export function checkDangerousCommand(
  command: string,
  config: RzeclawConfig
): DangerousCheckResult {
  const raw = typeof command === "string" ? command.trim() : "";
  if (!raw) {
    return { matched: false, mode: "confirm" };
  }
  const mode =
    config.security?.dangerousCommands?.mode ?? "confirm";
  const patterns = getPatterns(config);
  for (const re of patterns) {
    if (re.test(raw)) {
      return { matched: true, mode };
    }
  }
  return { matched: false, mode };
}
