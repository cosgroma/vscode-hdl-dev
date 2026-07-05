---
name: hdl-dev-issue-work
description: Use when implementing, reviewing, or finishing issue-scoped work in the vscode-hdl-dev repository; follows the repo's GitHub Project queue, git-flow branch model, validation matrix, and evidence requirements.
---

# HDL Dev Issue Work

Use this skill for issue-scoped work in `cosgroma/vscode-hdl-dev`.

1. Read `AGENTS.md`, `docs/agent/issue-workflow.md`, `docs/agent/validation.md`,
   and `ARCHITECTURE.md`.
2. Identify the issue. If the user did not name one, use the Ready Queue rules
   in `docs/agent/issue-workflow.md`.
3. Start from `develop` and create the matching git-flow branch.
4. Read the workflow, design, and evidence docs for the touched surface.
5. Keep implementation changes narrow and issue-scoped.
6. Run the validation commands from `docs/agent/validation.md`.
7. Commit a coherent chunk that references the issue number.
8. In the handoff, include issue, files changed, checks, commit SHA, evidence,
   and the recommended next chunk.

Do not duplicate the full workflow here. Update the repo docs when the durable
process changes.
