# Spec JSON Schemas

Issue: <https://github.com/cosgroma/vscode-hdl-dev/issues/13>

This document records issue `#13` schema contracts, implementation notes, and
evidence expectations. The goal is editor validation and completion for waveform
and schematic spec JSON files without changing the project Makefile contracts or
running workspace code.

## Goals

- Add JSON schemas for waveform specs in `docs/waveforms/specs/*.json`.
- Add JSON schemas for schematic specs in `docs/schematics/specs/*.json`.
- Contribute schema associations through `package.json` so VS Code validates
  only HDL Dev spec files.
- Keep schemas compatible with existing GEnCor spec files and the lightweight
  HDL Dev fixture workspace.
- Document required fields, optional fields, and common pitfalls.

Out of scope for issue `#13`:

- running `ghwdump -H` to validate signal paths
- validating schematic `extends` targets against the filesystem
- validating regex semantics beyond declaring regex string fields
- scaffolding new specs
- stale-artifact indicators or SVG preview behavior

Those semantic workflows belong to later v0.5 issues.

## Source Contracts

GEnCor remains the reference workflow for generated waveform and schematic docs.
The sampled GEnCor waveform specs use these fields:

```text
name
title
tb
stop_time
tb_run_args
time_start
time_end
time_unit
signals
```

The sampled GEnCor schematic specs use these fields:

```text
name
extends
title
top
flatten
include_cell_types
exclude_cell_types
include_cell_names
exclude_cell_names
include_ports
exclude_ports
include_cell_ports
exclude_cell_ports
include_glue_cell_types
glue_cell_depth
```

The current HDL Dev fixture also uses two lightweight aliases:

```text
testbench
include
```

The initial schemas should accept those aliases so the repo fixture remains
valid. Descriptions should still point users toward the GEnCor-compatible field
names, especially `tb` for waveform testbench selection.

## File Layout

Schema files live in a repo-level schema directory so they can be referenced
from `package.json` and tested independently from docs content:

```text
schemas/
  waveform-spec.schema.json
  schematic-spec.schema.json
```

The implementation uses JSON Schema draft-07 for the broadest VS Code JSON
language service compatibility.

## VS Code Contribution

The extension contributes schema associations in `package.json`:

```json
{
  "contributes": {
    "jsonValidation": [
      {
        "fileMatch": ["**/docs/waveforms/specs/*.json"],
        "url": "./schemas/waveform-spec.schema.json"
      },
      {
        "fileMatch": ["**/docs/schematics/specs/*.json"],
        "url": "./schemas/schematic-spec.schema.json"
      }
    ]
  }
}
```

No activation event is required for schema validation. The contribution should
not apply to generated JSON, package files, `build/schematics/**/*.json`, or
unrelated workspace JSON.

## Using And Extending The Schemas

Create waveform specs under `docs/waveforms/specs/*.json` and schematic specs
under `docs/schematics/specs/*.json`. VS Code applies the contributed schemas to
those files without activating HDL Dev or requiring workspace trust.

The schemas validate JSON shape, required fields, obvious scalar types, and the
documented fixture aliases. They do not run HDL tools, check signal existence,
resolve `extends`, or validate regex semantics. Use the existing Make-backed
generation commands to prove that a spec produces the expected artifact.

When adding or changing supported spec fields, update the matching file under
`schemas/`, this design document, and the representative fixtures under
`test-fixtures/spec-schemas/`. Keep aliases explicit so GEnCor-compatible fields
remain clear.

## Waveform Schema Contract

Recommended root shape:

- `type: object`
- `additionalProperties: false` after all known fields and fixture aliases are
  represented
- required `name`
- required `signals`
- require at least one of `tb` or `testbench`

Fields:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | string | yes | Spec identifier. Should match the filename stem and Make `WAVEFORM=<name>`. |
| `title` | string | no | Human-readable title for generated docs. |
| `tb` | string | one of `tb` or `testbench` | GEnCor testbench name. Preferred over `testbench`. |
| `testbench` | string | one of `tb` or `testbench` | HDL Dev fixture alias accepted for compatibility. |
| `stop_time` | string | no | GHDL stop time such as `20us`. |
| `tb_run_args` | array of strings | no | Extra Make/GHDL generic arguments, for example `-gName=value`. |
| `time_unit` | string | no | Unit for rendered timing, typically `fs`, `ps`, `ns`, `us`, `ms`, or `s`. |
| `time_start` | string | no | Crop start such as `0ns`. |
| `time_end` | string | no | Crop end such as `120ns`. |
| `signals` | array | yes | Ordered signal rows to render. Must contain at least one item. |

Signal items:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `path` | string | yes | Hierarchical signal path such as `/timer_tb/clk`. |
| `label` | string | no | Display label for the generated waveform row. |

Common pitfalls to document in schema descriptions:

- `name` controls the Make variable and generated SVG filename.
- `tb` is the GEnCor-compatible testbench field; `testbench` is accepted only as
  a fixture-friendly alias.
- Signal paths are not semantically checked until the later `ghwdump -H` picker
  work.
- Time strings are format-checked only enough to catch obvious scalar/unit
  mistakes.

## Schematic Schema Contract

Recommended root shape:

- `type: object`
- `additionalProperties: false` after all known fields and fixture aliases are
  represented
- required `name`
- do not require `top`, because inherited schematic specs can use `extends`
  instead

Fields:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | string | yes | Spec identifier. Should match the filename stem and Make `SCHEMATIC=<name>`. |
| `extends` | string | no | Base schematic spec name to inherit. |
| `title` | string | no | Human-readable generated-doc title. |
| `top` | string | no | Top VHDL entity for base schematic specs. |
| `flatten` | boolean | no | Whether synthesis should flatten hierarchy. |
| `include_cell_types` | array of strings | no | Regex filters for cell types to keep. |
| `exclude_cell_types` | array of strings | no | Regex filters for cell types to remove. |
| `include_cell_names` | array of strings | no | Regex filters for cell names to keep. |
| `exclude_cell_names` | array of strings | no | Regex filters for cell names to remove. |
| `include_ports` | array of strings | no | Regex filters for top-level ports to keep. |
| `exclude_ports` | array of strings | no | Regex filters for top-level ports to remove. |
| `include_cell_ports` | array of strings | no | Regex filters for nested cell ports to keep. |
| `exclude_cell_ports` | array of strings | no | Regex filters for nested cell ports to remove. |
| `include_glue_cell_types` | array of strings | no | Regex filters for glue cells included around focused paths. |
| `glue_cell_depth` | integer | no | Non-negative depth for glue-cell expansion. |
| `include` | array of strings | no | HDL Dev fixture alias for a small include list. |

Common pitfalls to document in schema descriptions:

- `extends` names another spec, not a file path.
- Regex strings are checked as strings by the schema; semantic regex validation
  can come later.
- `include` is a fixture-friendly alias and is not part of the sampled GEnCor
  schematic contract.
- Generated Yosys JSON remains under `build/schematics/<name>/`.

## Validation And Tests

Implementation includes focused automated checks:

- `schemas/*.schema.json` parse as JSON.
- `package.json` contributes both `jsonValidation` associations with the exact
  file matches above.
- representative valid waveform and schematic fixture specs validate against
  the schemas.
- representative invalid specs fail for missing required fields and wrong
  obvious types.
- existing lightweight fixture specs remain valid.

The extension test suite uses `ajv` as a dev dependency to validate the draft-07
schema contracts directly. VS Code UI evidence is still required before issue
closure because the automated tests do not inspect editor diagnostics or
completion UI.

Recommended fixture layout:

```text
test-fixtures/spec-schemas/
  valid/
    waveform-gencor.json
    waveform-fixture-alias.json
    schematic-base.json
    schematic-extended.json
    schematic-fixture-alias.json
  invalid/
    waveform-missing-signals.json
    waveform-bad-signals.json
    schematic-bad-glue-depth.json
```

## Evidence Plan

Before closing issue `#13`, collect:

- PR CI URL with lint, compile, extension tests, docs build, and schema checks.
- local or CI transcript for representative valid/invalid schema fixtures.
- screenshot or capture showing VS Code diagnostics or completion for a spec
  file under `docs/waveforms/specs` or `docs/schematics/specs`.
- docs link explaining how to use and extend the schemas.

The design-readiness slice moved issue `#13` from `Needs Design` to `Ready`.
