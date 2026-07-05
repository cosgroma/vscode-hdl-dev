# Issue 13: Spec Schema Design

Issue: <https://github.com/cosgroma/vscode-hdl-dev/issues/13>

## Goal

Make issue `#13` implementation-ready by defining the waveform and schematic
JSON schema contracts, VS Code contribution shape, fixture strategy, and
evidence plan.

## Scope

- Document schema source fields from GEnCor and the HDL Dev fixture.
- Decide schema file locations and VS Code `jsonValidation` associations.
- Define waveform and schematic root fields, required fields, aliases, and
  known limits.
- Define validation and evidence expectations for the implementation slice.
- Move project readiness from `Needs Design` to `Ready` after the design is
  committed.

Out of scope:

- Adding schema JSON files.
- Updating `package.json`.
- Adding validation scripts or dependencies.
- Capturing VS Code schema screenshots.

## Checklist

- [x] Schema design doc added.
- [x] MkDocs navigation links the design doc and this plan.
- [x] Design covers GEnCor fields and fixture aliases.
- [x] Design covers VS Code contribution shape.
- [x] Design covers implementation tests and evidence.
- [x] Local docs/harness checks pass.
- [x] Issue and project readiness are updated.

## Decisions

- Future schema files should live under `schemas/` at the repository root.
- Future `package.json` contributions should use `contributes.jsonValidation`
  with file matches scoped to `**/docs/waveforms/specs/*.json` and
  `**/docs/schematics/specs/*.json`.
- Waveform schemas should prefer GEnCor `tb` but accept fixture alias
  `testbench`.
- Schematic schemas should accept inherited specs without `top`.
- The initial schematic schema should accept the fixture alias `include` while
  documenting that GEnCor uses the more specific include/exclude filter fields.

## Evidence

Local validation:

- `make docs-build` passed with MkDocs strict mode.
- `make agent-harness-check` passed.

Issue/project update:

- Project `#13` should move to `Status = In Progress` and `Readiness = Ready`
  after this design slice is committed.
