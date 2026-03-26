<p align="center">
  <strong>RezBot</strong><br>
  <em>Your Local AI Automation Hub</em>
</p>

<p align="center">
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-%E2%89%A518-339933?logo=node.js&logoColor=white" alt="Node.js"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white" alt="TypeScript"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT License"></a>
</p>

---

## What is RezBot?

RezBot is a **fully local, privacy-first AI assistant** built on Node.js. It combines a WebSocket **Gateway**, a multi-turn **Agent loop** (LLM + tools), long-term **Memory**, a **Flow engine** (Behavior Tree / State Machine), **RAG**, **Exploration**, **Multi-Agent collaboration**, and a rich **Web UI** -- all running on your own machine.

> Inspired by the [OpenClaw](https://github.com/anthropics/anthropic-cookbook) philosophy: you own the data, you control the loop.

---

## Features

| Category | Highlights |
|----------|-----------|
| **Gateway** | JSON-RPC over WebSocket; streaming `chat`; session snapshots; health check; canvas; retrospective RPCs |
| **Agent** | CLI or Gateway-driven; multi-turn tool calls; memory injection; planning & reflection; privacy mode |
| **Tools** | `bash` / `read` / `write` / `edit` / `process`; Skills; MCP integration; Windows UI automation; `replay_ops` |
| **Flows** | Behavior Tree & FSM engines; flow router; failure replacement; evolution insert-tree; LLM-generated flows |
| **Memory** | L0 -> L1 -> L2 tiered storage; cold archive; audit trail; rolling ledger & folding; privacy isolation |
| **Exploration** | Gatekeeper / Planner / Critic loop; experience replay; autonomous strategy refinement |
| **Multi-Agent** | Event Bus hub; agent blueprints & instances; pipeline delegation; swarm broadcast |
| **RAG** | Embedding client; motivation-RAG; knowledge ingestion pipeline |
| **Retrospective** | Automated review; morning briefing; telemetry; pending tasks tracking |
| **LLM Providers** | Anthropic (Claude) / DeepSeek / MiniMax / Ollama -- unified interface, hot-switchable |
| **Web UI** | Lit-based SPA: Chat, Flows, Exploration, Memory, RAG, Agents, Security, Diagnostics, Settings pages |
| **Terminal** | Electron desktop client connecting to the Gateway |
| **Security** | Dangerous command blocklist; permission scopes; input sanitization; audit query |

---

## Architecture

```
                        +-----------------+
                        |   Web UI (Lit)  |    Electron Terminal
                        +--------+--------+    ---------+
                                 |                      |
                            WebSocket              WebSocket
                                 |                      |
                    +------------v----------------------v----------+
                    |              Gateway (JSON-RPC)               |
                    |   chat-executor  .  session  .  canvas  .  . |
                    +-----+----------------+-----------------------+
                          |                |
               +----------v---+    +-------v--------+
               |  Agent Loop  |    |   Event Bus    |
               |  (LLM+Tools) |    |  (Multi-Agent) |
               +------+-------+    +-------+--------+
                      |                    |
        +-------------+-------------+------+---------+
        |       |       |       |       |            |
     Memory   Flows   RAG  Exploration Skills   Collaboration
     (JSONL)  (BT/FSM)     (Planner)   (MCP)    (Swarm)
```

---

## Quick Start

### Prerequisites

- **Node.js** >= 18
- An LLM API key (Anthropic recommended) or a local Ollama instance

### Install & Run

```bash
# Clone
git clone https://github.com/Dzrave/Rezbot.git
cd Rezbot

# Install dependencies & build
npm install
npm run build

# Configure -- copy the example and fill in your API key
cp rezbot.example.json rezbot.json
# Edit rezbot.json: set llm.apiKey, choose provider, etc.

# Start the Gateway (default port 9099)
npm run gateway

# Or run the CLI agent directly
npm run agent
```

### Build the Web UI

```bash
npm run build:ui
# The UI is served automatically by the Gateway
```

### Run Tests

```bash
npm test
```

---

## Project Structure

```
Rezbot/
|-- src/
|   |-- agent/          # Agent loop, context, goal, planning
|   |-- agents/         # Multi-agent blueprints & instances
|   |-- canvas/         # Task canvas (current.json)
|   |-- collaboration/  # Pipeline delegation, swarm broadcast
|   |-- diagnostic/     # Health reports & suggestions
|   |-- event-bus/      # In-process event bus & collaboration schema
|   |-- evolution/      # Bootstrap docs, prompt suggestions
|   |-- exploration/    # Gatekeeper / Planner / Critic / experience
|   |-- flows/          # BT & FSM engines, router, CRUD, LLM flow gen
|   |-- gateway/        # WebSocket server, chat executor
|   |-- heartbeat/      # Orient -> Check -> Act -> Record cycle
|   |-- knowledge/      # Knowledge ingestion
|   |-- llm/            # Anthropic / DeepSeek / MiniMax / Ollama
|   |-- local-model/    # Local intent classifier (Ollama)
|   |-- mcp/            # MCP client & tool merging
|   |-- memory/         # JSONL store, L1/L2, retrieval, folding
|   |-- observability/  # Logger, metrics, ops.log
|   |-- proactive/      # Proactive suggestions & canvas sync
|   |-- prompts/        # System prompt assembly
|   |-- rag/            # Vector store, motivation RAG
|   |-- retrospective/  # Review, briefing, telemetry
|   |-- security/       # Permission scopes, sanitization
|   |-- session/        # Session snapshots
|   |-- skills/         # Skill loader & runner
|   |-- task-results/   # Task result store
|   |-- tools/          # Core tools (bash/read/write/edit/process)
|   +-- ui/             # Web UI (Lit + Vite)
|-- terminal/           # Electron desktop client
|-- test/               # Node built-in test runner
|-- scripts/            # Setup & acceptance scripts
|-- site/               # Landing page (static HTML)
|-- docs/               # Architecture & design documents
|-- rezbot.example.json
|-- rezbot.mjs         # CLI entry point
|-- package.json
+-- tsconfig.json
```

---

## Configuration

Copy `rezbot.example.json` to `rezbot.json` and customize. Key fields:

| Field | Description |
|-------|-------------|
| `llm.provider` | `"anthropic"` / `"deepseek"` / `"minimax"` / `"ollama"` |
| `llm.apiKey` | Your API key (not needed for Ollama) |
| `llm.model` | Model name, e.g. `"claude-sonnet-4-20250514"` |
| `gateway.port` | WebSocket port (default `9099`) |
| `memory.backend` | `"jsonl"` (default) |
| `security.dangerousCommands` | Commands to block |
| `exploration.enabled` | Enable autonomous exploration |

See [docs/CONFIG_REFERENCE.md](docs/CONFIG_REFERENCE.md) for the full field reference.

---

## Documentation

| Document | Purpose |
|----------|---------|
| [Overall Implemented Design](docs/OVERALL_IMPLEMENTED_DESIGN.md) | **As-Built** architecture, data flows, RPC/CLI reference |
| [Config Reference](docs/CONFIG_REFERENCE.md) | Complete `rezbot.json` field guide |
| [Swarm Vision](docs/SWARM_VISION_AND_OVERALL_DESIGN.md) | Long-term product vision & capability pillars |
| [Master Plan & Phases](docs/MASTER_IMPLEMENTATION_PLAN_AND_PHASES.md) | Phase breakdown & work-order index |
| [Implementation Summary](docs/IMPLEMENTATION_SUMMARY.md) | Phase 0-6 work orders & source file mapping |
| [Behavior Tree & FSM Design](docs/BEHAVIOR_TREE_AND_STATE_MACHINE_DESIGN.md) | Flow engine internals |
| [Exploration Planner Design](docs/EXPLORATION_PLANNER_DESIGN.md) | Autonomous exploration layer |
| [Event Bus Design](docs/EVENT_BUS_AS_HUB_DESIGN.md) | Multi-agent event bus architecture |
| [Security & Privacy](docs/SECURITY_AND_PRIVACY_DESIGN.md) | Threat model & privacy mechanisms |

---

## Tech Stack

- **Runtime**: Node.js >= 18, TypeScript 5.6
- **LLM SDKs**: `@anthropic-ai/sdk`, custom DeepSeek/MiniMax/Ollama clients
- **WebSocket**: `ws`
- **MCP**: `@modelcontextprotocol/sdk`
- **Web UI**: Lit, Vite
- **Desktop**: Electron
- **Validation**: Zod
- **Testing**: Node built-in test runner

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Make your changes and add tests
4. Run `npm test` to verify
5. Submit a Pull Request

---

## License

[MIT](LICENSE)

---

<p align="center">
  Built with purpose. Runs on your machine. Your data stays yours.
</p>
