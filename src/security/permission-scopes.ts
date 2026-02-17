/**
 * WO-SEC-009 / WO-SEC-011: 权限域与默认策略，工具与 scope 映射，与 confirmPolicy 兼容。
 */

import type { RzeclawConfig } from "../config.js";
import type { PermissionScopePolicy } from "../config.js";

export const TOOL_SCOPE_MAP: Record<string, string> = {
  read: "file_read",
  write: "file_write",
  edit: "file_write",
  bash: "bash",
  process: "process_kill",
  ui_describe: "ui_automation",
  ui_act: "ui_automation",
  ui_focus: "ui_automation",
  keymouse: "keymouse",
  env_summary: "file_read",
  undo_last: "file_write",
  operation_status: "bash",
  replay_ops: "file_write",
};

const DEFAULT_SCOPES: Record<string, PermissionScopePolicy> = {
  file_read: "allow",
  file_write: "confirm",
  bash: "allow",
  process_kill: "confirm",
  ui_automation: "confirm",
  keymouse: "confirm",
};

/**
 * 获取某工具在当前配置下的有效策略。未配置 security.permissionScopes 时回退到 ideOperation.confirmPolicy。
 */
export function getEffectivePolicy(
  toolName: string,
  config: RzeclawConfig
): PermissionScopePolicy {
  const scopes = config.security?.permissionScopes;
  const scope = TOOL_SCOPE_MAP[toolName] ?? toolName;
  if (scopes && typeof scopes[scope] === "string") {
    return scopes[scope] as PermissionScopePolicy;
  }
  const defaultPolicy = DEFAULT_SCOPES[scope] ?? "allow";
  const confirmPolicy = config.ideOperation?.confirmPolicy;
  if (
    Array.isArray(confirmPolicy?.tools) &&
    confirmPolicy.tools.length > 0 &&
    confirmPolicy.tools.includes(toolName)
  ) {
    return "confirm";
  }
  if (confirmPolicy?.requireConfirm === true) return "confirm";
  return defaultPolicy;
}

/**
 * WO-SEC-012: 检查当前时间是否在某 scope 的定时授权窗口内。
 */
export function isInScheduledGrant(
  scope: string,
  config: RzeclawConfig
): boolean {
  const grants = config.security?.scheduledGrants;
  if (!Array.isArray(grants) || grants.length === 0) return false;
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  for (const g of grants) {
    if (g.scope !== scope || !g.window) continue;
    const [start, end] = g.window.split("-").map((s) => s.trim());
    if (!start || !end) continue;
    const [sh, sm] = start.split(":").map((v) => parseInt(v, 10) || 0);
    const [eh, em] = end.split(":").map((v) => parseInt(v, 10) || 0);
    const startMinutes = sh * 60 + sm;
    const endMinutes = eh * 60 + em;
    if (startMinutes <= endMinutes) {
      if (nowMinutes >= startMinutes && nowMinutes <= endMinutes) return true;
    } else {
      if (nowMinutes >= startMinutes || nowMinutes <= endMinutes) return true;
    }
  }
  return false;
}
