---
id: rep-htbmo
status: closed
deps: []
links: []
created: 2026-10-20T17:55:57Z
type: task
priority: 2
assignee: Stavros Korokithakis
---
# GitHub Actions: prebuilt tarball release per push to main

ready for implementation

Objective: every push to main (and workflow_dispatch) publishes a prebuilt npm tarball as a GitHub release asset, so users run npx -y <URL> with no tsc at install.

Scope: new .github/workflows/release.yml.

Steps: checkout, setup-node (node 20+ ok, use 22), npm ci, npm run build, npm pack, rename the tarball to dndbeyond-mcp.tgz, then gh release create build-${GITHUB_SHA} dndbeyond-mcp.tgz --target $GITHUB_SHA with a short title/notes, as a normal (not pre) release so /releases/latest/download/dndbeyond-mcp.tgz resolves. Needs permissions: contents: write and GH_TOKEN from github.token. Use only the gh CLI on the runner, no third-party release actions.

Resulting URLs: https://github.com/skorokithakis/dndbeyond-mcp/releases/download/build-<sha>/dndbeyond-mcp.tgz and https://github.com/skorokithakis/dndbeyond-mcp/releases/latest/download/dndbeyond-mcp.tgz

Caveats: keep the prepare script in package.json (the github:#sha path needs it; tarball installs do not run prepare). Make a re-run for the same sha not fail hard (e.g. gh release upload --clobber when the release exists, or skip).

Non-goals: npm registry publishing, version bumps, changelogs, shrinkwrap.

