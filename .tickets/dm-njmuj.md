---
id: dm-njmuj
status: closed
deps: []
links: []
created: 2026-10-20T13:42:51Z
type: task
priority: 2
assignee: Stavros Korokithakis
---
# Fix derived stat calculations (ability scores, AC, max HP)

Ready for implementation.

Objective: make src/utils/character-calculations.ts produce the same ability scores, AC and max HP as the D&D Beyond website. All tools/resources already use these functions.

Bugs to fix:
1. sumModifierBonuses counts only type 'bonus'. Also count 'stacking-bonus' (homebrew items use it for ability scores).
2. type 'set' modifiers are ignored (e.g. Gloves of Dexterity: set dexterity-score 19). Final score = max(computed score, highest applicable set value). Override stats still win over everything.
3. Use fixedValue when value is null.
4. modifiers.item contains entries from unequipped / unattuned items. Only count an item modifier if the inventory item whose definition.id == modifier.componentId is equipped, and (if modifier.requiresAttunement) attuned.
5. Armor detection uses definition.type, which is null/'' for real armor. Detect via armorTypeId (1 light, 2 medium, 3 heavy, 4 shield); filterType is 'Armor'. Base armorClass excludes magic bonus (+1 armor comes through an armor-class modifier; do not double count).
6. If several body armors are equipped, use the one giving the highest AC.
7. Max HP: add CON modifier x total level, plus hit-points-per-level modifiers. Respect overrideHitPoints. Current HP derives from max as today.

Test fixture: a raw DDB character JSON is at /tmp/opencode/scratch/bearbug.json (the data envelope). Make a trimmed fixture from it in tests/: keep only the fields the calculations need, strip all free text (backstory, notes, traits, item descriptions, names other than item names) and any user/account ids. Expected values for it: STR 16, DEX 19, CON 16, INT 16, WIS 9, CHA 20, AC 19, max HP 99.

Non-goals: full DDB rules engine; spell/feature AC formulas beyond what exists; reading characterValues (meaning unknown); output format changes (separate ticket).

## Acceptance Criteria

Bearbug fixture yields STR 16, DEX 19, CON 16, INT 16, WIS 9, CHA 20, AC 19, max HP 99. Existing tests pass (update them only where they encoded the old wrong behaviour).

