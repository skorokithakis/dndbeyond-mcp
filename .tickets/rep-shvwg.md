---
id: rep-shvwg
status: open
deps: [rep-jjbae, rep-kcnhv, rep-jecbn]
links: []
created: 2026-10-20T14:44:02Z
type: task
priority: 2
assignee: Stavros Korokithakis
---
# Live acceptance run

Ready for implementation.
Objective: run the new tools against the real account through the built MCP server (or its handlers) and report results.
1. List homebrew; read the Dazzling Cloak with modifiers.
2. Create a test item, update its name and description, add/edit/remove a modifier, delete it. Confirm it is gone.
3. Dazzling Cloak (unpublished): add a Bonus / Armor Class modifier, fixed value 1, details 'Too Pretty to Hit'. Read Bearbug (read only): AC expected 21. Then change the existing Bonus / Armor Class modifier from 3 to 2. Bearbug AC expected 20. Append to the cloak description (keep the existing text) these two paragraphs, verbatim, with the bold labels:
**Too Pretty to Hit.** Even enemies hesitate before they hurt something this beautiful. You gain a +1 bonus to Armor Class.
**Flawless Complexion.** The cloak won't let its wearer stay damaged. Cuts close and bruises fade, because beauty must be preserved. You regain 1d6 hit points at the start of your turn if you have at least 1 hit point.
4. Zenethor: add a +1 AC custom bonus, get_character shows +1; remove it, get_character shows the original AC. Zenethor must end in its starting state.
Never write to Bearbug directly. Report any step that fails; do not work around it with manual edits.

## Acceptance Criteria

Every step above passes, or the report says which step failed and why.


## Notes from discovery
character-service is eventually consistent: get_character can return stale or out-of-order item modifier values for several minutes after a homebrew edit. For steps 3 and 4, re-read with waits (a few minutes max) before calling a step failed. Zenethor's starting displayed AC was 23.
