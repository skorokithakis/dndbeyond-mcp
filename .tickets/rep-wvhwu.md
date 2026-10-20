---
id: rep-wvhwu
status: closed
deps: [rep-dmmbt, rep-htbmo]
links: []
created: 2026-10-20T17:55:57Z
type: task
priority: 2
assignee: Stavros Korokithakis
---
# README: run from release tarball, auth, measurements

ready for implementation

Objective: README Installation/Setup/config sections describe how it really works. The npm package dndbeyond-mcp is unpublished, so 'npx dndbeyond-mcp' and 'npm install -g dndbeyond-mcp' must go.

Content: pinned tarball URL (recommended for automated runners, since npx caches by URL and the latest URL can serve a stale cached copy), latest tarball URL, github:skorokithakis/dndbeyond-mcp#<sha> as a slower alternative that compiles on install; Claude Desktop config using the tarball URL; authentication now requires a repo clone (npm install, npx playwright install chromium, npm run setup); setup_auth from an npx install returns an error. Short 'Cold start' note with before/after numbers (filled in by the verification ticket).

Non-goals: rewriting the tool/resource/prompt lists.

