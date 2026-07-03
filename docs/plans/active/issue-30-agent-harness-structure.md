# Issue 30: Agent Harness Structure

Issue: <https://github.com/cosgroma/vscode-hdl-dev/issues/30>

## Goal

Initialize a lightweight agent harness structure so future Codex runs can
navigate the repository, choose work, validate changes, and collect evidence
from versioned repo-local sources.

## Scope

- Keep `AGENTS.md` concise and link to deeper docs.
- Add architecture, agent workflow, plan, quality, evidence, and directory
  index docs.
- Add a reusable HDL fixture workspace.
- Add a cheap validator and Make target for harness structure and local docs
  links.
- Add a repo-local issue-work skill that points back to the harness docs.

## Checklist

- [x] `AGENTS.md` is reduced to a concise map.
- [x] Harness docs and indexes are added under `docs/`.
- [x] `ARCHITECTURE.md` captures module boundaries and source layout.
- [x] A reusable HDL fixture is added under `test-fixtures/`.
- [x] A repo-local skill is added under `.agents/skills/`.
- [x] `make agent-harness-check` validates structure and links.
- [x] `make docs-build` passes with the new MkDocs navigation.

## Evidence

- `make agent-harness-check` passed.
- `make docs-build` passed with MkDocs strict mode.
- `make -C test-fixtures/hdl-projects/minimal list-tbs` printed `timer_tb`.
- `make -C test-fixtures/hdl-projects/minimal test TB=timer_tb STOP_TIME=20us WAVE_FORMAT=ghw` generated fixture run output.
- `make -C test-fixtures/hdl-projects/minimal docs-waveforms WAVEFORM=timer-wave` completed.
- `make -C test-fixtures/hdl-projects/minimal docs-schematics SCHEMATIC=timer-core` completed.
- `test-fixtures/hdl-projects/minimal/scripts/deps.sh check ghdl` passed.
- `test-fixtures/hdl-projects/minimal/scripts/deps.sh check docs-assets` passed.
