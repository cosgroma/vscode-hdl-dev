# Issue 13: Spec JSON Schemas

Issue: <https://github.com/cosgroma/vscode-hdl-dev/issues/13>

## Goal

Add waveform and schematic JSON schemas so VS Code validates and completes HDL
Dev spec files under the documented waveform and schematic spec directories.

## Scope

- Document schema source fields from GEnCor and the HDL Dev fixture.
- Add repo-owned waveform and schematic JSON schema files.
- Contribute VS Code `jsonValidation` associations scoped to HDL Dev spec
  directories.
- Add representative valid and invalid schema fixtures.
- Validate the schema files, extension metadata, representative fixtures, and
  existing lightweight fixture specs in automated tests.
- Record local validation and remaining issue evidence.

Out of scope:

- Running `ghwdump -H` to validate signal paths.
- Validating schematic `extends` targets against the filesystem.
- Validating regex semantics beyond declaring regex string fields.
- Scaffolding new specs.
- Stale-artifact indicators or SVG preview behavior.

## Checklist

- [x] Schema design doc added.
- [x] MkDocs navigation links the design doc and this plan.
- [x] Design covers GEnCor fields and fixture aliases.
- [x] Design covers VS Code contribution shape.
- [x] Design covers implementation tests and evidence.
- [x] Issue and project readiness are updated.
- [x] Waveform schema added under `schemas/`.
- [x] Schematic schema added under `schemas/`.
- [x] `package.json` contributes scoped `jsonValidation` associations.
- [x] Representative valid and invalid schema fixtures added.
- [x] Existing lightweight HDL fixture specs validate against the schemas.
- [x] Local implementation checks pass.
- [x] Issue evidence comment is updated with implementation evidence.
- [x] PR CI URL is attached.
- [x] VS Code diagnostics or completion capture is attached.

## Decisions

- Schema files live under `schemas/` at the repository root.
- `package.json` uses `contributes.jsonValidation` with file matches scoped to
  `**/docs/waveforms/specs/*.json` and
  `**/docs/schematics/specs/*.json`.
- Waveform schemas should prefer GEnCor `tb` but accept fixture alias
  `testbench`.
- Schematic schemas should accept inherited specs without `top`.
- The initial schematic schema should accept the fixture alias `include` while
  documenting that GEnCor uses the more specific include/exclude filter fields.
- Use JSON Schema draft-07 for broad VS Code JSON language service
  compatibility.
- Add `ajv` as a dev dependency so extension tests can directly validate the
  schema contracts.

## Evidence

Design slice local validation:

- `make docs-build` passed with MkDocs strict mode.
- `make agent-harness-check` passed.

Issue/project update:

- Project `#13` moved to `Status = In Progress` and `Readiness = Ready` after
  the design slice was committed.

Implementation slice local validation:

- `npm run compile` passed.
- `npm test` passed with 55 tests, including schema validation coverage. The
  test run also executed `npm run compile` and `npm run lint` through `pretest`.
- `make docs-build` passed with MkDocs strict mode.
- `make agent-harness-check` passed.
- Issue evidence comment:
  <https://github.com/cosgroma/vscode-hdl-dev/issues/13#issuecomment-4921316945>
- PR opened:
  <https://github.com/cosgroma/vscode-hdl-dev/pull/33>
- Hosted PR checks are attached through the issue evidence comment:
  <https://github.com/cosgroma/vscode-hdl-dev/issues/13#issuecomment-4921418791>
- VS Code schema diagnostic capture is attached through the PR evidence comment:
  <https://github.com/cosgroma/vscode-hdl-dev/pull/33#issuecomment-4921418802>

Remaining before closure:

- Maintainer requested merge and closeout on July 9, 2026.
