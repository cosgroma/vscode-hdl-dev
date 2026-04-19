# HDL Dev Extension Docs

This directory captures the early design notes for the HDL Dev VS Code extension.
The intent is to keep the extension aligned with VS Code's native UI surfaces
while reusing the existing GEnCor command-line workflow instead of rebuilding it
inside TypeScript.

## Documents

- [VS Code Workbench References](references/vscode-workbench-surfaces.md) records
  the official VS Code docs we are using for UI and command-surface decisions.
- [GEnCor Integration Notes](integrations/gencor.md) summarizes the GEnCor flows
  we plan to leverage: dependency checks, GHDL testbench runs, waveform SVG
  generation, schematic SVG generation, and packetized-I/O debug helpers.
- [Initial Extension Design](design/initial-extension-design.md) describes the
  proposed feature areas, VS Code surfaces, and implementation boundaries.
- [MVP Roadmap](design/mvp-roadmap.md) turns the design into a staged
  implementation plan.
- [CI GHDL Cache Strategy](design/ci-ghdl-cache.md) records how GitHub Actions
  can cache a local dependency-managed GHDL toolchain for Doctor smoke tests.

## Current Direction

The extension should be a coordinator around existing HDL project scripts:

- discover project capabilities from Makefiles and spec directories
- run dependency and simulation commands with explicit environment state
- expose testbenches through the VS Code Testing API
- expose waveform and schematic specs through tree views
- open generated artifacts in editor/webview surfaces
- keep long-running command output in terminals or Output channels

The GEnCor scripts remain the source of truth for dependency and build behavior.
If the extension needs stronger introspection, the preferred path is to add
machine-readable output to those scripts rather than duplicate their logic.
