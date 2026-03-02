# Forking Knowledge Miner

A TUI-driven tool that points forking LLM agents at data sources to extract, organize, and persist structured knowledge. Connect any MCP/MCPL server as a data source — Zulip, Discord, APIs, databases — and the agent will explore it, fork subagents for parallel analysis, and record findings as persistent lessons with confidence scores and source provenance.

Built on the Connectome agent framework stack.

## What it does

- **Reads data sources**: Connects to any MCP/MCPL-compatible server — Zulip, Discord, custom APIs
- **Extracts knowledge**: Identifies decisions, processes, recurring patterns, key people, and technical facts
- **Parallel exploration**: Forks subagents to analyze multiple areas concurrently, then synthesizes findings
- **Persistent memory**: Stores extracted knowledge as "lessons" with confidence scores, tags, and source references; surfaces relevant lessons before each inference
- **Produces reports**: Writes analysis reports, profiles, process maps, and other documents to disk
- **Time-travel**: Chronicle-backed undo/redo, named checkpoints, branch exploration

## Prerequisites

- [Bun](https://bun.sh/) runtime (not Node.js)
- An Anthropic API key
- One or more MCP/MCPL data source servers

## Setup

### 1. Install dependencies

```bash
bun install
```

### 2. Set environment variables

```bash
cp .env.example .env
```

Edit `.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Bun auto-loads `.env` files, so no additional setup is needed.

Optional variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `MODEL` | `claude-opus-4-6` | Model for the main researcher agent |
| `STORE_PATH` | `./data/store` | Chronicle persistent storage location |

### 3. Configure data sources

Data sources are configured in `mcpl-servers.json`, which uses the same format as Claude Code's `.mcp.json`:

```json
{
  "mcplServers": {
    "zulip": {
      "command": "node",
      "args": ["../zulip-mcp/build/index.js"],
      "env": {
        "ZULIP_RC_PATH": "./.zuliprc"
      }
    },
    "discord": {
      "command": "node",
      "args": ["--import", "tsx", "../discord-mcpl/src/index.ts", "--stdio"],
      "env": {
        "DISCORD_TOKEN": "..."
      }
    }
  }
}
```

You can also manage servers at runtime with `/mcp` commands (see below). Changes take effect on restart.

Supported fields per server:
- `command` (required), `args`, `env`
- `toolPrefix` — customize tool name prefix (default: server ID)
- `reconnect`, `reconnectIntervalMs` — auto-reconnect on disconnect
- `enabledFeatureSets`, `disabledFeatureSets`

#### Example: Zulip setup

1. Clone and build the [Zulip MCP server](https://github.com/antra-tess/zulip_mcp):
   ```bash
   git clone https://github.com/antra-tess/zulip_mcp.git ../zulip-mcp
   cd ../zulip-mcp && npm install && npm run build && cd -
   ```

2. Create a `.zuliprc` with your bot credentials:
   ```ini
   [api]
   email=your-bot@your-org.zulipchat.com
   key=your-bot-api-key
   site=https://your-org.zulipchat.com
   ```

3. Add the server entry to `mcpl-servers.json` as shown above (or let it auto-seed on first run if the legacy `ZULIP_MCP_CMD` env var is set).

## Running

```bash
# Interactive TUI (requires a terminal)
bun src/index.ts

# Readline mode (for non-TTY environments)
bun src/index.ts --no-tui

# Piped mode (CI / scripting)
echo "Analyze the #engineering stream for key decisions" | bun src/index.ts

# Dev mode with file watching
bun --watch src/index.ts
```

## Usage

Type natural language requests in the input bar. The agent will explore its data sources, fork subagents for parallel analysis, and report findings:

```
> Analyze the last month of #engineering and extract key architectural decisions

> What processes does the team follow for code review?

> Build a profile of the team — who works on what, who are the key decision makers?

> Read #incidents and create a report on recurring failure patterns
```

The agent writes reports to `./output/` and persists lessons in the Chronicle store.

## Slash Commands

| Command | Effect |
|---------|--------|
| `/help` | List all commands |
| `/status` | Show agent state, branch, queue depth |
| `/lessons` | Show lesson library sorted by confidence |
| `/clear` | Clear conversation display |
| `/undo` | Revert to state before last agent turn |
| `/redo` | Re-apply undone action |
| `/checkpoint <name>` | Save current state as named checkpoint |
| `/restore <name>` | Restore to checkpoint |
| `/branches` | List all Chronicle branches |
| `/checkout <name>` | Switch to named branch |
| `/history` | Show recent message history |
| `/mcp list` | List configured MCPL servers |
| `/mcp add <id> <cmd> [args...]` | Add or overwrite a server |
| `/mcp remove <id>` | Remove a server |
| `/mcp env <id> KEY=VALUE [...]` | Set env vars on a server |
| `/quit` | Exit |

## TUI Controls

| Key | Action |
|-----|--------|
| `Enter` | Send message or command |
| `Tab` | Toggle fleet view (subagent tree) |
| `Ctrl+C` | Exit |

**Fleet view** (when Tab is pressed):

| Key | Action |
|-----|--------|
| Up/Down | Navigate agent tree |
| Enter/Right | Expand/collapse node |
| Left | Collapse node |
| `p` | Peek at running subagent's live stream |
| `Delete` | Stop a running subagent |
| `Esc` | Exit peek mode |
| `Tab` | Return to chat |

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed technical documentation including the agent architecture, module system, retrieval pipeline, and framework integration.

## Dependencies

| Package | Source | Role |
|---------|--------|------|
| `@connectome/agent-framework` | [Anarchid/agent-framework](https://github.com/Anarchid/agent-framework) | Event-driven agent orchestration |
| `@connectome/context-manager` | [Anarchid/context-manager](https://github.com/Anarchid/context-manager) | Context window management and compression |
| `chronicle` | [Anarchid/chronicle](https://github.com/Anarchid/chronicle) | Branchable event store (Rust + N-API) |
| `membrane` | [Anarchid/membrane](https://github.com/Anarchid/membrane) | LLM provider abstraction |
| `@opentui/core` | [npm](https://www.npmjs.com/package/@opentui/core) | Terminal UI (Zig native core) |
