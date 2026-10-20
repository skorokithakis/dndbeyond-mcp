---
id: rep-dmmbt
status: closed
deps: []
links: []
created: 2026-10-20T17:55:56Z
type: task
priority: 2
assignee: Stavros Korokithakis
---
# Lazy-load playwright; move it to devDependencies

ready for implementation

Objective: a normal server start must not load or need playwright. Today src/tools/auth.ts statically imports setup/auth-flow.js, which imports playwright, so a start without playwright crashes with ERR_MODULE_NOT_FOUND.

Scope: src/tools/auth.ts (dynamic import of ../../setup/auth-flow.js inside setupAuth), package.json + package-lock.json (playwright from dependencies to devDependencies), tests that mock auth-flow if they break.

Behaviour: if the dynamic import fails because playwright is missing, setup_auth returns a clear text result: Playwright is not installed; clone the repo, run npm install, then npm run setup. Other import errors keep the existing 'Authentication failed' path. When playwright is present (repo clone), setup_auth works as before.

Non-goals: optionalDependencies or peerDependencies (optional deps still install by default); changes to setup/ scripts; installing browsers.

## Acceptance Criteria

Server starts and lists tools with playwright absent from node_modules. setup_auth without playwright returns the clear message. npm test passes.

