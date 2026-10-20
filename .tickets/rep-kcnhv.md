---
id: rep-kcnhv
status: closed
deps: [rep-eezxm]
links: []
created: 2026-10-20T14:44:02Z
type: feature
priority: 2
assignee: Stavros Korokithakis
---
# Homebrew magic items: modifier tools

Ready for implementation.
Objective: tools to list, add, edit and remove a magic item's modifiers. Fields: type, subtype, fixed value, dice count, die type, ability score, details (plus attunement flag if the form has it).
Accept human-readable names for type/subtype where the discovery task found a mapping; also accept numeric IDs. Reject unknown values with a clear error listing how to find valid ones.
If discovery showed modifiers need the item to be saved again, do that inside the tool.
Same published-item error and character cache invalidation as the create/update/delete task (share the helper). Remove tool description must say it is destructive.
Non-goals: conditions and spells.


## Notes from discovery
Modifiers are separate entities; no item re-save needed. Subtype list (about 1,600 entries) is embedded in the editor page JS, types are form options; read them from the page (cache them), do not hard-code the full table. Same published-item refusal as the create/update/delete task.

## Order note
Tasks run in series. This task now runs before the create/update/delete task, so build the shared published-item refusal and character cache invalidation helper here; the create/update/delete task reuses it.
