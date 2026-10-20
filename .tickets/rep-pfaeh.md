---
id: rep-pfaeh
status: closed
deps: [rep-wvhwu]
links: []
created: 2026-10-20T17:55:57Z
type: task
priority: 2
assignee: Stavros Korokithakis
---
# Verify cold start from the release URL and real tools

ready for implementation

Objective: after commit and push to main, confirm the workflow made release build-<sha>, then measure with an empty npm cache (npm_config_cache=<fresh dir>): cold npx -y <pinned URL> time to initialize reply and tools/list; and cold npx -y github:skorokithakis/dndbeyond-mcp#<sha> still starts. Call list_characters, get_character (one id from the list) and list_homebrew_creations against the real account, read only. Do not read or print ~/.dndbeyond-mcp/config.json. Report numbers; put final numbers in README.

Baseline (before, this machine): github:#e8f2d1f cold 18.0 s; split clone 1.1 s, full deps install 2.6 s, tsc 2.8 s; local tarball (with playwright) cold 6.4-7.7 s.

