# Evidence

This directory stores versioned evidence artifacts that are useful to keep with
the repository, such as screenshots for milestone evidence. Prefer issue or PR
comments for long command transcripts and hosted CI links.

## Naming

Use filenames that include the issue number and what the artifact proves:

```text
issue-11-artifact-actions.png
```

## Evidence Checklist

Good issue evidence usually includes:

- local command output or CI run URLs for relevant checks
- screenshots or short captures for visible VS Code surfaces
- fixture paths and exact commands for manual reproduction
- documentation links when behavior changes user-facing contracts

Keep evidence small and focused. Do not check in generated output unless it is
needed for review or future regression comparison.
