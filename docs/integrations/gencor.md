# GEnCor Integration Notes

This note records the GEnCor behaviors we plan to leverage from the HDL Dev
extension. The extension should call these flows rather than reimplementing
their HDL-specific logic.

## Source Locations

Current reference tree:

- `/home/cosgroma/workspace/sergeant/engines/gencor/scripts/deps.sh`
- `/home/cosgroma/workspace/sergeant/engines/gencor/scripts/lib/deps/check_impl.sh`
- `/home/cosgroma/workspace/sergeant/engines/gencor/pcores/gencor/Makefile`
- `/home/cosgroma/workspace/sergeant/engines/gencor/pcores/gencor/scripts/build_waveform_docs.py`
- `/home/cosgroma/workspace/sergeant/engines/gencor/pcores/gencor/scripts/build_schematic_docs.py`
- `/home/cosgroma/workspace/sergeant/engines/gencor/pcores/gencor/docs/waveforms/specs`
- `/home/cosgroma/workspace/sergeant/engines/gencor/pcores/gencor/docs/schematics/specs`

## Dependency Management

`scripts/deps.sh` is the dependency front door. It supports profiles such as:

- `check ghdl`
- `install ghdl`
- `check docs-assets`
- `install docs-assets`
- `bootstrap ghdl-local`

Important behavior to preserve:

- Local GHDL roots are discovered from `GHDL_TOOLCHAIN_ROOT`,
  `GENCOR_GHDL_ROOT`, repo `ext/installs`, and `~/ghdl-bootstrap/installs`.
- When a local GHDL root is active, `GHDL_TOOLCHAIN_ROOT` is exported and the
  local `bin` directory is prepended to `PATH`.
- `ghwdump` should come from the same local GHDL root when local GHDL is active.
- Waveform documentation requires `ghwdump -H` support for full hierarchy paths.
- `docs-assets` checks schematic and waveform rendering dependencies such as
  `yosys`, `node`, `npm`, and global `netlistsvg`.

Extension implication:

- The extension should expose dependency status and setup commands, but should
  not duplicate package-manager or GHDL bootstrap logic.
- A future improvement to GEnCor would be a machine-readable dependency query,
  for example `deps.sh check ghdl --json` or `deps.sh env ghdl`, so the
  extension can learn resolved tool paths and status without parsing prose.

## GHDL Testbench Runner

The Makefile is the stable integration boundary:

```bash
make list-tbs
make test TB=<testbench> STOP_TIME=<time> WAVE_FORMAT=ghw|fst|vcd
make test-all STOP_TIME=<time> WAVE_FORMAT=ghw|fst|vcd
```

Important Makefile variables:

- `GHDL_TOOLCHAIN_ROOT`
- `GHDL`
- `GHWDUMP`
- `STD`
- `GHDL_FLAGS`
- `GHDL_RUN_OPTS`
- `GHDL_VENDOR_LIB_ROOT`
- `TB`
- `STOP_TIME`
- `WAVE_FORMAT`
- `TB_RUN_ARGS`

Artifacts:

- GHDL work libraries: `build/ghdl/...`
- Wave dumps: `build/waves/<tb>.ghw`, `.fst`, or `.vcd`

Operational constraint:

- Do not run multiple GHDL/Make test flows concurrently in the same build
  directory. The extension should serialize runs per detected project root.

## Waveform SVG Generation

Waveform specs live under:

```text
docs/waveforms/specs/*.json
```

Typical Makefile commands:

```bash
make docs-waveforms
make docs-waveforms WAVEFORM=timer_tb_control
make docs-waveforms WAVEFORM=timer_tb_control NO_RUN=1
```

The Python helper:

- loads JSON specs
- reruns required testbenches with `WAVE_FORMAT=ghw` unless `NO_RUN=1`
- uses `ghwdump -H` to map signal hierarchy paths to signal IDs
- uses `ghwdump -T -s -f <ids>` to load selected signal snapshots
- crops the time window from the spec
- writes static SVGs to `docs/waveforms/generated/<spec>.svg`

Spec fields currently include:

- `name`
- `title`
- `tb`
- `stop_time`
- `tb_run_args`
- `time_start`
- `time_end`
- `time_unit`
- `signals`

Extension feature opportunities:

- List waveform specs in a tree view.
- Generate a selected waveform SVG.
- Reuse an existing `.ghw` with `NO_RUN=1`.
- Open the generated SVG.
- Validate that requested signal paths exist in the latest `.ghw`.
- Offer a signal picker from `ghwdump -H` output.
- Scaffold a new waveform spec for the active testbench.

## Schematic SVG Generation

Schematic specs live under:

```text
docs/schematics/specs/*.json
```

Typical Makefile commands:

```bash
make docs-schematics
make docs-schematics SCHEMATIC=core_gencor_type2
make docs-schematics SCHEMATIC=core_ch_strobe_focus
make docs-schematics SCHEMATIC=core_first_correlator_path
```

The Python helper:

- loads schematic specs with optional `extends` inheritance
- sanitizes VHDL sources before synthesis
- analyzes packages, support libraries, and RTL with GHDL
- detects `GHDL_PREFIX` when needed
- runs `yosys -m ghdl`
- writes Yosys JSON under `build/schematics/<spec>/`
- filters ports/cells/netnames based on spec rules
- runs `netlistsvg`
- writes SVGs to `docs/schematics/generated/<spec>.svg`

Spec fields currently include:

- `name`
- `extends`
- `title`
- `top`
- `flatten`
- `include_cell_types`
- `exclude_cell_types`
- `include_cell_names`
- `exclude_cell_names`
- `include_ports`
- `exclude_ports`
- `include_cell_ports`
- `exclude_cell_ports`
- `include_glue_cell_types`
- `glue_cell_depth`

Extension feature opportunities:

- List schematic specs in a tree view.
- Generate a selected schematic SVG.
- Open the generated SVG and intermediate JSON.
- Validate spec inheritance and regex fields.
- Add JSON schemas for editing support.
- Provide focused schematic presets for common top-level debug questions.

## Packetized-I/O Debug Helpers

GEnCor also has a debug flow around:

- `tools/run_pktio_corr_log.py`
- `tools/compare_pktio_corr_log.py`
- `tools/plot_corr_log_correlations.py`
- CSV-capable testbenches and `logs/plots/*.svg`

This is a later extension feature. It fits as a "debug session" workflow with
presets for prompt-2/prompt-4 controls, timestamped run logs, comparison CSVs,
and generated correlation plot SVGs.
