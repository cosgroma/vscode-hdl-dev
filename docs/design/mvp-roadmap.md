# MVP Roadmap

This roadmap keeps the first implementation focused on useful, low-risk
coordination around the existing GEnCor workflow.

## Stage 1: Project Discovery And Dependency Doctor

Deliverables:

- detect a GEnCor-style project root by finding the pcore Makefile and docs spec
  directories
- add an Output channel
- add `HDL Dev: Check GHDL Dependencies`
- add `HDL Dev: Check Documentation Asset Dependencies`
- display one Status Bar item with dependency state

Notes:

- run `scripts/deps.sh check ghdl` and `scripts/deps.sh check docs-assets`
- parse only coarse pass/fail status at first
- keep full command output in the Output channel

## Stage 2: Native Testbench Runner

Deliverables:

- create a `TestController`
- discover testbenches with `make list-tbs`
- add one run profile for `make test`
- expose default `STOP_TIME` and `WAVE_FORMAT` settings
- publish pass/fail/error result state
- append raw command output to the test run output

Notes:

- use a per-project run queue
- start with run support only; debug support can come later
- attach context actions for opening wave artifacts after a run

## Stage 3: Specs Tree

Deliverables:

- add one `HDL` view container
- add a `Specs` tree view
- list waveform specs from `docs/waveforms/specs`
- list schematic specs from `docs/schematics/specs`
- add context actions:
  - open spec JSON
  - generate SVG
  - generate waveform SVG without rerun
  - open generated SVG

Notes:

- tree items should describe specs; actions live in context menus and toolbars
- generated SVG open can use the normal editor initially

## Stage 4: Artifact Explorer

Deliverables:

- add an `Artifacts` tree view
- group artifacts by waves, waveform SVGs, schematic SVGs, schematic JSON, logs,
  plots, and CSV directories
- refresh artifacts after commands complete
- add open/reveal/copy-path commands

Notes:

- keep this native tree-based at first
- add webview preview only after the artifact navigation is useful

## Stage 5: Interactive Preview And Spec Authoring

Deliverables:

- add JSON schemas for waveform and schematic specs
- add a waveform signal picker based on `ghwdump -H`
- scaffold a waveform spec from a selected testbench and signals
- add pan/zoom webview preview for large schematic SVGs
- add stale-artifact indicators comparing spec and output mtimes

Notes:

- webview content should stay focused on generated artifact inspection
- spec creation should still write normal JSON files into the project tree

## Stage 6: Packetized-I/O Debug Sessions

Deliverables:

- add commands around `tools/run_pktio_corr_log.py`
- support prompt-2 and prompt-4 preset runs
- open comparison CSV and generated plot SVGs
- group logs/plots under a debug session node

Notes:

- this should come after the base run/spec/artifact loop works
- preserve raw script output and generated files as the authoritative artifacts
