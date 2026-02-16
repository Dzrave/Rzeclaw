import path from "node:path";
const WORKSPACE_PREFIX = (cwd) => path.resolve(cwd);
function ensureInWorkspace(relPath, cwd) {
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
function validateBash(args, _cwd) {
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
function validateRead(args, cwd) {
    const fail = ensureInWorkspace(args.path ?? "", cwd);
    if (fail)
        return fail;
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
function validateWrite(args, cwd) {
    const fail = ensureInWorkspace(args.path ?? "", cwd);
    if (fail)
        return fail;
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
function validateEdit(args, cwd) {
    const fail = ensureInWorkspace(args.path ?? "", cwd);
    if (fail)
        return fail;
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
function validateProcess(args, _cwd) {
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
const validators = {
    bash: validateBash,
    read: validateRead,
    write: validateWrite,
    edit: validateEdit,
    process: validateProcess,
};
export function validateToolArgs(toolName, args, cwd) {
    const fn = validators[toolName];
    if (!fn)
        return null;
    return fn(args, cwd);
}
