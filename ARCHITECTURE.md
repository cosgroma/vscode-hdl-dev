# Architecture

HDL Dev is a VS Code-native coordinator around HDL project scripts. The
extension should make existing Makefile and script workflows discoverable,
trust-aware, and inspectable without replacing the HDL project's own source of
truth.

## Source Map

| Path | Responsibility |
| --- | --- |
| `src/extension.ts` | Extension activation, shared Output channel, status item, and command registration. |
| `src/discovery/` | Passive HDL project discovery. This layer reads files only and does not require workspace trust. |
| `src/doctor/` | Dependency Doctor command orchestration around repo-local dependency scripts. This layer is trust-sensitive because it executes workspace code. |
| `src/testbench/` | VS Code Testing API integration, Make-backed testbench discovery, and serialized testbench execution. |
| `src/specs/` | Waveform and schematic spec discovery, Specs tree presentation, and Make-backed SVG generation commands. |
| `src/artifacts/` | Passive generated artifact discovery, Artifacts tree presentation, and open/reveal/copy commands. |
| `src/test/` | Extension and service tests. Tests should prefer core services with injected hosts before full VS Code integration when possible. |
| `scripts/` | Repository-owned dependency and validation entry points. These scripts are the automation surface for agents and CI. |
| `docs/` | Versioned design, workflow, evidence, and agent-harness knowledge. |
| `test-fixtures/` | Reusable local projects and files for tests, reproduction, and manual evidence. |

## Boundary Rules

- Passive discovery is allowed before workspace trust. It may inspect files and
  directories, but it must not run Make, shell scripts, Python, GHDL, Yosys, or
  `netlistsvg`.
- Execution paths must check workspace trust before running workspace-owned
  scripts or tools.
- Process requests should keep the executable and arguments separate. Make
  variable assignments such as `TB=timer_tb` and `STOP_TIME=500us` should be
  individual arguments.
- Commands that share a project build directory must serialize per project root.
- Raw command output belongs in the HDL Dev Output channel or test output. Do
  not replace raw logs with summarized status only.
- Tree views are passive indexes and command launch points. They should not
  mutate files during refresh.
- Webviews are reserved for inspection workflows that native editors or tree
  views cannot handle well.

## Extension Shape

The extension favors small service modules with testable core behavior and thin
VS Code registration layers:

1. Build a pure request or discovery model.
2. Inject filesystem, process, output, or VS Code host dependencies at the edge.
3. Preserve raw output and structured result state.
4. Register VS Code commands, views, and Testing API objects around that core.

This keeps most behavior verifiable in `src/test/` without launching a full
workspace for every case, while still allowing focused VS Code integration tests
where the extension contribution surface matters.

## Script Contracts

HDL Dev should keep local HDL project scripts and Make targets authoritative.
Current extension-facing contracts include:

```text
scripts/deps.sh check ghdl
scripts/deps.sh check docs-assets
make list-tbs
make test TB=<name> STOP_TIME=<time> WAVE_FORMAT=<format>
make docs-waveforms WAVEFORM=<name>
make docs-waveforms WAVEFORM=<name> NO_RUN=1
make docs-schematics SCHEMATIC=<name>
```

Future machine-readable outputs should be additive. Prefer adding JSON modes to
the scripts when the extension needs reliable introspection instead of scraping
human-oriented output.

## Documentation Contract

`AGENTS.md` is the compact entry point. Durable details live in versioned docs:

- `docs/agent/` for agent workflow and validation.
- `docs/design/` for design decisions and roadmap.
- `docs/workflows/` for shipped workflow contracts and milestone evidence.
- `docs/plans/` for execution plans that need progress logs.
- `docs/quality/` for golden principles and debt tracking.
- `docs/references/` for external API and UX references.

When a human preference or review comment should affect future agent work, add
it to one of those sources or encode it in a script/test. Avoid turning
`AGENTS.md` into a long manual.
