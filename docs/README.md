# HDL Dev Extension Docs

This directory is the repository knowledge base for HDL Dev. It keeps design
direction, workflow contracts, validation rules, evidence, and agent harness
materials versioned with the code.

## Document Areas

- [Agent Harness](agent/README.md) maps the repo-local workflow, validation, and
  issue-driven development structure for Codex and other coding agents.
- [Design](design/index.md) indexes design direction, roadmap, and repository
  infrastructure decisions.
- [Workflows](workflows/index.md) indexes shipped workflow contracts and
  milestone evidence notes.
- [References](references/index.md) indexes external API, UX, and integration
  references.
- [Plans](plans/README.md) explains active and completed execution plans.
- [Quality](quality/golden-principles.md) captures durable principles, while
  [Technical Debt Tracker](quality/tech-debt-tracker.md) tracks known debt.
- [Evidence](evidence/README.md) explains versioned evidence artifacts.
- [GEnCor Integration Notes](integrations/gencor.md) summarizes the GEnCor flows
  adapted by this repository.

## Current Direction

The extension should be a coordinator around existing HDL project scripts:

- discover project capabilities from Makefiles and spec directories
- run dependency and simulation commands with explicit environment state
- expose testbenches through the VS Code Testing API
- expose waveform and schematic specs through tree views
- expose generated artifacts through tree views and editor surfaces
- keep long-running command output in terminals or Output channels

GEnCor remains the reference implementation for the HDL workflows, but this
extension repo should own the scripts and Make targets it needs for CI, Doctor,
and extension-facing execution. If the extension needs stronger introspection,
the preferred path is to add machine-readable output to those local entry points.
