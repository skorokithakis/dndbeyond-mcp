---
id: rep-eezxm
status: closed
deps: [rep-pivyn]
links: []
created: 2026-10-20T14:44:01Z
type: feature
priority: 2
assignee: Stavros Korokithakis
---
# Homebrew magic items: list and read tools

Ready for implementation.
Objective: MCP tools to list the user's homebrew creations (type, ID, published/unpublished) and read one magic item in full (basic info, description, modifiers, conditions, spells).
Use only endpoints documented by the discovery task. Add URL builders to src/api/endpoints.ts. If the editor is HTML-form based, add the minimal client support needed here (fetch HTML with cookie auth, read form fields and antiforgery token); later homebrew write tasks reuse it. Prefer a small, well-known HTML parser dependency over hand-written regex if parsing is non-trivial.
Likely files: new src/tools/homebrew.ts, src/server.ts, src/api/client.ts, src/api/endpoints.ts, tests.
Non-goals: writes, non-magic-item types (list may show them, read need not support them).


## Notes from discovery
See docs/api-research.md 'Homebrew Magic Items'. Read path: game-data/items?sharingSetting=2 (filter homebrew; modifiers in grantedModifiers); list and published status from GET /my-creations HTML. Saved config only has CobaltSession; www form flows need a cookie jar (RequestVerificationToken etc.) and per-page security-token + authenticity-token. Build that shared www-form helper here. game-data/items can be stale (eventual consistency); do not hide it, say so in the read tool description.
