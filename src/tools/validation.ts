import path from "node:path";
import type { ToolDef } from "./types.js";

export type ValidationFailure = {
  code: string;
  message: string;
  suggestion: string;
};

const WORKSPACE_PREFIX = (cwd: string) => path.resolve(cwd);

function ensureInWorkspace(relPath: string, cwd: string): ValidationFailure | null {
  if (typeof relPath !== "string" || !relPath.trim()) {
    return {
      code: "PATH_MISSING",
      message: "Missing or empty path",
      suggestion: "Provide a relative path from the workspace root, e.g. 'src/index.ts'",
    };
  }
  const full = path.resolve(cwd, relPath);
  const prefix = WORKSPACE_PREFIX(cwd);
  if (!full.startsWith(prefix)) {
    return {
      code: "PATH_OUTSIDE_WORKSPACE",
      message: "Path must be inside workspace",
      suggestion: "Use a path relative to the workspace root; avoid absolute paths or '..' that leave the workspace",
    };
  }
  return null;
}

function validateBash(args: Record<string, unknown>, _cwd: string): ValidationFailure | null {
  const cmd = args.command;
  if (cmd === undefined || cmd === null) {
    return {
      code: "COMMAND_MISSING",
      message: "Missing command",
      suggestion: "Provide a non-empty 'command' string, e.g. { \"command\": \"ls -la\" }",
    };
  }
  if (typeof cmd !== "string" || !cmd.trim()) {
    return {
      code: "COMMAND_EMPTY",
      message: "Command must be a non-empty string",
      suggestion: "Use a valid shell command string",
    };
  }
  return null;
}

function validateRead(args: Record<string, unknown>, cwd: string): ValidationFailure | null {
  const fail = ensureInWorkspace((args.path as string) ?? "", cwd);
  if (fail) return fail;
  const limit = args.limit;
  if (limit !== undefined && (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1)) {
    return {
      code: "INVALID_LIMIT",
      message: "limit must be a positive integer if provided",
      suggestion: "Use a number >= 1 for max lines, or omit limit",
    };
  }
  return null;
}

function validateWrite(args: Record<string, unknown>, cwd: string): ValidationFailure | null {
  const fail = ensureInWorkspace((args.path as string) ?? "", cwd);
  if (fail) return fail;
  if (args.content === undefined || args.content === null) {
    return {
      code: "CONTENT_MISSING",
      message: "Missing content",
      suggestion: "Provide a 'content' string for the file body",
    };
  }
  if (typeof args.content !== "string") {
    return {
      code: "CONTENT_TYPE",
      message: "content must be a string",
      suggestion: "Pass the file content as a string",
    };
  }
  return null;
}

function validateEdit(args: Record<string, unknown>, cwd: string): ValidationFailure | null {
  const fail = ensureInWorkspace((args.path as string) ?? "", cwd);
  if (fail) return fail;
  if (typeof args.old_string !== "string") {
    return {
      code: "OLD_STRING_MISSING",
      message: "old_string is required and must be a string",
      suggestion: "Provide the exact text to replace (must match the file content exactly)",
    };
  }
  if (typeof args.new_string !== "string") {
    return {
      code: "NEW_STRING_MISSING",
      message: "new_string is required and must be a string",
      suggestion: "Provide the replacement string",
    };
  }
  return null;
}

function validateProcess(args: Record<string, unknown>, _cwd: string): ValidationFailure | null {
  const action = args.action;
  if (action === undefined || action === null) {
    return {
      code: "ACTION_MISSING",
      message: "Missing action",
      suggestion: "Use action: 'list' or action: 'kill' with pid",
    };
  }
  if (action !== "list" && action !== "kill") {
    return {
      code: "ACTION_INVALID",
      message: "action must be 'list' or 'kill'",
      suggestion: "Use action: 'list' to list processes, or action: 'kill' with a numeric pid",
    };
  }
  if (action === "kill") {
    const pid = args.pid;
    if (pid === undefined || pid === null) {
      return {
        code: "PID_MISSING",
        message: "kill requires pid",
        suggestion: "Provide a positive integer pid, e.g. { \"action\": \"kill\", \"pid\": 12345 }",
      };
    }
    if (typeof pid !== "number" || !Number.isInteger(pid) || pid < 1) {
      return {
        code: "PID_INVALID",
        message: "pid must be a positive integer",
        suggestion: "Use an integer process ID from the process list",
      };
    }
  }
  return null;
}

function validateUiDescribe(_args: Record<string, unknown>, _cwd: string): ValidationFailure | null {
  return null;
}

function validateUiAct(args: Record<string, unknown>, _cwd: string): ValidationFailure | null {
  if (typeof args.processName !== "string" || !args.processName.trim()) {
    return { code: "PROCESS_NAME_MISSING", message: "processName is required", suggestion: "Use the process name from ui_describe, e.g. Code" };
  }
  if (typeof args.elementName !== "string" || !args.elementName.trim()) {
    return { code: "ELEMENT_NAME_MISSING", message: "elementName is required", suggestion: "Use the control name or AutomationId from ui_describe" };
  }
  if (typeof args.action !== "string" || !["click", "set_value"].includes(args.action.toLowerCase())) {
    return { code: "ACTION_INVALID", message: "action must be 'click' or 'set_value'", suggestion: "Use action: 'click' or action: 'set_value'" };
  }
  return null;
}

function validateUiFocus(args: Record<string, unknown>, _cwd: string): ValidationFailure | null {
  if (typeof args.processName !== "string" || !args.processName.trim()) {
    return { code: "PROCESS_NAME_MISSING", message: "processName is required", suggestion: "Use the process name from ui_describe" };
  }
  return null;
}

const validators: Record<string, (args: Record<string, unknown>, cwd: string) => ValidationFailure | null> = {
  bash: validateBash,
  read: validateRead,
  write: validateWrite,
  edit: validateEdit,
  process: validateProcess,
  ui_describe: validateUiDescribe,
  ui_act: validateUiAct,
  ui_focus: validateUiFocus,
  keymouse: (args) => {
    if (typeof args.keys !== "string" || !args.keys.trim()) {
      return {
        code: "KEYS_MISSING",
        message: "keys is required",
        suggestion: "Use e.g. ^s for Ctrl+S, {ENTER} for Enter",
      };
    }
    return null;
  },
  undo_last: () => null,
  operation_status: (args) => {
    if (typeof args.asyncHandle !== "string" || !args.asyncHandle.trim()) {
      return {
        code: "HANDLE_MISSING",
        message: "asyncHandle is required",
        suggestion: "Use the asyncHandle returned by bash when async: true",
      };
    }
    return null;
  },
  replay_ops: (args) => {
    const last = args.last;
    if (last !== undefined && (typeof last !== "number" || !Number.isInteger(last) || last < 1 || last > 50)) {
      return {
        code: "INVALID_LAST",
        message: "last must be an integer between 1 and 50 if provided",
        suggestion: "Use last: 1 or last: 5 to replay the last 1 or 5 operations",
      };
    }
    return null;
  },
};

export function validateToolArgs(
  toolName: string,
  args: Record<string, unknown>,
  cwd: string
): ValidationFailure | null {
  const fn = validators[toolName];
  if (!fn) return null;
  return fn(args, cwd);
}
