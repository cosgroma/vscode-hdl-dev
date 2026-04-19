# HDL Dev Extension Docs

This directory captures the early design notes for the HDL Dev VS Code extension.
The intent is to keep the extension aligned with VS Code's native UI surfaces
while adapting the dependency and Makefile patterns proven in GEnCor into this
repo's own extension-facing command-line workflow.

## Documents

- [VS Code Workbench References](references/vscode-workbench-surfaces.md) records
  the official VS Code docs we are using for UI and command-surface decisions.
- [GEnCor Integration Notes](integrations/gencor.md) summarizes the GEnCor flows
  we plan to adapt: dependency checks, GHDL testbench runs, waveform SVG
  generation, schematic SVG generation, and packetized-I/O debug helpers.
- [v0.1 Project Discovery And Dependency Doctor](workflows/v0.1-project-discovery-and-doctor.md)
  describes the shipped discovery and dependency-check workflow, expected
  output, trust behavior, and evidence coverage.
- [v0.2 Native Testbench Runner](workflows/v0.2-testbench-discovery.md)
  describes the `make list-tbs` discovery contract, `make test` run contract,
  Testing API surface, trust behavior, and managed Makefile pattern.
- [v0.2 Native Testbench Runner Evidence](workflows/v0.2-native-testbench-runner-evidence.md)
  records the milestone evidence scope, test coverage, artifact expectations,
  and manual transcript shape for closing v0.2.
- [v0.3 Specs Tree](workflows/v0.3-specs-tree.md) describes the HDL view
  container, Specs tree grouping, refresh behavior, context values, and
  invalid-JSON handling.
- [v0.3 Specs Tree Evidence](workflows/v0.3-specs-tree-evidence.md) records the
  milestone evidence scope, automated coverage, generated SVG fixture evidence,
  and context action capture for closing v0.3.
- [Initial Extension Design](design/initial-extension-design.md) describes the
  proposed feature areas, VS Code surfaces, and implementation boundaries.
- [Project Discovery](design/project-discovery.md) documents the passive
  detection rules and capability model for GEnCor-style HDL projects.
- [MVP Roadmap](design/mvp-roadmap.md) turns the design into a staged
  implementation plan.
- [CI GHDL Cache Strategy](design/ci-ghdl-cache.md) records how GitHub Actions
  can cache a local dependency-managed GHDL toolchain for Doctor smoke tests.
- [Git Flow](design/git-flow.md) records the repository branch model and how
  GitHub Actions enforce it.
- [GitHub Pages](design/pages.md) records the MkDocs build and Pages deployment
  setup.

## Current Direction

The extension should be a coordinator around existing HDL project scripts:

- discover project capabilities from Makefiles and spec directories
- run dependency and simulation commands with explicit environment state
- expose testbenches through the VS Code Testing API
- expose waveform and schematic specs through tree views
- open generated artifacts in editor/webview surfaces
- keep long-running command output in terminals or Output channels

GEnCor remains the reference implementation for the HDL workflows, but this
extension repo should own the scripts and Make targets it needs for CI, Doctor,
and extension-facing execution. If the extension needs stronger introspection,
the preferred path is to add machine-readable output to those local entry points.
