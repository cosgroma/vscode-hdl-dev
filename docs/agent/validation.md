# Validation

Pick checks that match the touched surface. Prefer fast, focused checks first,
then broaden when a change touches shared behavior, extension activation,
workflow configuration, or public docs.

## Check Matrix

| Touched surface | Run |
| --- | --- |
| Agent harness docs, plan docs, fixture docs, MkDocs nav | `make agent-harness-check` and `make docs-build` |
| TypeScript extension behavior | `npm run lint`, `npm run compile`, and `npm test` |
| Extension contribution metadata in `package.json` | `npm run compile` and `npm test` |
| Dependency scripts or Doctor behavior | `make deps-check-ghdl`, `npm run lint`, `npm run compile`, and `npm test` |
| GHDL bootstrap behavior | `make deps-install-ghdl` and `make deps-check-ghdl` |
| Documentation site content | `make docs-build` |
| GitHub Actions workflow YAML | the workflow YAML parse check below |
| VS Code tree, command, or Testing API visible behavior | automated tests plus screenshot or short capture when the issue requires visible evidence |

## Common Commands

```bash
npm run lint
npm run compile
npm test
make docs-build
make deps-check-ghdl
make agent-harness-check
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

## Harness Check

`make agent-harness-check` validates the structure that agents rely on:

- required harness docs and directories exist
- `AGENTS.md` remains a concise map
- repo-local skill frontmatter is present
- local Markdown links resolve
- every Markdown file under `docs/` is represented in `mkdocs.yml`

When this check fails, update the source docs or navigation instead of working
around the validator.

## Evidence Capture

Record evidence in the issue, PR, or milestone evidence document. Good evidence
is concrete and reproducible:

- command transcripts for local checks
- CI or Pages run URLs for hosted checks
- screenshots for visible VS Code surfaces
- fixture paths and exact commands for manual reproduction

Keep generated evidence files in `docs/evidence/` only when they are intended to
be versioned with the repository.
