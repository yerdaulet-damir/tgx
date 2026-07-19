# @tgxjs/mcp

An [MCP](https://modelcontextprotocol.io) server that gives AI coding agents the
**tgx** Telegram-bot build reference on demand — so Claude Code, Cursor, or any MCP
client writes correct tgx bots without the repo pasted into context.

## Tools

- `tgx_guide` — the full tgx build reference (buttons, menus, feed mode, files,
  Telegram Stars payments, UI kit, Do-NOT list).
- `tgx_list_examples` — list the example bots.
- `tgx_example` — fetch one example bot's full source by name.

Docs are fetched from the canonical repo at run time (with an offline fallback), so
they never drift from the code.

## Install

**Claude Code**

```bash
claude mcp add tgx -- npx -y @tgxjs/mcp
```

**Cursor** — add to `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global):

```json
{
  "mcpServers": {
    "tgx": { "command": "npx", "args": ["-y", "@tgxjs/mcp"] }
  }
}
```

Any other MCP client: run `npx -y @tgxjs/mcp` as a stdio server.

## License

MIT
