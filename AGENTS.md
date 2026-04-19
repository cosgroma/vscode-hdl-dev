# Agent Instructions

This repository uses issue-driven git-flow. Keep changes small, traceable, and
evidence-backed.

## Project Context

HDL Dev is a VS Code extension for coordinating HDL project workflows from
inside the editor. The design direction is to keep repo-local HDL scripts as the
source of truth and wrap them with native VS Code surfaces: commands, Output
channels, the Testing API, tree views, status items, and focused artifact
previews.

Primary planning sources:

- GitHub Project: `HDL Dev Roadmap`
  <https://github.com/users/cosgroma/projects/3>
- Repository: `cosgroma/vscode-hdl-dev`
- Roadmap: `docs/design/mvp-roadmap.md`
- Design: `docs/design/initial-extension-design.md`
- Public docs: <https://cosgroma.github.io/vscode-hdl-dev/>

## Finding Work

Start by finding the next ready issue rather than inventing work.

Preferred GitHub UI view:

- Open the `HDL Dev Roadmap` project.
- Use the `Ready Queue` view described in the project README:
  `Readiness = Ready`, sorted by `Recommended Order`.
- Pick the lowest-order issue that is not already in progress.

Useful CLI checks:

```bash
gh issue list \
  --repo cosgroma/vscode-hdl-dev \
  --state open \
  --limit 100 \
  --json number,title,milestone,labels,url

gh project item-list 3 \
  --owner cosgroma \
  --limit 100 \
  --format json
```

To inspect project planning fields from the CLI:

```bash
gh api graphql \
  -f login=cosgroma \
  -F number=3 \
  -f query='
query($login: String!, $number: Int!) {
  user(login: $login) {
    projectV2(number: $number) {
      items(first: 50) {
        nodes {
          content { ... on Issue { number title url } }
          fieldValues(first: 20) {
            nodes {
              ... on ProjectV2ItemFieldNumberValue {
                number
                field { ... on ProjectV2FieldCommon { name } }
              }
              ... on ProjectV2ItemFieldTextValue {
                text
                field { ... on ProjectV2FieldCommon { name } }
              }
              ... on ProjectV2ItemFieldSingleSelectValue {
                name
                field { ... on ProjectV2FieldCommon { name } }
              }
            }
          }
        }
      }
    }
  }
}'
```

Treat `Readiness = Ready` and the lowest `Recommended Order` as the default next
work queue. If you choose a different issue, explain why in the PR or handoff.

## Git Flow

The branch model is:

- `main`: production branch and GitHub Pages deployment source
- `develop`: default branch and integration branch
- `feature/*`: normal feature work from `develop`
- `bugfix/*`: non-release bug fixes from `develop`
- `release/*`: release stabilization from `develop`, merged to `main` and
  `develop`
- `hotfix/*`: urgent production fixes from `main`, merged to `main` and
  `develop`
- `support/*`: long-lived maintenance branches when needed

Before starting work:

```bash
git fetch origin
git checkout develop
git pull --ff-only origin develop
git status --short --branch
```

Start issue work with a git-flow branch:

```bash
git flow feature start <issue-number>-short-slug
```

Examples:

```bash
git flow feature start 1-project-discovery
git flow feature start 2-dependency-doctor
```

Use `bugfix`, `release`, or `hotfix` only when the issue and branch direction
match that kind of work.

Finish normal feature work back to `develop`:

```bash
git flow feature finish <issue-number>-short-slug
git push origin develop
```

Do not commit feature work directly to `main`. `main` only accepts `release/*`
and `hotfix/*` pull requests.

## Commit Methodology

Commit whenever a coherent chunk of work lands. A coherent chunk should compile
or be clearly isolated documentation/planning work.

Every commit that implements or documents issue-scoped work must reference the
issue number in the commit message.

Preferred commit message style:

```text
Add project discovery service (#1)
Test dependency doctor trust handling (#2)
Document v0.1 evidence checklist (#3)
```

Use closing keywords only in the final commit or PR that fully satisfies the
issue:

```text
Complete Dependency Doctor workflow (fixes #2)
```

Do not use `fixes #N` for partial work. Use plain references like `refs #N`,
`for #N`, or `(#N)` until the acceptance criteria and evidence checklist are
complete.

When a chunk lands:

1. Run the relevant checks.
2. Commit with the issue number in the message.
3. Push the branch or `develop` when appropriate.
4. Capture evidence in the issue or PR.
5. Recommend the next chunk of work in your final response or handoff.

## Evidence Requirements

Issues are not done until their `Evidence Required` checklist is satisfied.
Typical evidence includes:

- CI run URL
- Doctor smoke URL or local `make deps-check-ghdl` transcript
- `make docs-build` output or Pages run URL
- screenshots or short captures for visible VS Code surfaces
- test output for the relevant service, command, or UI behavior
- documentation updates where the issue changes user-facing behavior

Use the GitHub Project `Evidence State` field:

- `Needs Evidence`: implementation or proof is incomplete
- `Evidence Ready`: evidence has been collected and is ready for review
- `Accepted`: maintainer accepts the evidence and the issue can close

Milestone evidence gate issues must not close until all implementation issues in
that milestone are closed or explicitly moved.

## Validation

Pick checks that match the touched surface. Common commands:

```bash
npm run lint
npm run compile
npm test
make docs-build
make deps-check-ghdl
```

For workflow changes, parse workflow YAML:

```bash
python3 - <<'PY'
import pathlib, yaml
for path in pathlib.Path(".github/workflows").glob("*.yml"):
    with path.open() as f:
        yaml.safe_load(f)
    print(f"ok {path}")
PY
```

For dependency or Doctor changes, run:

```bash
make deps-install-ghdl
make deps-check-ghdl
```

## Implementation Principles

- Prefer repo patterns over new abstractions.
- Keep HDL project scripts and Make targets as the source of truth.
- Use explicit process argument arrays in TypeScript where possible.
- Respect workspace trust before running scripts, Make, GHDL, Python, Yosys, or
  `netlistsvg`.
- Serialize commands that share a project build directory.
- Preserve raw command output in the HDL Dev Output channel or test output.
- Add machine-readable script output only when the extension needs reliable
  introspection.

## Handoff Expectations

At the end of a work session, report:

- issue number and title worked
- files changed
- checks run and whether they passed
- commit SHA and branch
- evidence added or still missing
- recommended next issue or next chunk of work

If work is incomplete, leave the branch in a clean, explainable state and state
the next command or code area to inspect.
