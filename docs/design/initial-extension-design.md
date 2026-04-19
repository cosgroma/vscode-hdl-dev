# Initial Extension Design

The HDL Dev extension should be a VS Code-native coordinator for HDL projects.
For GEnCor-derived projects, that means driving Makefile and script entry points
that follow the GEnCor patterns, then presenting tests, specs, dependencies,
logs, and generated artifacts through standard VS Code surfaces.

## Principles

- Keep repo-local HDL project scripts as the source of truth.
- Add structured UI around existing commands before inventing new workflows.
- Prefer native VS Code APIs over custom webviews.
- Treat dependency installation, bootstrapping, and command execution as
  trust-sensitive.
- Serialize shared-build-directory simulation flows.
- Add machine-readable output to project scripts when the extension needs more
  reliable introspection.

## Feature Areas

### Dependency Doctor

Purpose:

- show whether the workspace has the tools needed for simulation and generated
  documentation assets
- expose setup/bootstrap commands
- surface the selected GHDL root and resolved `ghdl`/`ghwdump` paths

Initial commands:

- `HDL Dev: Check GHDL Dependencies`
- `HDL Dev: Check Documentation Asset Dependencies`
- `HDL Dev: Bootstrap Local GHDL`
- `HDL Dev: Open Dependency Output`

Surfaces:

- Command Palette
- one Status Bar item
- optional dependency tree view
- Output channel for command logs

### Testbench Runner

Purpose:

- discover GHDL testbenches
- run one testbench with selected timing/wave options
- expose results in familiar VS Code test UI

Integration:

- discover with `make list-tbs`
- run with `make test TB=<name> STOP_TIME=<time> WAVE_FORMAT=<format>`
- serialize runs per project root

Surfaces:

- Testing API as the primary surface
- Test item context actions for wave format and artifact actions
- Output channel or terminal for raw Make/GHDL logs

### Waveform Specs

Purpose:

- make curated waveform SVG generation discoverable
- help create and validate waveform specs
- open generated SVG artifacts quickly

Integration:

- read `docs/waveforms/specs/*.json`
- run `make docs-waveforms WAVEFORM=<name>`
- optionally run with `NO_RUN=1`
- open `docs/waveforms/generated/<name>.svg`

Surfaces:

- tree view for specs
- editor for JSON specs and generated SVGs
- optional webview panel for pan/zoom and stale-artifact warnings

### Schematic Specs

Purpose:

- make structural schematic generation discoverable
- help edit focused schematic specs
- expose generated SVG and intermediate Yosys JSON

Integration:

- read `docs/schematics/specs/*.json`
- run `make docs-schematics SCHEMATIC=<name>`
- open `docs/schematics/generated/<name>.svg`
- open `build/schematics/<name>/<name>.json` when present

Surfaces:

- tree view for specs
- editor or webview panel for SVG preview
- editor for JSON specs and generated Yosys JSON

### Artifact Explorer

Purpose:

- collect generated outputs in one place
- make it easy to reopen the latest wave dump, SVG, log, or CSV artifact

Sources:

- `build/waves`
- `docs/waveforms/generated`
- `docs/schematics/generated`
- `build/schematics`
- `logs`
- `logs/plots`
- `build/csv`

Surfaces:

- tree view grouped by artifact type
- panel view only if we later need a wide session table

## Proposed View Container

Once we have more than one persistent view, add one custom Activity Bar view
container named `HDL`. Initial views:

- `Project`: detected HDL projects, Make targets, resolved toolchain state
- `Specs`: waveform and schematic specs
- `Artifacts`: generated waveforms, schematics, logs, plots, and CSVs

Keep dependency details inside `Project` at first. Split into a dedicated
`Dependencies` view only if the status tree becomes noisy.

## Command Model

Commands should remain useful without opening the custom view container:

- `HDL Dev: Discover Project`
- `HDL Dev: Check GHDL Dependencies`
- `HDL Dev: List Testbenches`
- `HDL Dev: Run Testbench`
- `HDL Dev: Generate Waveform SVG`
- `HDL Dev: Generate Schematic SVG`
- `HDL Dev: Open Latest Artifact`

All command names should use the `HDL Dev` category prefix.

## Process Execution Model

Use explicit argument arrays where possible:

```text
make test TB=timer_tb STOP_TIME=20us WAVE_FORMAT=ghw
make docs-waveforms WAVEFORM=timer_tb_control
make docs-schematics SCHEMATIC=core_gencor_type2
```

For Make variable assignments, keep each assignment as its own argument. Avoid
building shell command strings unless shell behavior is required.

Maintain a per-project run queue:

- one simulation/docs-generation process at a time for a project root
- cancellation should terminate the child process
- output should remain available after completion

## Workspace Trust

In restricted mode:

- allow passive file discovery and spec viewing
- disable dependency installation/bootstrap
- disable Make, Python, GHDL, Yosys, and netlistsvg execution
- show clear disabled-state messages on commands and views

## Configuration

Initial settings:

- `hdlDev.projectRoots`: optional explicit project roots
- `hdlDev.makeExecutable`: default `make`
- `hdlDev.defaultStopTime`: default `500us`
- `hdlDev.defaultWaveFormat`: default `ghw`
- `hdlDev.depsScript`: optional path to `scripts/deps.sh`
- `hdlDev.toolchainRoot`: optional `GHDL_TOOLCHAIN_ROOT`

Prefer auto-detection before requiring configuration.

## Future Script Improvements

The extension will be more reliable if the local dependency and Makefile entry
points grow small machine-readable outputs:

- `deps.sh check <profile> --json`
- `deps.sh env ghdl --json`
- `make print-config-json`
- waveform spec validation command
- schematic spec validation command

These are additive script features; the initial extension can still use the
current human-oriented commands.
