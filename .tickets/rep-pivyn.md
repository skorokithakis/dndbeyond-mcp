---
id: rep-pivyn
status: closed
deps: []
links: []
created: 2026-10-20T14:44:01Z
type: task
priority: 2
assignee: Stavros Korokithakis
---
# Discover homebrew editor and character Customize endpoints

Ready for implementation.
Objective: capture the real requests D&D Beyond's web UI makes, and document them in docs/api-research.md (new sections). No MCP tools in this task.

Capture, using the saved session in ~/.dndbeyond-mcp/config.json (user approved; never print or commit cookie values) and the existing Playwright capture approach (setup/capture-builder.ts, setup/explore-endpoints.ts; extend one or add setup/capture-homebrew.ts):
- Homebrew magic items on www.dndbeyond.com: My Homebrew Creations list (type, ID, published status), item view, create from scratch, create from template, edit/save basic fields and description, add/edit/remove modifier, delete. Record method, URL, content type, form field names, CSRF/antiforgery token source, redirects and response shape.
- Is there a JSON read path for one homebrew item with modifiers (e.g. character-service game-data/items includes homebrew collection)?
- Does a modifier change need the item to be saved again before it takes effect?
- What happens when editing/deleting a published item (inspect form/UI; do NOT publish anything to test).
- Does get_character pick up a homebrew item change immediately (server side)?
- Character sheet Customize settings (AC override/bonus/magic bonus, ability score override/other bonus, saving throw and skill overrides/bonuses): endpoint, body, and the characterValues typeId/valueTypeId/valueId each produces.
- Modifier enum values (type, subtype, die type, ability) and where the UI gets them.

Live-write rules: character writes ONLY on Zenethor (never Bearbug). Revert every change to Zenethor. Create a throwaway homebrew item for editor capture and delete it after. Do not touch other homebrew items. If D&D Beyond blocks the automated browser, stop and report.

Non-goals: no tool code, no other homebrew types (feats, spells, monsters).

## Acceptance Criteria

docs/api-research.md answers every question above, or states plainly what could not be found. Zenethor and the user's homebrew list are back to their starting state.

