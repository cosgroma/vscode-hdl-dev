# Agent Harness

The agent harness is the repo-local structure that lets Codex and other coding
agents understand the project, choose the right work, make small changes, and
prove those changes without relying on chat history or private context.

This follows the harness engineering pattern described by OpenAI: keep the
instruction entry point short, make repository knowledge the source of truth,
and enforce repeatable rules with scripts and tests where possible.

Reference: <https://openai.com/index/harness-engineering/>

## Navigation

| Need | Source |
| --- | --- |
| Repository instructions | `AGENTS.md` |
| Architecture and module boundaries | `ARCHITECTURE.md` |
| Issue queue, git-flow, commits, and evidence | `docs/agent/issue-workflow.md` |
| Surface-specific validation commands | `docs/agent/validation.md` |
| Active and completed execution plans | `docs/plans/README.md` |
| Golden principles and recurring cleanup | `docs/quality/golden-principles.md` |
| Known debt and follow-up candidates | `docs/quality/tech-debt-tracker.md` |
| Reusable HDL workspaces | `test-fixtures/hdl-projects/` |

## Agent Loop

1. Read `AGENTS.md`, then follow the links for the touched surface.
2. Identify the issue and branch type before editing.
3. Read the relevant architecture, design, workflow, and evidence docs.
4. Create or update an execution plan for multi-step work.
5. Keep implementation changes narrow and issue-scoped.
6. Run the validation commands for the touched surface.
7. Record evidence in the issue, PR, or relevant docs.
8. Commit a coherent chunk that references the issue number.

## Repo-Local Skill

This repo includes `.agents/skills/hdl-dev-issue-work/SKILL.md` for repeatable
issue-scoped HDL Dev work. Use it when a task asks to implement, review, or
finish a GitHub issue in this repository.

The skill intentionally points back to this knowledge base instead of
duplicating every rule. Update the docs first when the workflow changes.
