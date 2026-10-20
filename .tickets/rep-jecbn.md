---
id: rep-jecbn
status: closed
deps: [rep-jjbae]
links: []
created: 2026-10-20T14:44:02Z
type: feature
priority: 2
assignee: Stavros Korokithakis
---
# Character custom values tools and AC calculation

Ready for implementation.
Objective: tools to list, set and remove a character's custom values (the sheet's Customize settings: AC, ability scores, saving throws, skills), using the endpoint found in discovery. One generic set/remove tool with a documented, named list of the supported value types; plus a list tool.
get_character / derived stats: apply ONLY the AC-related value types confirmed in discovery (override, bonus, magic bonus or whatever exists). Show the other custom values in the output as listed, not applied. Invalidate character:<id> on write.
Update gnosis entry uxvbtb (derived stats ignore characterValues) to say AC types are now applied and why others are not.
Likely files: src/tools/character.ts (or a new file), src/utils/character-calculations.ts, src/server.ts, src/api/endpoints.ts, tests.
Non-goals: applying ability/save/skill overrides in calculations.


## Notes from discovery
Endpoint PUT character/v5/custom/value; remove = value null and notes null. typeIds: AC 1 override, 4 override base armor, 2 magic bonus, 3 misc bonus; saves 38/39/40 (override/misc/magic, valueId stat id, valueTypeId 1472902489); skills 23/24/25 (valueId skill id, valueTypeId 1958004211). Ability scores are NOT character values: they already have set_ability_score (type 2 bonus, 3 override). Do not duplicate it; the list tool should still show ability bonus/override stats. Apply AC types 1-4 in the AC calculation. Note gnosis uxvbtb said typeId 39 rows with notes 'Epic item' existed; 39 is saving throw misc bonus, update that entry.
