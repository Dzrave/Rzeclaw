import Anthropic from "@anthropic-ai/sdk";
import { getApiKey } from "../config.js";
import { CORE_TOOLS, getTool } from "../tools/index.js";
import path from "node:path";
const SYSTEM = `You are a helpful assistant with access to the user's computer via tools.
You can run shell commands (bash), read/write/edit files in the workspace, and list/kill processes.
Always work in the workspace directory. Prefer small, precise edits with the edit tool.`;
function toolToApi(t) {
    return {
        name: t.name,
        description: t.description,
        input_schema: { type: "object", properties: t.inputSchema.properties ?? {}, required: t.inputSchema.required ?? [] },
    };
}
export async function runAgentLoop(params) {
    const apiKey = getApiKey(params.config);
    if (!apiKey) {
        throw new Error("Missing API key. Set ANTHROPIC_API_KEY or configure apiKeyEnv.");
    }
    const client = new Anthropic({ apiKey });
    const model = params.config.model.replace("anthropic/", "");
    const workspace = path.resolve(params.config.workspace);
    const tools = CORE_TOOLS.map(toolToApi);
    const apiMessages = [
        ...params.sessionMessages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: params.userMessage },
    ];
    let fullReply = "";
    const maxTurns = 20;
    let turns = 0;
    while (turns < maxTurns) {
        turns++;
        const response = await client.messages.create({
            model,
            max_tokens: 8192,
            system: SYSTEM,
            messages: apiMessages,
            tools: tools.length ? tools : undefined,
        });
        const last = response.content[response.content.length - 1];
        if (!last)
            break;
        if (last.type === "text") {
            fullReply += last.text;
            if (params.onText)
                params.onText(last.text);
            apiMessages.push({ role: "assistant", content: response.content });
            if (response.stop_reason === "end_turn" || !response.stop_reason)
                break;
        }
        if (last.type === "tool_use") {
            apiMessages.push({ role: "assistant", content: response.content });
            const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
            const toolResults = [];
            for (const block of toolUseBlocks) {
                const tool = getTool(block.name);
                if (!tool) {
                    toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Unknown tool: ${block.name}` });
                    continue;
                }
                let result;
                try {
                    result = await tool.handler(block.input, workspace);
                }
                catch (e) {
                    result = { ok: false, error: e instanceof Error ? e.message : String(e) };
                }
                const content = result.ok ? result.content : `Error: ${result.error}`;
                toolResults.push({ type: "tool_result", tool_use_id: block.id, content });
            }
            apiMessages.push({
                role: "user",
                content: toolResults.map((r) => ({
                    type: "tool_result",
                    tool_use_id: r.tool_use_id,
                    content: r.content,
                })),
            });
        }
    }
    const finalMessages = [
        ...params.sessionMessages,
        { role: "user", content: params.userMessage },
        { role: "assistant", content: fullReply },
    ];
    return { content: fullReply, messages: finalMessages };
}
