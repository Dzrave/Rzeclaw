import type { ToolDef } from "../tools/types.js";

const INTENT_TOOL_TABLE = `
## Intent → Tool (choose one)
- Run a command / list files / run script → **bash**
- View file contents → **read**
- Create or overwrite a whole file → **write**
- Change one exact snippet in a file (small edit) → **edit**
- List or kill processes → **process**
`;

function toolUsageBlock(t: ToolDef): string {
  const parts = [t.description];
  if (t.usageHint) parts.push(t.usageHint);
  if (t.examples?.length) {
    parts.push("Examples: " + t.examples.map((e) => JSON.stringify(e)).join("; "));
  }
  return `- **${t.name}**: ${parts.join(" ")}`;
}

export function buildSystemPrompt(tools: ToolDef[]): string {
  const base = `You are a helpful assistant with access to the user's computer via tools.
You can run shell commands (bash), read/write/edit files in the workspace, and list/kill processes.
Always work in the workspace directory. Prefer small, precise edits with the edit tool.
When a tool returns an error, follow its Suggestion to retry or try a different approach.`;
  const intent = INTENT_TOOL_TABLE;
  const toolHints = tools.length
    ? "\n## Tool usage\n" + tools.map(toolUsageBlock).join("\n")
    : "";
  return base + intent + toolHints;
}
