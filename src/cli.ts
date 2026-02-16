import { Command } from "commander";
import { loadConfig, getApiKey } from "./config.js";
import { createGatewayServer } from "./gateway/server.js";
import { runAgentLoop } from "./agent/loop.js";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const program = new Command();

program
  .name("rzeclaw")
  .description("Minimal AI assistant with computer tools (bash, read, write, edit, process)")
  .version("0.1.0");

program
  .command("gateway")
  .description("Start the Gateway WebSocket server (control plane + tool execution)")
  .option("-p, --port <number>", "Port", (v) => parseInt(v, 10))
  .action(async (opts) => {
    const config = loadConfig();
    const port = opts.port ?? config.port;
    const workspace = path.resolve(config.workspace);
    await mkdir(workspace, { recursive: true });
    createGatewayServer(config, port);
  });

program
  .command("agent")
  .description("Send a message to the agent (in-process: no gateway required)")
  .argument("[message]", "User message")
  .option("-m, --message <text>", "Message (alternative to positional)")
  .action(async (posMessage, opts) => {
    const config = loadConfig();
    const message = opts.message ?? posMessage;
    if (!message || typeof message !== "string") {
      console.error("Provide a message: rzeclaw agent \"your question\"");
      process.exit(2);
    }
    const apiKey = getApiKey(config);
    if (!apiKey) {
      console.error("Set ANTHROPIC_API_KEY or configure apiKeyEnv in config.");
      process.exit(1);
    }
    const workspace = path.resolve(config.workspace);
    await mkdir(workspace, { recursive: true });

    const { content } = await runAgentLoop({
      config,
      userMessage: message,
      sessionMessages: [],
      onText: (chunk) => process.stdout.write(chunk),
    });
    if (!content && !process.stdout.isTTY) {
      console.log(content);
    }
  });

export async function run(): Promise<void> {
  await program.parseAsync(process.argv);
}
