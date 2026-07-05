# Technical Debt Tracker

Track known debt here when it is not yet ready for its own implementation issue
or when it cuts across multiple milestones. Prefer creating a GitHub issue once
the scope and evidence requirements are clear.

| Area | Debt | Current handling | Candidate follow-up |
| --- | --- | --- | --- |
| Dependency Doctor | Doctor consumes human-readable script output and process exit status. | Preserve raw output and use coarse pass/fail status. | Add `scripts/deps.sh check <profile> --json` when extension introspection needs it. |
| Toolchain bootstrap | Local GHDL bootstrap is Linux x86_64 first. | Document as a known limitation. | Add platform detection and non-Linux guidance. |
| Specs | Waveform and schematic specs do not yet have JSON schemas. | Specs tree parses JSON and reports invalid files. | Implement schema files and validation commands. |
| Artifacts | Latest-artifact command is planned but not implemented. | Artifact tree supports open, reveal, and copy-path actions. | Add command once artifact selection policy is defined. |
| Preview | SVG previews use normal editors only. | Keep generated SVGs directly openable. | Add focused pan/zoom preview after artifact navigation is stable. |
| Agent harness | Harness structure is new and only lightly validated. | `make agent-harness-check` validates required files, links, and MkDocs nav. | Add more structural checks only after repeated drift appears. |
