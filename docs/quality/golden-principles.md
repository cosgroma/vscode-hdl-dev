# Golden Principles

These principles capture recurring architectural and workflow preferences that
should shape future agent work. Promote a principle into a script, lint, or test
when it becomes mechanically checkable.

## Product And Workflow

- HDL project repositories remain the source of truth. HDL Dev coordinates
  local Make targets, scripts, specs, and generated artifacts rather than
  replacing them.
- Native VS Code surfaces come first: commands, Output channels, the Testing
  API, tree views, status items, and normal editors.
- Webviews should be focused artifact inspection tools, not the default UI
  surface.
- Public docs, design docs, workflow docs, plans, and evidence should be
  versioned in the repository.

## Safety And Reliability

- Passive discovery must not execute workspace code.
- Execution paths must respect workspace trust before running scripts or tools.
- Shared project build directories require serialized command execution.
- Raw command output should stay visible for diagnosis.
- Machine-readable outputs should be added at the script boundary when the
  extension needs reliable introspection.

## Agent Legibility

- `AGENTS.md` is a map, not a manual.
- New durable knowledge belongs in structured docs or executable checks.
- Reusable reproduction state belongs in `test-fixtures/`.
- Repeated review feedback should become a doc rule, test, script, or lintable
  invariant.
- Prefer boring, inspectable dependencies and small local helpers when they make
  behavior easier to reason about and test.
