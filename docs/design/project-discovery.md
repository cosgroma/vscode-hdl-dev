# Project Discovery

HDL Dev discovers projects passively. Discovery reads the workspace filesystem
and does not run Make, shell scripts, Python, GHDL, Yosys, or `netlistsvg`.
That keeps discovery available before workspace trust is granted and gives later
commands a stable model to decide what needs trust-gated execution.

## Candidate Roots

Discovery starts from:

- VS Code workspace folders
- optional configured roots from `hdlDev.projectRoots`

Workspace folders are searched to a bounded depth for project roots. Configured
roots are treated as explicit project root candidates. Relative configured roots
resolve under each workspace folder.

## Detection Rules

A directory is a detected HDL project when it has:

- `Makefile`
- at least one GEnCor-style spec directory:
  - `docs/waveforms/specs`
  - `docs/schematics/specs`

The spec directories are capability signals, not a requirement that both flows
exist. A waveform-only project and a schematic-only project are both valid HDL
projects.

Directories with only a `Makefile` are ignored because HDL Dev cannot infer the
GEnCor-style workflow surface. Directories with only spec folders are also
ignored because the Makefile is the execution boundary for later commands.

## Project Model

Each discovered project records absolute paths for:

- project root
- `Makefile`
- `scripts/deps.sh`
- waveform and schematic spec directories
- GHDL build directory: `build/ghdl`
- wave dump directory: `build/waves`
- schematic build directory: `build/schematics`
- CSV build directory: `build/csv`
- generated waveform SVGs: `docs/waveforms/generated`
- generated schematic SVGs: `docs/schematics/generated`
- logs: `logs`
- plots: `logs/plots`

Optional paths are represented as capabilities with an `available` flag and a
status such as `present`, `missingOptionalDirectory`, or `missingOptionalFile`.
Missing optional directories are therefore visible to views and commands without
failing passive discovery.

## Trust Boundary

The current discovery mode is `passive-file-scan`:

- `executedWorkspaceCommands: false`
- `requiresWorkspaceTrust: false`

Later workflows can use this model to enable passive browsing in restricted
mode while keeping Make, dependency scripts, simulation, and artifact generation
behind workspace trust checks.
