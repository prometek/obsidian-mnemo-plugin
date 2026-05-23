# Mnemo — Obsidian Plugin

Mnemo connects your Obsidian vault to AI tools (Claude Desktop, Cursor, etc.) via the [Model Context Protocol (MCP)](https://modelcontextprotocol.io). It automatically installs and manages the [`obsidian-mnemo`](https://github.com/prometek/obsidian-mnemo) server, which exposes your vault as a set of MCP tools: read, write, semantic search, folder management, and more.

## What it does

- **Installs `obsidian-mnemo` automatically** — no manual Python setup needed.
- **Starts the MCP server** when Obsidian opens (optional), stops it when Obsidian closes.
- **Shares the server** with other MCP clients — Claude Desktop and Cursor can connect to the same running instance while Obsidian is open.
- **Semantic search** — the server indexes your vault with sentence-transformers + ChromaDB so AI tools can retrieve notes by meaning, not just keywords.

## Requirements

- **Desktop only** (macOS, Linux, Windows)
- [`uv`](https://docs.astral.sh/uv/) installed — the plugin uses it to install `obsidian-mnemo` automatically, Python included

If `uv` is not installed, the plugin falls back to `pip` (requires Python 3.11+). If neither is available, install manually:

```bash
uv tool install obsidian-mnemo
```

## Installation

Install via **Obsidian Community Plugins** (Settings → Community plugins → Browse → search "Mnemo"), or via [BRAT](https://github.com/TfTHacker/obsidian42-brat) for beta versions.

Once installed, the plugin will auto-install the `obsidian-mnemo` server on first start.

## Settings

| Setting | Default | Description |
|---|---|---|
| Port | `8765` | Port for the MCP server |
| ChromaDB path | *(default)* | Where the vector index is stored |
| Log level | `INFO` | Server log verbosity |
| Auto-start | on | Start the server when Obsidian loads |
| Show logs | on | Display server logs in the settings tab |
| Show notices | on | Show notifications for server events |

## Connecting AI tools

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "obsidian": {
      "url": "http://127.0.0.1:8765/sse",
      "headers": {
        "Authorization": "Bearer <token>"
      }
    }
  }
}
```

The bearer token is generated on first server start and stored at `~/.obsidian-mnemo/config.json`.

### Cursor

Add the same SSE URL in Cursor's MCP settings under **Settings → MCP**.

## How it works

The plugin spawns `obsidian-mnemo` as a background process. On first run, it indexes your entire vault (this may take a minute). Subsequent starts are fast — the index is persisted in ChromaDB.

The server uses a Bearer token for authentication, generated once and stored locally. It never leaves your machine.

## License

MIT
