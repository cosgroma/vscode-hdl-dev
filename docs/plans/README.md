# Execution Plans

Execution plans are versioned task records for work that needs more structure
than a short prompt. They let agents resume work without relying on chat history
and keep decisions, progress, and evidence close to the code.

## Layout

```text
docs/plans/
  active/      in-progress issue plans and progress logs
  completed/   historical plans that landed and no longer need updates
  templates/   reusable plan templates
```

Use lightweight plans for small changes and fuller plans for multi-step issues,
cross-module behavior, UI evidence, or work that may span multiple sessions.

## Plan Rules

- Name active plans with the issue number and short slug.
- Keep acceptance criteria visible until the issue is accepted.
- Update checkboxes and evidence notes as work proceeds.
- Move a plan to `completed/` only when the issue is complete or a maintainer
  explicitly closes the plan.
- Prefer links to source docs, issue comments, and evidence artifacts instead of
  copying long transcripts into the plan.
