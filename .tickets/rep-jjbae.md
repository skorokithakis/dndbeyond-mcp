---
id: rep-jjbae
status: closed
deps: [rep-eezxm, rep-kcnhv]
links: []
created: 2026-10-20T14:44:01Z
type: feature
priority: 2
assignee: Stavros Korokithakis
---
# Homebrew magic items: create, update, delete tools

Ready for implementation.
Objective: tools to create a magic item (from scratch, or from a template item), update name, description and other basic fields, and delete an item.
Update must keep fields the caller did not pass (load current form values first). Description is HTML on DDB; accept text/HTML and document which.
Published items: if DDB rejects or does not allow the edit, return a clear error that says the item is published. No automatic copy.
Delete tool description must say it is destructive and permanent.
After any homebrew write, invalidate cached character data (all character:* keys or a full cache clear), because a homebrew change can change any character that uses the item.
Non-goals: publishing, conditions and spells editing, other homebrew types.


## Notes from discovery
Delete is a soft delete: the item moves to the Deleted filter and can be restored on the site. Say that in the delete tool description. Description must be sent as item-description-wysiwyg (item-description alone is ignored). Published-item behaviour could not be observed (no published items on the account): read status from the list and refuse writes to published items with a clear error before sending anything.
