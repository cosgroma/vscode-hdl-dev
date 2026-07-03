# Issue Workflow

HDL Dev uses issue-driven git-flow. Every implementation or documentation slice
should be traceable to a GitHub issue unless a maintainer explicitly asks for an
untracked experiment.

## Finding Work

Default to the GitHub Project queue when the user has not named a specific
task:

- Project: `HDL Dev Roadmap`
  <https://github.com/users/cosgroma/projects/3>
- View: `Ready Queue`
- Filters and ordering: `Readiness = Ready`, sorted by `Recommended Order`
- Repository: `cosgroma/vscode-hdl-dev`

Useful CLI checks:

```bash
gh issue list \
  --repo cosgroma/vscode-hdl-dev \
  --state open \
  --limit 100 \
  --json number,title,milestone,labels,url
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

If the user requests new work that is not already tracked, create a focused
issue before branching so the branch, commit, evidence, and handoff have a
stable reference.

## Git Flow

Before starting work:

```bash
git fetch origin
git checkout develop
git pull --ff-only origin develop
git status --short --branch
```

Branch model:

- `main`: production branch and GitHub Pages deployment source.
- `develop`: default branch and integration branch.
- `feature/*`: normal feature work from `develop`.
- `bugfix/*`: non-release bug fixes from `develop`.
- `release/*`: release stabilization from `develop`, merged to `main` and
  `develop`.
- `hotfix/*`: urgent production fixes from `main`, merged to `main` and
  `develop`.
- `support/*`: long-lived maintenance branches when needed.

Start normal feature work with:

```bash
git flow feature start <issue-number>-short-slug
```

Examples:

```bash
git flow feature start 1-project-discovery
git flow feature start 2-dependency-doctor
```

Finish normal feature work back to `develop` only after review or when the
maintainer explicitly asks:

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
5. Recommend the next chunk of work in the final response or handoff.

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

- `Needs Evidence`: implementation or proof is incomplete.
- `Evidence Ready`: evidence has been collected and is ready for review.
- `Accepted`: maintainer accepts the evidence and the issue can close.

Milestone evidence gate issues must not close until all implementation issues in
that milestone are closed or explicitly moved.

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
