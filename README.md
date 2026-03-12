# connectome-host

A general-purpose agent TUI host with recipe-based configuration. Point it at any use case by loading a recipe — a JSON file that defines the system prompt, MCP servers, modules, and agent settings.

Built on the Connectome stack: [agent-framework](https://github.com/Anarchid/agent-framework) + [context-manager](https://github.com/Anarchid/context-manager) + [chronicle](https://github.com/Anarchid/chronicle) + [membrane](https://github.com/Anarchid/membrane).

## Quick start

```bash
# Prerequisites: Bun, Rust toolchain, Anthropic API key
export ANTHROPIC_API_KEY=sk-ant-...

bun install
bun src/index.ts                              # generic assistant
bun src/index.ts recipes/zulip-miner.json     # load a recipe
bun src/index.ts https://example.com/r.json   # recipe from URL
```

## Recipes

A recipe is a JSON file that configures everything domain-specific:

```json
{
  "name": "My Agent",
  "description": "What this agent does",
  "agent": {
    "name": "researcher",
    "model": "claude-opus-4-6",
    "systemPrompt": "You are a ...",
    "maxTokens": 16384,
    "strategy": {
      "type": "autobiographical",
      "headWindowTokens": 4000,
      "recentWindowTokens": 30000
    }
  },
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["path/to/server.js"],
      "env": { "API_KEY": "..." }
    }
  },
  "modules": {
    "subagents": true,
    "lessons": true,
    "retrieval": true,
    "wake": true,
    "files": { "namespace": "products" }
  },
  "sessionNaming": {
    "examples": ["Thread Archaeology", "Pipeline Debug"]
  }
}
```

### Recipe loading

| Command | Behavior |
|---------|----------|
| `bun src/index.ts` | Reuse last saved recipe, or start with generic default |
| `bun src/index.ts <path>` | Load recipe from local file |
| `bun src/index.ts <url>` | Fetch recipe from HTTP URL |
| `bun src/index.ts --no-recipe` | Reset to default generic assistant |

The loaded recipe is saved to `data/.recipe.json` and reused on subsequent bare starts.

### System prompt from URL

If `systemPrompt` is an HTTP(S) URL (no spaces or newlines), it's fetched as plain text:

```json
{
  "agent": {
    "systemPrompt": "https://example.com/prompts/researcher.md"
  }
}
```

### MCP server merging

Recipe servers merge with `mcpl-servers.json`. The file wins on conflict, so users can `/mcp add` extra servers or override recipe defaults.

### Included recipes

| Recipe | Description |
|--------|-------------|
| [`recipes/zulip-miner.json`](recipes/zulip-miner.json) | Knowledge extraction from Zulip workspaces using forking agents |

## What it provides

- **TUI + readline modes**: OpenTUI interactive terminal or `--no-tui` for pipes/CI
- **Subagent forking**: Spawn/fork parallel agents with fleet tree view (Tab to toggle)
- **Persistent lessons**: Knowledge store with confidence scores, tags, and semantic retrieval
- **Time-travel**: Chronicle-backed undo/redo, named checkpoints, branch exploration
- **Session management**: Isolated sessions with auto-naming
- **MCPL support**: Connect any MCP/MCPL server; wake subscriptions for selective event triggering
- **File products**: Write reports and documents, materialize to disk

## Prerequisites

- [Bun](https://bun.sh/) runtime
- [Rust toolchain](https://rustup.rs/) (for Chronicle N-API bindings)
- An Anthropic API key

### Build Chronicle

```bash
git clone https://github.com/Anarchid/chronicle.git ../chronicle
cd ../chronicle && npm install && npm run build && cd -
```

### Install

```bash
bun install
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | (required) | Anthropic API key |
| `MODEL` | from recipe or `claude-opus-4-6` | Override model |
| `DATA_DIR` | `./data` | Session and recipe storage |

## Running

```bash
bun src/index.ts                    # Interactive TUI
bun src/index.ts --no-tui           # Readline mode
echo "Hello" | bun src/index.ts     # Piped mode
bun --watch src/index.ts            # Dev mode
```

## Slash commands

| Command | Effect |
|---------|--------|
| `/help` | List all commands |
| `/recipe` | Show current recipe info |
| `/status` | Show agent state, branch, queue depth |
| `/lessons` | Show lesson library sorted by confidence |
| `/clear` | Clear conversation display |
| `/undo` | Revert to state before last agent turn |
| `/redo` | Re-apply undone action |
| `/checkpoint <name>` | Save current state |
| `/restore <name>` | Restore to checkpoint |
| `/branches` | List Chronicle branches |
| `/checkout <name>` | Switch to branch |
| `/history` | Show recent message history |
| `/mcp list` | List MCPL servers |
| `/mcp add <id> <cmd> [args...]` | Add or overwrite a server |
| `/mcp remove <id>` | Remove a server |
| `/mcp env <id> KEY=VALUE [...]` | Set env vars on a server |
| `/budget [tokens]` | Show/set stream token budget |
| `/session list\|new\|switch\|rename\|delete` | Session management |
| `/quit` | Exit |

## TUI controls

| Key | Action |
|-----|--------|
| `Enter` | Send message or command |
| `Esc` | Interrupt agent (chat) / back (fleet/peek) |
| `Tab` | Toggle fleet view (subagent tree) |
| `Ctrl+V` | Toggle verbose mode |
| `Ctrl+C` | Exit |

**Fleet view** (Tab):

| Key | Action |
|-----|--------|
| Up/Down | Navigate tree |
| Enter/Right | Expand/collapse |
| Left | Collapse |
| `p` | Peek at running subagent's stream |
| `Delete` | Stop a running subagent |

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed technical documentation.

## Dependencies

| Package | Source | Role |
|---------|--------|------|
| `@connectome/agent-framework` | [Anarchid/agent-framework](https://github.com/Anarchid/agent-framework) | Event-driven agent orchestration |
| `@connectome/context-manager` | [Anarchid/context-manager](https://github.com/Anarchid/context-manager) | Context window management and compression |
| `chronicle` | [Anarchid/chronicle](https://github.com/Anarchid/chronicle) | Branchable event store (Rust + N-API) |
| `membrane` | [Anarchid/membrane](https://github.com/Anarchid/membrane) | LLM provider abstraction |
| `@opentui/core` | [npm](https://www.npmjs.com/package/@opentui/core) | Terminal UI (Zig native core) |
