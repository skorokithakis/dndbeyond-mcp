---
id: dm-nfqfv
status: closed
deps: [dm-njmuj]
links: []
created: 2026-10-20T13:42:51Z
type: task
priority: 2
assignee: Stavros Korokithakis
---
# Show ability score breakdown with sources

Ready for implementation.

Objective: in character output that lists ability scores (sheet/summary in src/tools/character.ts and src/resources/character.ts, via the shared formatter), show where each score comes from, so the reader can see item/feat bonuses.

Format example: 'CON: 16 (+3) [base 10, +6 Dazzling Cloak]'. Show base, then each non-zero contribution with its source name (item name for item modifiers via componentId -> inventory definition.id; 'race', 'class', 'feat', 'background' or the feature name if cheaply available for other buckets; 'other' for bonusStats). For set: 'set 19 (Gloves of Dexterity)'. For override: 'override N'. Omit the brackets if the score is base only.

Implement by having the calculation return a breakdown alongside the total (reuse the logic from the previous ticket; do not duplicate the rules).

Non-goals: breakdowns for AC, HP, skills or saves.

## Acceptance Criteria

Bearbug fixture output shows the cloak as the source of +6 CON and +3 CHA, and the gloves as the source of DEX 19.

