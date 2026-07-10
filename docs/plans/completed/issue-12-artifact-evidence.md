# Issue 12: Artifact Explorer Evidence

Issue: <https://github.com/cosgroma/vscode-hdl-dev/issues/12>

## Goal

Close the v0.4 Artifact Explorer milestone evidence gap by documenting the
artifact directory contract, shipped behavior, automated coverage, fixture
evidence, and manual UI evidence for generated artifact navigation.

## Scope

- Add a v0.4 Artifact Explorer evidence page.
- Link the evidence page from MkDocs and repository docs indexes.
- Reuse the `test-fixtures/hdl-projects/minimal` workspace for reproducible
  artifact evidence.
- Record local validation and issue evidence.

Out of scope:

- New Artifact Explorer feature work.
- New screenshot capture unless existing versioned evidence is insufficient.
- Preview/webview work, latest-artifact command work, or stale-artifact work.

## Checklist

- [x] Evidence page documents artifact directories and producing commands.
- [x] Evidence page records automated test coverage for discovery, grouping,
  actions, refresh, and empty/error states.
- [x] Evidence page records fixture-backed manual artifact evidence.
- [x] Existing screenshot evidence is referenced for the visible Artifacts tree
  and context actions.
- [x] MkDocs navigation includes the evidence page.
- [x] Local checks pass.
- [x] Issue evidence comment is added.

## Decisions

- Reuse `docs/evidence/issue-11-artifact-actions.png` for the v0.4 milestone
  screenshot because it already shows the populated Artifacts tree and the
  artifact context menu.
- Keep this slice documentation/evidence-only; implementation issues `#10` and
  `#11` already landed and are accepted.

## Evidence

Fixture smoke evidence collected:

- `make -C test-fixtures/hdl-projects/minimal list-tbs` printed `timer_tb`.
- `make -C test-fixtures/hdl-projects/minimal test TB=timer_tb STOP_TIME=20us WAVE_FORMAT=ghw` completed and produced `build/waves/timer_tb.ghw`.
- `make -C test-fixtures/hdl-projects/minimal docs-waveforms WAVEFORM=timer-wave` completed and produced `docs/waveforms/generated/timer-wave.svg`.
- `make -C test-fixtures/hdl-projects/minimal docs-schematics SCHEMATIC=timer-core` completed and produced `docs/schematics/generated/timer-core.svg` plus `build/schematics/timer-core/timer-core.json`.
- `test-fixtures/hdl-projects/minimal/scripts/deps.sh check ghdl` passed.
- `test-fixtures/hdl-projects/minimal/scripts/deps.sh check docs-assets` passed.
- `find test-fixtures/hdl-projects/minimal/build test-fixtures/hdl-projects/minimal/docs test-fixtures/hdl-projects/minimal/logs -type f | sort` showed all seven artifact groups.

Local validation:

- `npm run lint` passed.
- `npm run compile` passed.
- `npm test` passed with 51 tests.
- `make docs-build` passed with MkDocs strict mode.
- `make agent-harness-check` passed.

## Closeout

- Issue `#12` closed after PR `#32` merged.
- Project fields were updated to `Readiness = Done` and
  `Evidence State = Accepted`.
