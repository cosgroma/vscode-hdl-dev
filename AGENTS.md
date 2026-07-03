# Agent Instructions

This repository uses issue-driven git-flow. Keep changes small, traceable, and
evidence-backed. Treat this file as a map; durable workflow, architecture, and
validation details live in the linked repo docs.

## Start Here

- Agent harness map: `docs/agent/README.md`
- Issue workflow and git-flow details: `docs/agent/issue-workflow.md`
- Validation matrix: `docs/agent/validation.md`
- Architecture map and module boundaries: `ARCHITECTURE.md`
- Roadmap: `docs/design/mvp-roadmap.md`
- Design direction: `docs/design/initial-extension-design.md`
- Public docs index: `docs/README.md`
- Project board: `HDL Dev Roadmap`
  <https://github.com/users/cosgroma/projects/3>

HDL Dev is a VS Code extension for coordinating HDL project workflows from
inside the editor. The design direction is to keep repo-local HDL scripts as the
source of truth and wrap them with native VS Code surfaces: commands, Output
channels, the Testing API, tree views, status items, and focused artifact
previews.

## Operating Rules

- Start from an existing GitHub issue when possible. If the user asks for
  untracked work, create or identify a tracking issue before branching unless
  they explicitly tell you not to.
- Use the `Ready Queue` project view when choosing work without a direct user
  request: `Readiness = Ready`, sorted by `Recommended Order`.
- Start normal work from `develop` with
  `git flow feature start <issue-number>-short-slug`.
- Use `bugfix`, `release`, `hotfix`, or `support` only when the issue matches
  that branch type.
- Do not commit feature work directly to `main`.
- Commit coherent chunks that compile or are clearly isolated docs/planning
  changes. Reference the issue number in every commit message.
- Use closing keywords only in the final commit or PR that fully satisfies the
  issue.

## Implementation Invariants

- Prefer repo patterns over new abstractions.
- Keep HDL project scripts and Make targets as the source of truth.
- Use explicit process argument arrays in TypeScript where possible.
- Respect workspace trust before running scripts, Make, GHDL, Python, Yosys, or
  `netlistsvg`.
- Serialize commands that share a project build directory.
- Preserve raw command output in the HDL Dev Output channel or test output.
- Add machine-readable script output only when the extension needs reliable
  introspection.
- Promote repeated review feedback into docs, tests, scripts, or lintable rules
  instead of growing this file.

## Validation

Pick checks that match the touched surface. Common commands:

```bash
npm run lint
npm run compile
npm test
make docs-build
make deps-check-ghdl
make agent-harness-check
```

Use `docs/agent/validation.md` for the full validation matrix, including
workflow YAML checks, Doctor smoke checks, docs checks, and evidence capture
expectations.

## Handoff

At the end of a work session, report:

- issue number and title worked
- files changed
- checks run and whether they passed
- commit SHA and branch
- evidence added or still missing
- recommended next issue or next chunk of work

If work is incomplete, leave the branch in a clean, explainable state and state
the next command or code area to inspect.
