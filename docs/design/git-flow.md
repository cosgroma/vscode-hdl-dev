# Git Flow

This repository uses the standard git-flow branch model:

- `main`: production releases only.
- `develop`: integration branch for the next release.
- `feature/*`: new work branched from `develop`, merged back to `develop`.
- `bugfix/*`: non-release bug fixes branched from `develop`, merged back to
  `develop`.
- `release/*`: stabilization branches from `develop`, merged to both `main` and
  `develop`.
- `hotfix/*`: urgent production fixes from `main`, merged to both `main` and
  `develop`.
- `support/*`: long-lived maintenance branches when needed.

Local git-flow is initialized with:

```bash
git flow init -d
```

The initialized settings are:

```text
production branch: main
development branch: develop
feature prefix: feature/
bugfix prefix: bugfix/
release prefix: release/
hotfix prefix: hotfix/
support prefix: support/
version tag prefix: empty
```

## GitHub Actions

The workflow setup follows that branch model:

- `CI` runs on pushes to `main`, `develop`, and git-flow working branch prefixes,
  and on pull requests into `main` or `develop`.
- `Doctor GHDL Smoke` runs on pushes to `main`, `develop`, `release/*`, and
  `hotfix/*` when relevant extension, dependency, or workflow files change. It
  also runs on relevant pull requests into `main` or `develop` and remains
  manually dispatchable.
- `Git Flow Policy` validates pull request direction:
  - `main` only accepts `release/*` and `hotfix/*`.
  - `develop` accepts `feature/*`, `bugfix/*`, `release/*`, `hotfix/*`, and
    `support/*`.

This keeps feature work off `main` while still letting release and hotfix
branches receive the heavier Doctor smoke coverage before they land.
