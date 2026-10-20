# dndbeyond-mcp

A TypeScript MCP (Model Context Protocol) server for D&D Beyond. Gives Claude (and other MCP-compatible AI assistants) access to your D&D Beyond characters, campaigns, spells, monsters, items, and more.

> **Disclaimer:** This project uses unofficial, reverse-engineered D&D Beyond endpoints. It is not affiliated with, endorsed by, or supported by D&D Beyond or Wizards of the Coast. Endpoints may change without notice.

## Features

- **Character Management** — Read character sheets, update HP, spell slots, death saves, currency
- **Campaign Access** — List campaigns, view party rosters
- **Reference Lookups** — Search and retrieve spells, monsters, magic items, feats, conditions, classes
- **Workflow Prompts** — Session prep, encounter building, level-up guidance, spell recommendations
- **Browser-Based Auth** — Playwright-powered login flow (no manual cookie extraction)

## Installation

The package is not on the npm registry. Every push to `main` publishes a prebuilt tarball as a GitHub release, so you can run the server with `npx` and nothing gets compiled at install time.

Pinned to a commit (recommended, especially for automated runners):

```bash
npx -y https://github.com/skorokithakis/dndbeyond-mcp/releases/download/build-<full commit sha>/dndbeyond-mcp.tgz
```

Latest build:

```bash
npx -y https://github.com/skorokithakis/dndbeyond-mcp/releases/latest/download/dndbeyond-mcp.tgz
```

`npx` caches packages by URL, so the "latest" URL can keep serving an old cached build. Use the pinned URL if you need a specific version.

You can also run straight from the repository. This is slower, because npm installs the dev dependencies and compiles the TypeScript on every cold install:

```bash
npx -y github:skorokithakis/dndbeyond-mcp#<commit sha>
```

### Cold start

Time from a cold `npx` (empty npm cache) to the server answering `initialize`:

| Source | Time |
|---|---|
| `github:...#e8f2d1f` (before prebuilt releases) | 18.0 s |

## Setup

Authentication uses Playwright to open your installed Google Chrome, so it needs Chrome and a clone of the repository. The `npx` installs above don't include Playwright, and `setup_auth` will tell you so when you call it.

```bash
git clone https://github.com/skorokithakis/dndbeyond-mcp.git
cd dndbeyond-mcp
npm install
npm run setup
```

This opens a browser window where you log into D&D Beyond normally. The server captures your session cookie automatically and saves it to `~/.dndbeyond-mcp/config.json`, which the server reads however you run it.

## Claude Desktop Configuration

Add this to your Claude Desktop configuration file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "dndbeyond": {
      "command": "npx",
      "args": ["-y", "https://github.com/skorokithakis/dndbeyond-mcp/releases/latest/download/dndbeyond-mcp.tgz"]
    }
  }
}
```

After adding the configuration, restart Claude Desktop.

## Tools

### Character
- `get_character` — Full character sheet by ID or name
- `list_characters` — All your characters
- `update_hp` — Apply damage or healing
- `update_spell_slots` — Use or restore spell slots
- `update_death_saves` — Record death saves
- `update_currency` — Modify gold/silver/copper
- `use_ability` — Decrement limited-use features

### Campaign
- `list_campaigns` — Your active campaigns
- `get_campaign_characters` — All characters in a campaign

### Reference
- `search_spells` / `get_spell` — Spell lookup with filters
- `search_monsters` / `get_monster` — Monster stat blocks
- `search_items` / `get_item` — Magic item catalog
- `search_feats` — Feat discovery
- `get_condition` — Condition rules
- `search_classes` — Class/subclass info

### Homebrew
- `list_homebrew_creations` — Your homebrew creations with type, ID, and published status
- `get_homebrew_magic_item` — One homebrew magic item with description, modifiers, conditions, and spells
- `list_homebrew_magic_item_modifiers` — A magic item's modifiers with their IDs and values
- `add_homebrew_magic_item_modifier` — Add a modifier to a private magic item (names or IDs)
- `edit_homebrew_magic_item_modifier` — Edit a modifier, preserving fields you do not pass
- `remove_homebrew_magic_item_modifier` — Destructively remove a modifier
- `create_homebrew_magic_item` — Create an item from scratch or from a template
- `update_homebrew_magic_item` — Update basic fields, preserving fields you do not pass
- `delete_homebrew_magic_item` — Destructively delete an item (soft delete on D&D Beyond)

### Utility
- `setup_auth` — Re-run login flow (only works from a repository clone with Playwright installed)
- `check_auth` — Verify session is valid

## Resources

| URI | Description |
|-----|-------------|
| `dndbeyond://characters` | Your character list |
| `dndbeyond://character/{id}` | Character sheet |
| `dndbeyond://character/{id}/spells` | Spell list |
| `dndbeyond://character/{id}/inventory` | Inventory |
| `dndbeyond://campaigns` | Your campaigns |
| `dndbeyond://campaign/{id}/party` | Party roster |

## Prompts

| Prompt | Purpose |
|--------|---------|
| `character-summary` | Full character rundown |
| `session-prep` | DM session preparation |
| `encounter-builder` | Balanced encounter design |
| `spell-advisor` | Spell recommendations |
| `level-up-guide` | Level-up walkthrough |
| `rules-lookup` | Rules clarification |

## Security

This server stores your D&D Beyond session cookie locally at `~/.dndbeyond-mcp/config.json`. The cookie provides full access to your D&D Beyond account. Never share this file. The server only communicates with `dndbeyond.com` domains.

## License

MIT
